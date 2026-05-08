"""Section-based memo extraction over the doc store.

Pipeline (per :doc:`docs/EXTRACTION_PIPELINE`):

1. Caller supplies a list of document hashes + parser_mode + concurrency.
2. For each document we check the doc-store cache; cached extractions are
   returned untouched unless ``force_reextract=True``.
3. Cache miss → load source bytes → run the configured parser → split into
   sections (heuristic OR preset list) → call the LLM per section → validate
   against :class:`SectionExtractionResponse` → persist to the doc store.
4. Embeddings refresh runs after every successful extraction.
5. Up to ``concurrency`` documents process in parallel via
   ``concurrent.futures.ThreadPoolExecutor``.

The returned job-result rows are JSON-serialisable for the polling endpoint.
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from . import doc_store, embeddings, parsers, prompt_manager, section_presets
from .schemas import SectionExtractionResponse
from .validation import validate_or_retry

_log = logging.getLogger(__name__)

# why: hard-coded for v1 — these are the canonical credit-memo sections we
# extract when no preset matches. The list is documented in
# EXTRACTION_PIPELINE.md so analysts can audit it.
DEFAULT_SECTIONS = (
    "executive summary",
    "borrower",
    "facility",
    "financials",
    "covenants",
    "collateral",
    "risk",
    "esg",
)

_HEADING_RE = re.compile(r"(?im)^\s{0,3}(#{1,6})\s+(.+?)\s*$")
UTC = timezone.utc  # noqa: UP017 - py3.9 compat already dropped, kept for clarity


@dataclass
class SectionSplit:
    """One section's heading + text."""

    name: str
    heading: str
    text: str


def split_sections(
    markdown: str,
    section_names: tuple[str, ...] | list[str] = DEFAULT_SECTIONS,
) -> list[SectionSplit]:
    """Split ``markdown`` by detected headings that match ``section_names``.

    Heuristic: any markdown heading whose lowercase text contains a known
    section name starts that section. Text before the first matched heading
    is captured as ``"preamble"``.
    """

    if not markdown:
        return []

    matches: list[tuple[int, str, str]] = []
    for m in _HEADING_RE.finditer(markdown):
        heading_text = m.group(2).strip()
        lowered = heading_text.lower()
        for name in section_names:
            if str(name).lower() in lowered:
                matches.append((m.start(), str(name), heading_text))
                break

    if not matches:
        return [SectionSplit(name="preamble", heading="", text=markdown.strip())]

    sections: list[SectionSplit] = []
    if matches[0][0] > 0:
        preamble = markdown[: matches[0][0]].strip()
        if preamble:
            sections.append(SectionSplit(name="preamble", heading="", text=preamble))
    for i, (start, name, heading_text) in enumerate(matches):
        end = matches[i + 1][0] if i + 1 < len(matches) else len(markdown)
        body = markdown[start:end].strip()
        sections.append(SectionSplit(name=name, heading=heading_text, text=body))
    return sections


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Per-section LLM call.
# ---------------------------------------------------------------------------


def run_section_prompt(section: SectionSplit) -> dict[str, Any]:
    """Run the upgraded section-extraction prompt against ``section``.

    Returns one of:

    * ``SectionExtractionResponse.model_dump()`` on success.
    * ``{_validation_error: ...}`` after a retry exhausts.
    * ``{_transport_error: ...}`` when the LLM call fails.
    * ``{_unexpected_error: ...}`` for anything else.
    """

    from .llm import make_llm

    prompts = prompt_manager.get_prompts("section_extraction")
    user_template = prompts["user"] or ""
    user = user_template.format(section_name=section.name, section_text=section.text)
    messages = [
        {"role": "system", "content": prompts["system"]},
        {"role": "user", "content": user},
    ]

    try:
        llm = make_llm()
    except Exception as exc:  # noqa: BLE001
        _log.exception("section_llm_construction_failed", extra={"section": section.name})
        return {"_transport_error": {"type": type(exc).__name__, "message": str(exc)}}

    try:
        parsed, failure = validate_or_retry(llm.invoke, messages, SectionExtractionResponse)
    except Exception as exc:  # noqa: BLE001
        _log.exception("section_extraction_unexpected", extra={"section": section.name})
        return {"_unexpected_error": {"type": type(exc).__name__, "message": str(exc)}}

    if parsed is not None:
        payload = parsed.model_dump()
        payload["extraction_metadata"]["extraction_timestamp"] = _now_iso()
        if not payload["extraction_metadata"].get("section_name"):
            payload["extraction_metadata"]["section_name"] = section.name
        return payload
    return {"_validation_error": failure.model_dump() if failure else None}


# ---------------------------------------------------------------------------
# Per-document extraction.
# ---------------------------------------------------------------------------


def extract_document(
    doc_hash: str,
    *,
    parser_mode: str,
    section_preset: str | None = None,
    force_reextract: bool = False,
) -> dict[str, Any]:
    """Run extraction for one document.

    Returns a row suitable for the job result list:
    ``{document_hash, status, sections_extracted, error?, extraction_path?}``.
    """

    metadata = doc_store.get_document(doc_hash)
    if metadata is None:
        return {
            "document_hash": doc_hash,
            "status": "failed",
            "sections_extracted": 0,
            "error": "document_not_found",
        }

    if not force_reextract:
        cached = doc_store.get_extraction(doc_hash, parser_mode)
        if cached is not None:
            return {
                "document_hash": doc_hash,
                "status": "cached",
                "sections_extracted": len((cached or {}).get("sections", {})),
                "filename": metadata.get("filename"),
            }

    source_path = metadata.get("source_path")
    try:
        source_bytes = open(source_path, "rb").read()  # noqa: SIM115 - explicit close fine
    except OSError as exc:
        _log.exception("source_read_failed", extra={"doc_hash": doc_hash})
        return {
            "document_hash": doc_hash,
            "status": "failed",
            "sections_extracted": 0,
            "error": f"source_read_failed: {exc}",
        }

    try:
        markdown = parsers.parse_pdf(source_bytes, parser=parser_mode)
    except Exception as exc:  # noqa: BLE001
        _log.exception("parse_failed", extra={"doc_hash": doc_hash, "parser": parser_mode})
        return {
            "document_hash": doc_hash,
            "status": "failed",
            "sections_extracted": 0,
            "error": f"parser_failed: {exc}",
        }

    preset_headers = section_presets.get_preset(section_preset)
    section_list = preset_headers if preset_headers else DEFAULT_SECTIONS
    sections = split_sections(markdown, section_list)

    extraction_payload: dict[str, Any] = {
        "document_hash": doc_hash,
        "filename": metadata.get("filename"),
        "parser_mode": parser_mode,
        "section_preset": section_preset or "generic",
        "extracted_at": _now_iso(),
        "raw_markdown": markdown,
        "sections": {},
        "schema_version": 3,
    }
    for section in sections:
        extraction_payload["sections"][section.name] = {
            "heading": section.heading,
            "text": section.text,
            "extracted": run_section_prompt(section),
        }

    doc_store.save_extraction(doc_hash, parser_mode, extraction_payload)

    # why: legacy pipeline had auto-refresh disabled; UX contract requires it.
    try:
        embeddings.refresh_for_document(doc_hash, parser_mode)
    except Exception:  # noqa: BLE001 - embedding failure is non-fatal
        _log.exception("embedding_refresh_failed", extra={"doc_hash": doc_hash})

    return {
        "document_hash": doc_hash,
        "status": "succeeded",
        "sections_extracted": len(extraction_payload["sections"]),
        "filename": metadata.get("filename"),
    }


# ---------------------------------------------------------------------------
# Batch extraction.
# ---------------------------------------------------------------------------


def extract_batch(
    document_hashes: list[str],
    *,
    parser_mode: str,
    section_preset: str | None = None,
    force_reextract: bool = False,
    concurrency: int = 4,
    on_progress: Any = None,
) -> list[dict[str, Any]]:
    """Run :func:`extract_document` across many documents in parallel.

    Args:
        document_hashes: Hashes from the doc store.
        parser_mode: ``docintel-official`` / ``pypdf`` / ``ocr-fallback`` / ...
        section_preset: Optional preset name (see ``section_presets``).
        force_reextract: When True, ignore the cache and re-run every doc.
        concurrency: Max concurrent documents.
        on_progress: Optional callable ``(done, total, document_hash)``.

    Returns:
        List of per-document result dicts, in submission order.
    """

    workers = max(1, int(concurrency or 1))
    results: dict[str, dict[str, Any]] = {}
    total = len(document_hashes)
    done = 0

    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="lisa-extract") as pool:
        futures = {
            pool.submit(
                extract_document,
                doc_hash,
                parser_mode=parser_mode,
                section_preset=section_preset,
                force_reextract=force_reextract,
            ): doc_hash
            for doc_hash in document_hashes
        }
        for future in as_completed(futures):
            doc_hash = futures[future]
            try:
                results[doc_hash] = future.result()
            except Exception as exc:  # noqa: BLE001
                _log.exception("extract_document_unexpected", extra={"doc_hash": doc_hash})
                results[doc_hash] = {
                    "document_hash": doc_hash,
                    "status": "failed",
                    "sections_extracted": 0,
                    "error": f"unexpected: {exc}",
                }
            done += 1
            if on_progress:
                try:
                    on_progress(done, total, doc_hash)
                except Exception:
                    _log.exception("on_progress callback raised")

    return [results[h] for h in document_hashes]
