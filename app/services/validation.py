"""LLM-response validation with single-retry error correction.

Pattern:

1. Call the LLM with the analyst-supplied messages.
2. Try to parse the response into the requested Pydantic schema.
3. If parsing fails AND a retry is still available, call the LLM again with
   the original messages plus an error-correction message that includes the
   previous response and the validation errors.
4. If the retry also fails (or is unavailable), return a
   :class:`~app.services.schemas.ValidationFailure` so the service layer can
   persist a structured error envelope.

We never silently coerce or "do our best" — bad data gets surfaced.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from .schemas import ValidationFailure

_log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# why: messages are dicts with role/content — typed loosely because the
# LangChain wrapper tolerates either dicts or LangChain message objects.
Messages = list[dict[str, Any]]
LlmCallable = Callable[[Messages], Any]


def _get_content(response: Any) -> str:
    """Pull the text payload off a LangChain response, falling back to ``str``."""

    return getattr(response, "content", str(response))


def _strip_code_fences(text: str) -> str:
    """Remove leading/trailing markdown code fences if the model wrapped its JSON.

    Some Azure OpenAI deployments emit ```json … ``` even when told not to;
    stripping is a small ergonomic concession that does not weaken validation.
    """

    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]
    return text.strip()


def _try_parse(content: str, schema: type[T]) -> tuple[T | None, Exception | None]:
    """Attempt one JSON-decode + Pydantic-validate pass."""

    cleaned = _strip_code_fences(content)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        return None, exc
    try:
        return schema.model_validate(data), None
    except ValidationError as exc:
        return None, exc


def _build_correction_messages(
    original: Messages,
    previous_response: str,
    error: Exception,
    schema: type[T],
) -> Messages:
    """Append an error-correction message to the original message list.

    The model receives the previous response and the list of errors, then is
    asked to return a corrected JSON document. We do not edit the system
    prompt — the original schema requirements are still authoritative.
    """

    if isinstance(error, ValidationError):
        errors = error.errors()
        rendered_errors = json.dumps(errors, default=str, indent=2)
    else:
        rendered_errors = str(error)

    correction = (
        "Your previous response failed schema validation. "
        "Return a corrected JSON response matching the schema described in the "
        "system prompt above. Reply with ONLY the corrected JSON object — no "
        "preamble, no code fences, no commentary.\n\n"
        f"Schema: {schema.__name__}\n\n"
        "Previous response:\n"
        f"{previous_response}\n\n"
        "Validation errors:\n"
        f"{rendered_errors}\n"
    )

    return list(original) + [
        {"role": "assistant", "content": previous_response},
        {"role": "user", "content": correction},
    ]


def validate_or_retry(
    llm_invoke: LlmCallable,
    messages: Messages,
    schema: type[T],
    *,
    max_retries: int = 1,
) -> tuple[T | None, ValidationFailure | None]:
    """Invoke the LLM, parse, and retry on validation failure.

    Args:
        llm_invoke: Callable that takes a list of messages and returns a
            LangChain-style response object (with ``.content``).
        messages: Initial system + user messages.
        schema: The Pydantic model to validate against.
        max_retries: Number of error-correction retries to attempt. The spec
            calls for exactly 1; pass 0 to disable retry entirely.

    Returns:
        ``(parsed_model, None)`` on success, ``(None, ValidationFailure)`` on
        permanent failure.
    """

    attempt = 0
    current_messages = list(messages)
    last_response = ""
    last_error: Exception | None = None

    while True:
        response = llm_invoke(current_messages)
        last_response = _get_content(response)
        parsed, err = _try_parse(last_response, schema)
        if parsed is not None:
            return parsed, None

        last_error = err
        _log.warning(
            "llm_validation_failed",
            extra={
                "schema": schema.__name__,
                "attempt": attempt,
                "error_type": type(err).__name__ if err else "Unknown",
                "error": str(err) if err else "",
            },
        )

        if attempt >= max_retries:
            break

        attempt += 1
        current_messages = _build_correction_messages(
            messages, last_response, err or RuntimeError("unknown validation error"), schema
        )

    error_payload: list[dict[str, Any]] = []
    if isinstance(last_error, ValidationError):
        error_payload = [dict(e) for e in last_error.errors()]
    elif last_error is not None:
        error_payload = [{"type": type(last_error).__name__, "msg": str(last_error)}]

    return None, ValidationFailure(
        attempted_schema=schema.__name__,
        raw_response=last_response,
        validation_errors=error_payload,
        attempt=attempt,
    )
