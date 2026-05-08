"""Prompt-driven routes — single Q&A, multi-step conversation, scenario screening."""

from __future__ import annotations

from typing import Any

from flask import Blueprint, jsonify, request

from app.services import jobs, qa, scenario

bp = Blueprint("prompts", __name__, url_prefix="/api/prompts")


@bp.post("/single")
def run_single():
    """Queue a Q&A job over (questions × documents).

    Body fields:
      * ``questions`` — list[str]
      * ``document_hashes`` — list[str]
      * ``parser_mode`` — optional, default ``docintel-official``
      * ``system_prompt_override`` — optional system-prompt override
      * ``user_prompt_override`` — optional user-prompt template override
    """

    body = request.get_json(silent=True) or {}
    questions = [q for q in (body.get("questions") or []) if q]
    hashes = list(body.get("document_hashes") or [])
    if not questions or not hashes:
        return jsonify({"error": "missing_questions_or_documents"}), 400
    parser_mode = (body.get("parser_mode") or "docintel-official").strip()
    system_override = body.get("system_prompt_override")
    user_override = body.get("user_prompt_override")

    def runner(ctx) -> dict[str, Any]:
        total = max(1, len(questions) * len(hashes))
        ctx.update(message=f"running {total} (question, document) pair(s)")
        rows = qa.answer_questions(
            questions,
            hashes,
            parser_mode=parser_mode,
            system_override=system_override,
            user_override_template=user_override,
        )
        ctx.update(progress=100, message="single-prompt run complete")
        return {"rows": rows}

    job_id = jobs.submit(runner, kind="prompts-single")
    return jsonify({"job_id": job_id})


@bp.post("/multi-step")
def run_multi_step():
    """Run one synchronous turn of a conversational Q&A.

    Body fields:
      * ``conversation`` — list of ``{role, content}``.
      * ``document_hashes`` — list[str]
      * ``parser_mode`` — optional
      * ``system_prompt_override`` — optional
    """

    body = request.get_json(silent=True) or {}
    conversation = list(body.get("conversation") or [])
    hashes = list(body.get("document_hashes") or [])
    if not conversation:
        return jsonify({"error": "no_conversation"}), 400
    parser_mode = (body.get("parser_mode") or "docintel-official").strip()
    system_override = body.get("system_prompt_override")
    return jsonify(
        qa.conversational_turn(
            conversation,
            hashes,
            parser_mode=parser_mode,
            system_override=system_override,
        )
    )


@bp.post("/scenario")
def run_scenario():
    """Queue a scenario-screening job over the listed documents.

    Body fields:
      * ``scenario_text`` — string
      * ``document_hashes`` — list[str]
      * ``parser_mode`` — optional
      * ``system_prompt_override`` — optional
    """

    body = request.get_json(silent=True) or {}
    scenario_text = (body.get("scenario_text") or "").strip()
    hashes = list(body.get("document_hashes") or [])
    if not scenario_text or not hashes:
        return jsonify({"error": "missing_scenario_or_documents"}), 400
    parser_mode = (body.get("parser_mode") or "docintel-official").strip()
    system_override = body.get("system_prompt_override")

    def runner(ctx) -> dict[str, Any]:
        ctx.update(message=f"screening {len(hashes)} document(s)")
        rows = scenario.screen_documents(
            hashes,
            scenario_text,
            parser_mode=parser_mode,
            system_override=system_override,
        )
        ctx.update(progress=100, message="scenario screening complete")
        return {"rows": rows}

    job_id = jobs.submit(runner, kind="scenario")
    return jsonify({"job_id": job_id})
