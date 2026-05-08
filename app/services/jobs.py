"""In-memory background job registry backed by a thread pool.

API surface:

* :func:`submit` — enqueue a callable, return ``job_id``.
* :func:`status` — polled by the frontend every 1s.
* :func:`cancel` — best-effort cancellation; the worker checks the flag.
* :func:`stats` — counts surfaced in ``/api/health``.

Job records carry a ``progress`` int (0–100), a ``message`` string, and either
``result`` or ``error`` once finished. They evict after one hour to keep
process memory bounded.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

from app.config import get_settings

_log = logging.getLogger(__name__)

# why: a single hour is enough for the analyst to grab a result without
# accumulating stale state across the day.
_TTL_SECONDS = 60 * 60


@dataclass
class JobHandle:
    """Public, JSON-serialisable view of a job."""

    job_id: str
    state: str = "queued"
    progress: int = 0
    message: str = ""
    result: Any = None
    error: str | None = None
    started_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    cancel_requested: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "state": self.state,
            "progress": self.progress,
            "message": self.message,
            "result": self.result,
            "error": self.error,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
        }


@dataclass
class _Slot:
    handle: JobHandle
    future: Future | None = None


class JobContext:
    """Passed to job functions so they can update progress and check cancellation."""

    def __init__(self, slot: _Slot) -> None:
        self._slot = slot

    def update(self, *, progress: int | None = None, message: str | None = None) -> None:
        if progress is not None:
            self._slot.handle.progress = max(0, min(100, int(progress)))
        if message is not None:
            self._slot.handle.message = message

    def cancelled(self) -> bool:
        return self._slot.handle.cancel_requested


_executor: ThreadPoolExecutor | None = None
_jobs: dict[str, _Slot] = {}
_lock = threading.RLock()


def _get_executor() -> ThreadPoolExecutor:
    global _executor
    if _executor is None:
        workers = max(1, get_settings().pdf_workers)
        _executor = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="lisa-job")
    return _executor


def submit(func: Callable[[JobContext], Any], *, kind: str = "task") -> str:
    """Submit a callable to the pool and return its ``job_id``.

    Args:
        func: A callable taking a :class:`JobContext` and returning the result
            payload (must be JSON-serialisable).
        kind: Short label for telemetry only.
    """

    job_id = uuid.uuid4().hex
    handle = JobHandle(job_id=job_id, state="queued", message=kind)
    slot = _Slot(handle=handle)
    ctx = JobContext(slot)

    def _run() -> Any:
        slot.handle.state = "running"
        slot.handle.message = f"{kind}: running"
        try:
            return func(ctx)
        finally:
            slot.handle.finished_at = time.time()

    with _lock:
        _jobs[job_id] = slot
        _evict_expired_locked()
        slot.future = _get_executor().submit(_run)

    def _on_done(fut: Future) -> None:
        try:
            slot.handle.result = fut.result()
            slot.handle.state = "cancelled" if slot.handle.cancel_requested else "succeeded"
            if slot.handle.state == "succeeded":
                slot.handle.progress = 100
                slot.handle.message = f"{kind}: complete"
        except Exception as exc:  # noqa: BLE001 - we want to report any error
            slot.handle.state = "failed"
            slot.handle.error = str(exc)
            slot.handle.message = f"{kind}: failed"
            _log.exception("job_failed", extra={"job_id": job_id, "kind": kind})

    slot.future.add_done_callback(_on_done)
    return job_id


def status(job_id: str) -> dict[str, Any] | None:
    """Return the status dict for ``job_id``, or ``None`` if unknown."""

    with _lock:
        slot = _jobs.get(job_id)
        if slot is None:
            return None
        return slot.handle.to_dict()


def cancel(job_id: str) -> bool:
    """Request best-effort cancellation. Returns ``True`` if the job exists."""

    with _lock:
        slot = _jobs.get(job_id)
        if slot is None:
            return False
        slot.handle.cancel_requested = True
        slot.handle.message = "cancellation requested"
        return True


def stats() -> dict[str, int]:
    """Return ``{active, queued}`` counts for ``/api/health.jobs``."""

    with _lock:
        active = 0
        queued = 0
        for slot in _jobs.values():
            if slot.handle.state == "running":
                active += 1
            elif slot.handle.state == "queued":
                queued += 1
        return {"active": active, "queued": queued}


def _evict_expired_locked() -> None:
    """Drop finished jobs whose TTL has expired. Caller holds ``_lock``."""

    now = time.time()
    expired = [
        job_id
        for job_id, slot in _jobs.items()
        if slot.handle.finished_at is not None
        and now - slot.handle.finished_at > _TTL_SECONDS
    ]
    for job_id in expired:
        _jobs.pop(job_id, None)


def reset_for_tests() -> None:
    """Drop pool + registry. Tests only."""

    global _executor
    with _lock:
        _jobs.clear()
        if _executor is not None:
            _executor.shutdown(wait=False, cancel_futures=True)
            _executor = None
