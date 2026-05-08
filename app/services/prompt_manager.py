"""Override-aware prompt loader.

The mode-runners (``extraction.py``, ``qa.py``, ``scenario.py``) read prompts
through this module rather than ``Path.read_text`` directly. That gives the
forthcoming dev panel a single point of truth for runtime prompt edits.

Lookup order:

1. ``app/prompts/dev_overrides/<mode>.json`` — written by
   :func:`set_override`. Survives process restarts in dev.
2. ``app/prompts/<mode>_system.txt`` and ``<mode>_user.txt`` — the bundled
   defaults. ``<mode>_user.txt`` is optional; modes that compose the user
   message inline return ``user=None``.

Whenever an override is set or cleared we invalidate the LangGraph singleton
so the next call picks up the new prompts. We do this by ducking the import
to avoid a circular dependency at module load.
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import TypedDict

_log = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
OVERRIDES_DIR = PROMPTS_DIR / "dev_overrides"

# Allow-list of modes the manager will serve. Anything else is rejected.
ALLOWED_MODES = ("section_extraction", "memo_qa", "scenario_screening")

_lock = threading.RLock()


class PromptPair(TypedDict):
    """The pair returned to mode-runners."""

    system: str
    user: str | None


def _read_text(path: Path) -> str | None:
    """Return file contents or ``None`` if absent."""

    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def _override_path(mode: str) -> Path:
    return OVERRIDES_DIR / f"{mode}.json"


def _validate_mode(mode: str) -> None:
    if mode not in ALLOWED_MODES:
        raise ValueError(
            f"Unknown prompt mode: {mode!r}. "
            f"Valid modes: {', '.join(ALLOWED_MODES)}"
        )


def get_prompts(mode: str) -> PromptPair:
    """Return the active ``{system, user}`` pair for ``mode``.

    Args:
        mode: One of :data:`ALLOWED_MODES`.

    Returns:
        ``{"system": str, "user": str | None}``. ``user`` is ``None`` when
        the mode does not ship a separate user template (Q&A and scenario
        compose their user message inline; only section extraction has a
        bundled user template with ``{section_name}`` / ``{section_text}``
        placeholders).

    Raises:
        ValueError: If ``mode`` is not allowed.
        FileNotFoundError: If neither override nor bundled system prompt exists.
    """

    _validate_mode(mode)
    with _lock:
        override = _override_path(mode)
        if override.exists():
            data = json.loads(override.read_text(encoding="utf-8"))
            system = data.get("system")
            user = data.get("user")
            if not system:
                # Fall through to bundled if override is partial.
                system = _read_text(PROMPTS_DIR / f"{mode}_system.txt")
            return {"system": system or "", "user": user}

        system = _read_text(PROMPTS_DIR / f"{mode}_system.txt")
        user = _read_text(PROMPTS_DIR / f"{mode}_user.txt")
        if system is None:
            raise FileNotFoundError(
                f"No bundled prompt for mode {mode!r} at {PROMPTS_DIR}"
            )
        return {"system": system, "user": user}


def set_override(
    mode: str,
    *,
    system: str | None = None,
    user: str | None = None,
) -> PromptPair:
    """Persist a runtime override for ``mode``.

    Either ``system`` or ``user`` may be omitted. The bundled value is used
    for the half that is not overridden when callers later read the pair.
    """

    _validate_mode(mode)
    with _lock:
        OVERRIDES_DIR.mkdir(parents=True, exist_ok=True)
        path = _override_path(mode)
        existing: dict[str, str] = {}
        if path.exists():
            try:
                existing = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                _log.warning("override_corrupt_replacing", extra={"mode": mode, "path": str(path)})
                existing = {}
        if system is not None:
            existing["system"] = system
        if user is not None:
            existing["user"] = user
        path.write_text(json.dumps(existing, indent=2), encoding="utf-8")
        _log.info("prompt_override_set", extra={"mode": mode, "path": str(path)})
        _invalidate_graph()
    return get_prompts(mode)


def clear_override(mode: str) -> None:
    """Remove the override file for ``mode``. Idempotent."""

    _validate_mode(mode)
    with _lock:
        path = _override_path(mode)
        if path.exists():
            path.unlink()
            _log.info("prompt_override_cleared", extra={"mode": mode, "path": str(path)})
        _invalidate_graph()


def list_active_prompts() -> dict[str, PromptPair]:
    """Snapshot every mode's currently-active pair (override or bundled)."""

    return {mode: get_prompts(mode) for mode in ALLOWED_MODES}


def has_override(mode: str) -> bool:
    """Return True when a dev override is in effect for ``mode``."""

    _validate_mode(mode)
    return _override_path(mode).exists()


def _invalidate_graph() -> None:
    """Best-effort LangGraph cache invalidation.

    Imported lazily to keep this module free of circular imports — at import
    time ``app.services.llm`` is not yet ready.
    """

    try:
        from . import llm
    except ImportError:
        return
    try:
        llm.invalidate_graph()
    except Exception as exc:  # noqa: BLE001 - best-effort
        _log.warning("graph_invalidate_failed", extra={"error": str(exc)})
