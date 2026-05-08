"""Scenario screening over the doc store.

Each document is scored against an analyst-supplied scenario. The LLM
response is validated against
:class:`~app.services.schemas.ScenarioScreeningResponse`. Error envelopes are
split four ways (transport / validation / unexpected) so analysts can tell a
real "memo doesn't address this" answer from a system failure.
"""

from __future__ import annotations

import logging
from typing import Any

from . import doc_store, embeddings, prompt_manager
from .schemas import ScenarioScreeningResponse
from .validation import validate_or_retry

_log = logging.getLogger(__name__)


def _envelope_skeleton(metadata: dict[str, Any]) -> dict[str, Any]:
    return {
        "document_hash": metadata.get("hash", ""),
        "filename": metadata.get("filename", ""),
        "risk_level": "Insufficient Evidence",
        "confidence": None,
        "confidence_rationale": None,
        "summary_rationale": "",
        "evidence_quotes": [],
        "retrieved_chunks": [],
        "inference_chain": None,
        "unaddressed_dimensions": [],
        "recommended_followup": None,
    }


def _retrieved_evidence(chunks: list[Any]) -> list[dict[str, Any]]:
    return [
        {
            "chunk_id": c.id,
            "quote": c.text[:600],
            "page_reference": c.metadata.get("page"),
        }
        for c in chunks
    ]


def screen_document(
    doc_hash: str,
    scenario: str,
    *,
    parser_mode: str = "docintel-official",
    system_override: str | None = None,
) -> dict[str, Any]:
    """Evaluate a single document against ``scenario``.

    Args:
        doc_hash: Document hash from the doc store.
        scenario: Free-form scenario text.
        parser_mode: Cached-extraction parser-mode key.
        system_override: Optional one-shot system-prompt override.
    """

    from .llm import make_llm

    metadata = doc_store.get_document(doc_hash) or {"hash": doc_hash, "filename": ""}
    envelope = _envelope_skeleton(metadata)

    chunks = embeddings.search(scenario, [doc_hash], parser_mode, top_k=8)
    chunk_text = "\n\n---\n\n".join(f"[{c.id}] {c.text}" for c in chunks)
    envelope["retrieved_chunks"] = _retrieved_evidence(chunks)

    bundled = prompt_manager.get_prompts("scenario_screening")
    system = system_override or bundled["system"]
    user = (
        f"Document hash: {doc_hash}\n"
        f"Filename: {metadata.get('filename', '')}\n\n"
        f"Scenario:\n{scenario}\n\n"
        f"Retrieved evidence:\n{chunk_text or '(none)'}\n\n"
        "Return a JSON object that matches the schema described in the system prompt."
    )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    try:
        llm = make_llm(temperature=0.0)
    except Exception as exc:  # noqa: BLE001
        _log.exception("scenario_llm_construction_failed", extra={"doc_hash": doc_hash})
        envelope["_transport_error"] = {"type": type(exc).__name__, "message": str(exc)}
        envelope["summary_rationale"] = (
            f"Scenario screening failed: transport error ({type(exc).__name__})."
        )
        return envelope

    try:
        parsed, failure = validate_or_retry(llm.invoke, messages, ScenarioScreeningResponse)
    except Exception as exc:  # noqa: BLE001
        _log.exception("scenario_screen_unexpected", extra={"doc_hash": doc_hash})
        envelope["_unexpected_error"] = {"type": type(exc).__name__, "message": str(exc)}
        envelope["summary_rationale"] = (
            f"Scenario screening failed: unexpected error ({type(exc).__name__})."
        )
        return envelope

    if parsed is not None:
        data = parsed.model_dump()
        envelope.update(
            {
                "risk_level": data["risk_level"],
                "confidence": data["confidence"],
                "confidence_rationale": data["confidence_rationale"],
                "summary_rationale": data["summary_rationale"],
                "evidence_quotes": data["evidence_quotes"],
                "inference_chain": data["inference_chain"],
                "unaddressed_dimensions": data["unaddressed_dimensions"],
                "recommended_followup": data["recommended_followup"],
            }
        )
        return envelope

    envelope["_validation_error"] = failure.model_dump() if failure else None
    envelope["summary_rationale"] = (
        "Scenario screening failed: response did not match the required schema."
    )
    return envelope


def screen_documents(
    document_hashes: list[str],
    scenario: str,
    *,
    parser_mode: str = "docintel-official",
    system_override: str | None = None,
) -> list[dict[str, Any]]:
    """Run :func:`screen_document` over each hash. Sequential — the LLM rate
    limits dominate any latency win from threading at this scale.
    """

    rows: list[dict[str, Any]] = []
    for doc_hash in document_hashes:
        rows.append(
            screen_document(
                doc_hash,
                scenario,
                parser_mode=parser_mode,
                system_override=system_override,
            )
        )
    return rows
