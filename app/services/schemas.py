"""Pydantic v2 response schemas for every LLM-driven service.

These models are the contract between the prompts in ``app/prompts/`` and the
services in ``app/services/``. The prompts ask the model to commit to these
exact shapes; the services use :func:`app.services.validation.validate_or_retry`
to enforce them on the way back.

Why one file:
    Keeping every response shape together lets the validation layer pick a
    schema by name and lets the UI know which fields to render without having
    to crawl multiple modules.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

# why: a small literal union for confidence ratings — explicit > number score
# (calibration of LLM-emitted floats has historically been meaningless).
ConfidenceLevel = Literal["high", "medium", "low"]
SeverityLevel = Literal["high", "medium", "low"]
RiskLevel = Literal["High", "Medium", "Low", "Insufficient Evidence"]
EvidenceDirection = Literal["supports_exposure", "refutes_exposure", "contextual"]


class _Strict(BaseModel):
    """Common config — extra fields are forbidden so the model can't sneak
    keys past the schema, and string fields are stripped of surrounding
    whitespace.
    """

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        populate_by_name=True,
        validate_assignment=True,
    )


# ---------------------------------------------------------------------------
# Universal extraction fields — used by section facts, risks, and Excel rows.
# ---------------------------------------------------------------------------


class _UniversalExtractionFields(_Strict):
    """The fields every extracted fact / risk / Excel row must carry.

    See ``docs/EXTRACTION_PIPELINE.md`` for the field contract and
    ``app/prompts/section_extraction_system.txt`` for the prompt-side spec.
    """

    value: str | int | float | bool | dict | list | None = Field(
        ...,
        description="The extracted content — typed when possible, structured when needed.",
    )
    exact_quote: str = Field(
        ...,
        min_length=1,
        description="Verbatim text from the source. No paraphrasing.",
    )
    page_reference: int | str | None = Field(
        None,
        description="Page number (int) or range (string like '8-9'). Null only when not determinable.",
    )
    is_explicitly_stated: bool = Field(
        ...,
        description="True if the source directly states the value; false if inferred.",
    )
    ambiguity_notes: str | None = Field(
        None,
        description="Caveats about uncertainty or multiple plausible values. Null when unambiguous.",
    )
    extraction_confidence: ConfidenceLevel = Field(
        ...,
        description="How directly the source supports the extraction.",
    )
    confidence_rationale: str = Field(
        ...,
        min_length=1,
        description="One sentence explaining the confidence rating.",
    )


# ---------------------------------------------------------------------------
# Section extraction.
# ---------------------------------------------------------------------------


class ExtractionFact(_UniversalExtractionFields):
    """A discrete fact extracted from a memo section."""


class ExtractionRisk(_UniversalExtractionFields):
    """A risk surfaced from a memo section."""

    severity: SeverityLevel = Field(..., description="Risk severity rating.")
    risk_category: str = Field(
        ...,
        min_length=1,
        description="Category label, e.g. 'credit', 'operational', 'regulatory'.",
    )
    is_inferred_vs_stated: str = Field(
        ...,
        min_length=1,
        description="One sentence explaining whether the risk is directly stated or inferred from facts.",
    )


class ExtractionOpenQuestion(_Strict):
    """An unanswered question surfaced during extraction."""

    question: str = Field(..., min_length=1)
    why_unanswered: str = Field(..., min_length=1)
    suggested_next_step: str = Field(..., min_length=1)


class ExtractionMetadata(_Strict):
    """Per-section provenance metadata recorded alongside the extraction."""

    section_name: str = Field(..., min_length=1)
    section_page_range: str | None = None
    model_version_implied: str | None = None
    extraction_timestamp: str | None = Field(
        None,
        description="ISO 8601 timestamp set server-side after validation.",
    )


class SectionExtractionResponse(_Strict):
    """The full JSON envelope expected from the section-extraction prompt."""

    summary: str = Field(..., description="Narrative section synthesis.")
    facts: list[ExtractionFact] = Field(default_factory=list)
    risks: list[ExtractionRisk] = Field(default_factory=list)
    open_questions: list[ExtractionOpenQuestion] = Field(default_factory=list)
    extraction_metadata: ExtractionMetadata


# ---------------------------------------------------------------------------
# Memo Q&A.
# ---------------------------------------------------------------------------


class EvidenceQuote(_Strict):
    """A single evidence record cited by a Q&A or Excel response."""

    quote: str = Field(..., min_length=1, description="Verbatim text from the memo.")
    page_reference: int | str | None = None
    chunk_id: str | None = None
    relevance: str = Field(
        ...,
        min_length=1,
        description="One sentence explaining why this evidence supports the answer.",
    )


class MemoQaResponse(_Strict):
    """The JSON envelope expected from the memo-QA prompt."""

    answer: str = Field(..., min_length=1, description="Markdown answer.")
    evidence: list[EvidenceQuote] = Field(default_factory=list)
    is_directly_answered: bool
    inference_chain: str | None = None
    unanswered_aspects: list[str] = Field(default_factory=list)
    extraction_confidence: ConfidenceLevel
    confidence_rationale: str = Field(..., min_length=1)

    # why: model_validator(mode="after") fires once every field has parsed, so
    # we can cross-check evidence vs is_directly_answered regardless of which
    # field was declared first.
    @model_validator(mode="after")
    def _evidence_required_when_answered(self):
        if self.is_directly_answered and not self.evidence:
            raise ValueError("evidence is required when is_directly_answered is true")
        return self


# ---------------------------------------------------------------------------
# Scenario screening.
# ---------------------------------------------------------------------------


class ScenarioEvidenceQuote(EvidenceQuote):
    """Evidence record extended with a direction tag for scenario screening."""

    direction: EvidenceDirection = Field(
        ...,
        description="Whether this evidence supports, refutes, or only provides context.",
    )


class ScenarioScreeningResponse(_Strict):
    """The JSON envelope expected from the scenario-screening prompt."""

    risk_level: RiskLevel
    confidence: ConfidenceLevel
    confidence_rationale: str = Field(..., min_length=1)
    summary_rationale: str = Field(..., min_length=1)
    evidence_quotes: list[ScenarioEvidenceQuote] = Field(default_factory=list)
    inference_chain: str = Field(..., min_length=1)
    unaddressed_dimensions: list[str] = Field(default_factory=list)
    recommended_followup: str | None = None

    @model_validator(mode="after")
    def _evidence_required_when_assessed(self):
        if self.risk_level in {"High", "Medium", "Low"} and not self.evidence_quotes:
            raise ValueError(
                "evidence_quotes is required when risk_level is High / Medium / Low"
            )
        return self


# ---------------------------------------------------------------------------
# Excel structured extraction.
# ---------------------------------------------------------------------------


class ExcelExtractionResponse(_Strict):
    """One structured-extraction row per (memo, prompt) pair."""

    value: str | int | float | bool | dict | list | None
    answer_text: str = Field(..., min_length=1)
    evidence: list[EvidenceQuote] = Field(default_factory=list)
    is_explicitly_stated: bool
    ambiguity_notes: str | None = None
    extraction_confidence: ConfidenceLevel
    confidence_rationale: str = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# Validation failure envelope — shared shape for the service layer.
# ---------------------------------------------------------------------------


class ValidationFailure(_Strict):
    """Surfaced when the LLM response cannot be parsed against the schema.

    The validation layer returns this instead of a parsed model when retries
    are exhausted. The service layer wraps it in an ``_validation_error``
    envelope on the persisted record.
    """

    attempted_schema: str
    raw_response: str
    validation_errors: list[dict[str, Any]] = Field(default_factory=list)
    attempt: int = 0
