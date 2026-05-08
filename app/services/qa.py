"""Memo Q&A — single document, multi-document, and conversational paths.

Three callers map onto this module:

* ``POST /api/prompts/single`` — runs one or more questions against one or
  more documents. One LLM call per (document, question). Per-call
  validation against :class:`MemoQaResponse`.
* ``POST /api/prompts/multi-step`` — stateful conversational QA. The route
  passes a full message history; we append the system prompt (which the
  caller may override per turn) and one document-context block, then return
  the model's response. Synchronous; no job machinery.
* Embedded use from extraction / scenario services for evidence retrieval.

All paths read prompts via :mod:`app.services.prompt_manager` so dev-panel
overrides take effect without a restart.
"""

from __future__ import annotations

import logging
from typing import Any

from app.utils.markdown import render_markdown

from . import doc_store, embeddings, prompt_manager
from .schemas import MemoQaResponse
from .validation import validate_or_retry

_log = logging.getLogger(__name__)

MODE_RETRIEVED = "Retrieved evidence"
MODE_FULL = "Full extracted memo"

DEFAULT_TOP_K = 8


# ---------------------------------------------------------------------------
# Single-pass Q&A.
# ---------------------------------------------------------------------------


def _envelope_skeleton(doc_hash: str, question: str) -> dict[str, Any]:
    return {
        "document_hash": doc_hash,
        "question": question,
        "answer": "",
        "answer_html": "",
        "evidence": [],
        "retrieved_chunks": [],
        "is_directly_answered": None,
        "inference_chain": None,
        "unanswered_aspects": [],
        "extraction_confidence": None,
        "confidence_rationale": None,
    }


def _build_context(doc_hash: str, parser_mode: str, question: str) -> tuple[str, list[dict]]:
    """Return ``(context_text, retrieved_chunks)`` for a Q&A call.

    Falls back to the full ``raw_markdown`` from the cached extraction when
    embeddings are unavailable or no chunks are stored yet.
    """

    chunks = embeddings.search(question, [doc_hash], parser_mode, top_k=DEFAULT_TOP_K)
    if chunks:
        retrieved = [
            {"id": c.id, "text": c.text, "metadata": c.metadata} for c in chunks
        ]
        ctx = "\n\n---\n\n".join(f"[{c.id}] {c.text}" for c in chunks)
        return ctx, retrieved
    extraction = doc_store.get_extraction(doc_hash, parser_mode)
    if extraction is None:
        return "", []
    return extraction.get("raw_markdown", "") or "", []


def answer_question(
    doc_hash: str,
    question: str,
    *,
    parser_mode: str = "docintel-official",
    system_override: str | None = None,
    user_override_template: str | None = None,
) -> dict[str, Any]:
    """Answer ``question`` against one document.

    Args:
        doc_hash: Document hash from the doc store.
        question: Free-form analyst question.
        parser_mode: Selects which cached extraction to read context from.
        system_override: Optional system-prompt override. When ``None`` we
            fall through to :mod:`prompt_manager` (which itself respects
            dev-panel overrides).
        user_override_template: Optional user-prompt template override. Same
            semantics as ``system_override``.
    """

    from .llm import make_llm

    metadata = doc_store.get_document(doc_hash)
    envelope = _envelope_skeleton(doc_hash, question)
    if metadata is None:
        envelope["error"] = "document_not_found"
        return envelope

    context, retrieved = _build_context(doc_hash, parser_mode, question)
    envelope["retrieved_chunks"] = retrieved

    bundled = prompt_manager.get_prompts("memo_qa")
    system = system_override or bundled["system"]
    user_template = user_override_template or bundled.get("user")

    if user_template:
        user = user_template.format(
            doc_hash=doc_hash,
            context=context,
            question=question,
        )
    else:
        user = (
            f"Document hash: {doc_hash}\n"
            f"Filename: {metadata.get('filename', '')}\n\n"
            f"--- CONTEXT ---\n{context}\n--- END CONTEXT ---\n\n"
            f"Question: {question}\n"
        )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    try:
        llm = make_llm(temperature=0.0)
    except Exception as exc:  # noqa: BLE001
        _log.exception("qa_llm_construction_failed", extra={"doc_hash": doc_hash})
        envelope["_transport_error"] = {"type": type(exc).__name__, "message": str(exc)}
        return envelope

    try:
        parsed, failure = validate_or_retry(llm.invoke, messages, MemoQaResponse)
    except Exception as exc:  # noqa: BLE001
        _log.exception("qa_unexpected", extra={"doc_hash": doc_hash})
        envelope["_unexpected_error"] = {"type": type(exc).__name__, "message": str(exc)}
        return envelope

    if parsed is not None:
        data = parsed.model_dump()
        envelope.update(
            {
                "answer": data["answer"],
                "answer_html": render_markdown(data["answer"]),
                "evidence": data["evidence"],
                "is_directly_answered": data["is_directly_answered"],
                "inference_chain": data["inference_chain"],
                "unanswered_aspects": data["unanswered_aspects"],
                "extraction_confidence": data["extraction_confidence"],
                "confidence_rationale": data["confidence_rationale"],
            }
        )
        return envelope

    envelope["_validation_error"] = failure.model_dump() if failure else None
    return envelope


def answer_questions(
    questions: list[str],
    document_hashes: list[str],
    *,
    parser_mode: str = "docintel-official",
    system_override: str | None = None,
    user_override_template: str | None = None,
) -> list[dict[str, Any]]:
    """Cartesian product of questions × documents. One row per pair."""

    rows: list[dict[str, Any]] = []
    for question in questions:
        for doc_hash in document_hashes:
            try:
                rows.append(
                    answer_question(
                        doc_hash,
                        question,
                        parser_mode=parser_mode,
                        system_override=system_override,
                        user_override_template=user_override_template,
                    )
                )
            except Exception as exc:  # noqa: BLE001
                _log.exception("qa_row_failed", extra={"doc_hash": doc_hash})
                row = _envelope_skeleton(doc_hash, question)
                row["_unexpected_error"] = {
                    "type": type(exc).__name__,
                    "message": str(exc),
                }
                rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# Conversational (multi-step) Q&A.
# ---------------------------------------------------------------------------


def conversational_turn(
    conversation: list[dict[str, str]],
    document_hashes: list[str],
    *,
    parser_mode: str = "docintel-official",
    system_override: str | None = None,
) -> dict[str, Any]:
    """Run one turn of a multi-step conversation.

    Args:
        conversation: ``[{role, content}]`` history maintained by the
            frontend. The most recent ``user`` turn is the question.
        document_hashes: Documents in scope for this conversation.
        parser_mode: Which cached extraction to draw context from.
        system_override: Optional override applied for this turn only.

    Returns:
        ``{response: <MemoQaResponse envelope>}``. The frontend appends the
        assistant turn to its conversation state.
    """

    if not conversation:
        return {
            "response": {
                "error": "empty_conversation",
                "answer": "",
                "evidence": [],
                "is_directly_answered": False,
            }
        }

    last_user = next(
        (m["content"] for m in reversed(conversation) if m.get("role") == "user"),
        None,
    )
    if not last_user:
        return {
            "response": {
                "error": "no_user_turn",
                "answer": "",
                "evidence": [],
                "is_directly_answered": False,
            }
        }

    # Build context once across every document in scope.
    context_blocks: list[str] = []
    retrieved_all: list[dict[str, Any]] = []
    for doc_hash in document_hashes:
        ctx, retrieved = _build_context(doc_hash, parser_mode, last_user)
        if ctx:
            metadata = doc_store.get_document(doc_hash) or {}
            label = metadata.get("filename") or doc_hash
            context_blocks.append(f"## Document: {label} ({doc_hash[:12]})\n\n{ctx}")
        retrieved_all.extend(retrieved)
    context_text = "\n\n---\n\n".join(context_blocks)

    bundled = prompt_manager.get_prompts("memo_qa")
    system = system_override or bundled["system"]
    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    if context_text:
        messages.append(
            {
                "role": "user",
                "content": (
                    "--- DOCUMENT CONTEXT ---\n"
                    f"{context_text}\n"
                    "--- END DOCUMENT CONTEXT ---\n\n"
                    "Use only this context plus the conversation that follows. "
                    "Reply in the JSON envelope described in the system prompt."
                ),
            }
        )
    # Append the analyst's full conversation history verbatim.
    for turn in conversation:
        if turn.get("role") in {"user", "assistant"}:
            messages.append({"role": turn["role"], "content": turn.get("content", "")})

    response = _invoke_qa(messages)
    response["retrieved_chunks"] = retrieved_all
    return {"response": response}


def _invoke_qa(messages: list[dict[str, str]]) -> dict[str, Any]:
    """Shared invoke + validate path used by the conversational route."""

    from .llm import make_llm

    envelope: dict[str, Any] = {
        "answer": "",
        "answer_html": "",
        "evidence": [],
        "is_directly_answered": None,
        "inference_chain": None,
        "unanswered_aspects": [],
        "extraction_confidence": None,
        "confidence_rationale": None,
    }
    try:
        llm = make_llm(temperature=0.0)
    except Exception as exc:  # noqa: BLE001
        envelope["_transport_error"] = {"type": type(exc).__name__, "message": str(exc)}
        return envelope

    try:
        parsed, failure = validate_or_retry(llm.invoke, messages, MemoQaResponse)
    except Exception as exc:  # noqa: BLE001
        envelope["_unexpected_error"] = {"type": type(exc).__name__, "message": str(exc)}
        return envelope

    if parsed is not None:
        data = parsed.model_dump()
        envelope.update(
            {
                "answer": data["answer"],
                "answer_html": render_markdown(data["answer"]),
                "evidence": data["evidence"],
                "is_directly_answered": data["is_directly_answered"],
                "inference_chain": data["inference_chain"],
                "unanswered_aspects": data["unanswered_aspects"],
                "extraction_confidence": data["extraction_confidence"],
                "confidence_rationale": data["confidence_rationale"],
            }
        )
        return envelope
    envelope["_validation_error"] = failure.model_dump() if failure else None
    return envelope
