"""Dev panel — read and override the in-memory prompt set.

Persisted via :mod:`app.services.prompt_manager`. Each ``PUT`` invalidates
the LangGraph singleton so the next call picks up the new prompts.
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from app.services import prompt_manager

bp = Blueprint("dev", __name__, url_prefix="/api/dev")


@bp.get("/prompts")
def get_prompts():
    """Return active ``{system, user}`` for every mode."""

    snapshot = prompt_manager.list_active_prompts()
    return jsonify(
        {
            "modes": list(snapshot.keys()),
            "prompts": snapshot,
            "overrides_active": {
                mode: prompt_manager.has_override(mode) for mode in snapshot
            },
        }
    )


@bp.put("/prompts")
def update_prompts():
    """Set or clear an override for one mode.

    Body fields:
      * ``mode`` — required, one of :data:`prompt_manager.ALLOWED_MODES`.
      * ``system`` — optional new system prompt. Pass ``null`` to leave alone.
      * ``user`` — optional new user prompt. Pass ``null`` to leave alone.
      * ``clear`` — optional bool. When true, drop any existing override.
    """

    body = request.get_json(silent=True) or {}
    mode = (body.get("mode") or "").strip()
    if not mode:
        return jsonify({"error": "missing_mode"}), 400

    try:
        if body.get("clear"):
            prompt_manager.clear_override(mode)
            return jsonify(
                {"mode": mode, "cleared": True, "prompts": prompt_manager.get_prompts(mode)}
            )
        prompt_manager.set_override(
            mode,
            system=body.get("system"),
            user=body.get("user"),
        )
        return jsonify(
            {"mode": mode, "prompts": prompt_manager.get_prompts(mode), "override_active": True}
        )
    except ValueError as exc:
        return jsonify({"error": "invalid_mode", "message": str(exc)}), 400
