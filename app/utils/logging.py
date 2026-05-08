"""Structured JSON logging with per-run folder support.

Two halves:

1. :func:`configure_logging` wires the root logger to stderr with a JSON
   formatter so Domino's stderr capture sees structured records.
2. :class:`RunFolder` represents the per-run on-disk artefact area
   (``logging/<timestamp>_<run_id>/``) — events.jsonl, meta.json, artifacts/.

The format is intentionally Databricks-friendly: each record is a single JSON
object on its own line with a stable schema.
"""

from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone  # noqa: UP017 - 3.9-compat alias below
from pathlib import Path
from typing import Any

# why: ``datetime.UTC`` only exists on 3.11+. We support 3.9+ so we alias the
# constant once here and reference it from the rest of the module.
UTC = timezone.utc  # noqa: UP017

# why: keep field names stable — downstream log shipping (Databricks) relies on
# this exact schema.
_BASE_FIELDS = ("ts", "level", "logger", "event", "run_id")


class JsonFormatter(logging.Formatter):
    """Format log records as one JSON object per line."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: D401 - Logger API
        payload: dict[str, Any] = {
            "ts": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.") + f"{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
        }
        # ``extra={...}`` ends up on the record as attributes; preserve any of
        # the well-known fields plus anything else the caller attached.
        for attr, val in record.__dict__.items():
            if attr.startswith("_"):
                continue
            if attr in {
                "args",
                "msg",
                "levelname",
                "levelno",
                "pathname",
                "filename",
                "module",
                "exc_info",
                "exc_text",
                "stack_info",
                "lineno",
                "funcName",
                "created",
                "msecs",
                "relativeCreated",
                "thread",
                "threadName",
                "processName",
                "process",
                "name",
                "message",
                "taskName",
            }:
                continue
            payload[attr] = val

        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


_CONFIGURED = False


def configure_logging(level: str = "INFO") -> None:
    """Install the JSON formatter on the root logger.

    Idempotent: safe to call from both ``create_app`` and tests.

    Args:
        level: Log level name (``DEBUG``, ``INFO``, ...).
    """

    global _CONFIGURED
    if _CONFIGURED:
        return

    handler = logging.StreamHandler(stream=sys.stderr)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    _CONFIGURED = True


@dataclass
class RunMeta:
    """Metadata persisted alongside a run folder."""

    run_id: str
    kind: str
    started_at: str
    finished_at: str | None = None
    outcome: str | None = None
    params: dict[str, Any] = field(default_factory=dict)


class RunFolder:
    """A per-run artefact directory.

    Layout::

        logging/2026-05-07T14-32-11Z_abc12345/
            meta.json
            events.jsonl
            artifacts/

    The folder is created on first use. ``log_event`` appends a JSON line to
    ``events.jsonl``. ``finalize`` writes ``meta.json``.
    """

    def __init__(self, base_dir: Path, kind: str, run_id: str | None = None) -> None:
        self.run_id = run_id or uuid.uuid4().hex[:8]
        ts = datetime.now(UTC).strftime("%Y-%m-%dT%H-%M-%SZ")
        self.path = base_dir / f"{ts}_{self.run_id}"
        self.artifacts = self.path / "artifacts"
        self.events_file = self.path / "events.jsonl"
        self.meta_file = self.path / "meta.json"
        self.meta = RunMeta(
            run_id=self.run_id,
            kind=kind,
            started_at=datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        )
        self._t_start = time.monotonic()

    def ensure(self) -> None:
        """Create the on-disk folder layout if needed."""

        self.artifacts.mkdir(parents=True, exist_ok=True)

    def log_event(self, event: str, **extra: Any) -> None:
        """Append a structured event to ``events.jsonl``.

        Args:
            event: Short event name, e.g. ``"section_extracted"``.
            **extra: Additional structured fields to record.
        """

        self.ensure()
        record = {
            "ts": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "run_id": self.run_id,
            "event": event,
        }
        record.update(extra)
        with self.events_file.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, default=str) + "\n")

    def finalize(self, outcome: str = "succeeded", **params: Any) -> None:
        """Write ``meta.json`` for the run.

        Args:
            outcome: ``succeeded`` | ``failed`` | ``cancelled``.
            **params: Additional params to persist.
        """

        self.ensure()
        self.meta.finished_at = datetime.now(UTC).isoformat(timespec="milliseconds").replace(
            "+00:00", "Z"
        )
        self.meta.outcome = outcome
        if params:
            self.meta.params.update(params)
        elapsed_ms = int((time.monotonic() - self._t_start) * 1000)
        payload = asdict(self.meta)
        payload["duration_ms"] = elapsed_ms
        self.meta_file.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")


@contextmanager
def run_folder(base_dir: Path, kind: str, run_id: str | None = None) -> Iterator[RunFolder]:
    """Context manager that creates a :class:`RunFolder` and finalises it.

    Yields the folder. On exception, finalises with ``outcome="failed"``.
    """

    folder = RunFolder(base_dir, kind, run_id=run_id)
    try:
        yield folder
    except Exception:
        folder.finalize(outcome="failed")
        raise
    else:
        if folder.meta.outcome is None:
            folder.finalize(outcome="succeeded")
