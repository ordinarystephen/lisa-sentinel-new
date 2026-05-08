"""Schema-validation smoke tests — Phase 2C.

These do NOT call live Azure. They construct the Pydantic models directly to
verify:

* The required-field discipline matches the prompt spec.
* ``extra="forbid"`` actually rejects unknown keys.
* The cross-field validators (``evidence`` required when answered, etc.) fire.
* :func:`validate_or_retry` returns a :class:`ValidationFailure` envelope when
  the model returns garbage, after exhausting retries.
"""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from app.services.schemas import (
    EvidenceQuote,
    ExcelExtractionResponse,
    ExtractionFact,
    ExtractionMetadata,
    ExtractionRisk,
    MemoQaResponse,
    ScenarioEvidenceQuote,
    ScenarioScreeningResponse,
    SectionExtractionResponse,
    ValidationFailure,
)
from app.services.validation import validate_or_retry

# ---------- happy-path construction ----------


def _universal(**overrides):
    base = {
        "value": "3.4x",
        "exact_quote": "Senior leverage of 3.4x at close.",
        "page_reference": 8,
        "is_explicitly_stated": True,
        "ambiguity_notes": None,
        "extraction_confidence": "high",
        "confidence_rationale": "Stated directly in financial highlights.",
    }
    base.update(overrides)
    return base


def test_extraction_fact_round_trip() -> None:
    fact = ExtractionFact(**_universal())
    assert fact.value == "3.4x"
    assert fact.is_explicitly_stated is True


def test_extraction_risk_requires_severity() -> None:
    payload = _universal()
    payload["risk_category"] = "credit"
    payload["is_inferred_vs_stated"] = "Stated."
    with pytest.raises(ValidationError):
        ExtractionRisk(**payload)  # missing severity
    payload["severity"] = "medium"
    risk = ExtractionRisk(**payload)
    assert risk.severity == "medium"


def test_section_extraction_full_envelope() -> None:
    response = SectionExtractionResponse(
        summary="Borrower is a fabricated-metals platform.",
        facts=[ExtractionFact(**_universal())],
        risks=[
            ExtractionRisk(
                severity="medium",
                risk_category="concentration",
                is_inferred_vs_stated="Inferred from customer mix.",
                **_universal(value="Top-3 customer concentration of 28%"),
            )
        ],
        open_questions=[],
        extraction_metadata=ExtractionMetadata(section_name="borrower"),
    )
    assert len(response.facts) == 1


def test_memo_qa_requires_evidence_when_directly_answered() -> None:
    with pytest.raises(ValidationError):
        MemoQaResponse(
            answer="It is 3.4x.",
            evidence=[],
            is_directly_answered=True,
            inference_chain=None,
            unanswered_aspects=[],
            extraction_confidence="high",
            confidence_rationale="Stated directly.",
        )


def test_memo_qa_allows_empty_evidence_when_not_directly_answered() -> None:
    response = MemoQaResponse(
        answer="Not stated in the available memo content.",
        evidence=[],
        is_directly_answered=False,
        inference_chain="No relevant chunk surfaced.",
        unanswered_aspects=["Whether interest coverage was tested at year-end."],
        extraction_confidence="low",
        confidence_rationale="No supporting evidence found.",
    )
    assert response.is_directly_answered is False


def test_scenario_requires_evidence_when_assessed() -> None:
    base = {
        "risk_level": "High",
        "confidence": "high",
        "confidence_rationale": "Multiple direct chunks.",
        "summary_rationale": "Maturing covenant breach is likely.",
        "evidence_quotes": [],
        "inference_chain": "From the rate hedge and covenant chunks…",
        "unaddressed_dimensions": [],
        "recommended_followup": None,
    }
    with pytest.raises(ValidationError):
        ScenarioScreeningResponse(**base)
    base["evidence_quotes"] = [
        ScenarioEvidenceQuote(
            quote="71% of debt floating-rate.",
            page_reference=19,
            chunk_id="westline::13",
            relevance="Establishes rate sensitivity.",
            direction="supports_exposure",
        )
    ]
    response = ScenarioScreeningResponse(**base)
    assert response.risk_level == "High"


def test_excel_extraction_response() -> None:
    response = ExcelExtractionResponse(
        value=3.4,
        answer_text="Senior leverage of 3.4x.",
        evidence=[
            EvidenceQuote(
                quote="Senior leverage of 3.4x at close.",
                page_reference=8,
                chunk_id=None,
                relevance="Direct statement of senior leverage.",
            )
        ],
        is_explicitly_stated=True,
        ambiguity_notes=None,
        extraction_confidence="high",
        confidence_rationale="Stated in financial highlights.",
    )
    assert response.value == 3.4


def test_extra_keys_are_forbidden() -> None:
    with pytest.raises(ValidationError):
        ExtractionFact(extra_secret="payload", **_universal())


# ---------- validate_or_retry ----------


class _StubResponse:
    def __init__(self, content: str) -> None:
        self.content = content


def _make_stub_invoke(responses):
    """Return a callable that pops the next response from ``responses``."""

    def invoke(_messages):
        if not responses:
            raise AssertionError("stub LLM exhausted")
        return _StubResponse(responses.pop(0))

    return invoke


def test_validate_or_retry_success_first_try() -> None:
    payload = {
        "summary": "ok",
        "facts": [],
        "risks": [],
        "open_questions": [],
        "extraction_metadata": {"section_name": "borrower"},
    }
    invoke = _make_stub_invoke([json.dumps(payload)])
    parsed, failure = validate_or_retry(invoke, [], SectionExtractionResponse)
    assert failure is None
    assert parsed is not None
    assert parsed.summary == "ok"


def test_validate_or_retry_recovers_after_one_retry() -> None:
    bad = "this is not JSON"
    good = json.dumps(
        {
            "summary": "ok",
            "facts": [],
            "risks": [],
            "open_questions": [],
            "extraction_metadata": {"section_name": "borrower"},
        }
    )
    invoke = _make_stub_invoke([bad, good])
    parsed, failure = validate_or_retry(invoke, [], SectionExtractionResponse)
    assert failure is None
    assert parsed is not None


def test_validate_or_retry_returns_failure_after_exhaustion() -> None:
    invoke = _make_stub_invoke(["junk", "still junk"])
    parsed, failure = validate_or_retry(invoke, [], SectionExtractionResponse)
    assert parsed is None
    assert isinstance(failure, ValidationFailure)
    assert failure.attempted_schema == "SectionExtractionResponse"
    assert failure.attempt == 1
    assert failure.raw_response == "still junk"


def test_validate_or_retry_strips_code_fences() -> None:
    payload = json.dumps(
        {
            "summary": "ok",
            "facts": [],
            "risks": [],
            "open_questions": [],
            "extraction_metadata": {"section_name": "borrower"},
        }
    )
    fenced = "```json\n" + payload + "\n```"
    parsed, failure = validate_or_retry(_make_stub_invoke([fenced]), [], SectionExtractionResponse)
    assert failure is None
    assert parsed is not None
