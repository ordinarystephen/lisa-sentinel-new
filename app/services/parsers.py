"""Parser dispatch + capability probing.

Modes (selected via ``MEMO_PDF_PARSER``):

* ``docintel-official`` — primary path via :mod:`app.services.doc_intelligence`.
* ``pypdf`` — pure-Python fallback. Always available if ``pypdf`` is installed.
* ``docintel-risklab`` — alias for ``docintel-official`` in v1; reserved name.
* ``ocr-fallback`` — ``pdf2image`` + ``pytesseract``. Requires Poppler and
  Tesseract binaries on the host.

Auto-fallback is forbidden. Switching parsers is exclusively via env.
"""

from __future__ import annotations

import io
import logging
from collections.abc import Callable
from dataclasses import dataclass

from app.utils.normalize import _normalize_text

_log = logging.getLogger(__name__)


PARSER_DOCINTEL = "docintel-official"
PARSER_PYPDF = "pypdf"
PARSER_DOCINTEL_RISKLAB = "docintel-risklab"
PARSER_OCR = "ocr-fallback"


@dataclass(frozen=True)
class ParserCapability:
    """Resolved availability for each parser mode.

    ``available`` is ``True`` when the parser can run end-to-end on this host.
    ``reason`` carries a human-readable note when unavailable, used by
    ``/api/health.parsers``.
    """

    available: bool
    reason: str = ""


def probe_capabilities() -> dict[str, ParserCapability]:
    """Probe each parser mode for runtime availability.

    Returns:
        Mapping of parser name to :class:`ParserCapability`.
    """

    caps: dict[str, ParserCapability] = {}
    caps[PARSER_DOCINTEL] = _probe_docintel()
    caps[PARSER_DOCINTEL_RISKLAB] = caps[PARSER_DOCINTEL]
    caps[PARSER_PYPDF] = _probe_pypdf()
    caps[PARSER_OCR] = _probe_ocr()
    return caps


def _probe_docintel() -> ParserCapability:
    try:
        import azure.ai.documentintelligence  # noqa: F401
        import azure.identity  # noqa: F401
    except ImportError as exc:
        return ParserCapability(False, f"sdk missing: {exc}")
    import os

    if not os.getenv("AZURE_DOCINTEL_ENDPOINT", "").strip():
        return ParserCapability(False, "AZURE_DOCINTEL_ENDPOINT not set")
    return ParserCapability(True)


def _probe_pypdf() -> ParserCapability:
    try:
        import pypdf  # noqa: F401
    except ImportError as exc:
        return ParserCapability(False, f"pypdf missing: {exc}")
    return ParserCapability(True)


def _probe_ocr() -> ParserCapability:
    """Probe pdf2image (Poppler) and pytesseract (Tesseract).

    The Python packages are not enough — both depend on system binaries that
    Domino admins install separately. We surface either as missing if absent.
    """

    poppler_ok = False
    tesseract_ok = False
    poppler_reason = ""
    tesseract_reason = ""

    try:
        from pdf2image import pdfinfo_from_bytes

        # why: a real Poppler probe — pdfinfo on a tiny in-memory PDF. If the
        # binary is missing, this raises a clear error.
        try:
            pdfinfo_from_bytes(_TINY_PDF)
            poppler_ok = True
        except Exception as exc:  # pragma: no cover - depends on host
            poppler_reason = f"poppler unavailable: {exc}"
    except ImportError as exc:
        poppler_reason = f"pdf2image missing: {exc}"

    try:
        import pytesseract

        try:
            pytesseract.get_tesseract_version()
            tesseract_ok = True
        except Exception as exc:  # pragma: no cover - depends on host
            tesseract_reason = f"tesseract binary not found: {exc}"
    except ImportError as exc:
        tesseract_reason = f"pytesseract missing: {exc}"

    if poppler_ok and tesseract_ok:
        return ParserCapability(True)
    parts = [r for r in (poppler_reason, tesseract_reason) if r]
    return ParserCapability(False, "; ".join(parts) or "ocr deps not detected")


# why: minimal valid PDF for the Poppler probe — keeps the smoke test path
# real (we actually invoke Poppler) without needing a fixture file on disk.
_TINY_PDF = (
    b"%PDF-1.1\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\n"
    b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n"
    b"0000000052 00000 n \n0000000098 00000 n \n"
    b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF\n"
)


def get_active_parser() -> str:
    """Return the configured parser mode (lowercased, default-applied)."""

    from app.config import DEFAULT_PARSER, get_settings

    name = (get_settings().memo_pdf_parser or DEFAULT_PARSER).lower()
    return name


def parse_pdf(pdf_bytes: bytes, parser: str | None = None) -> str:
    """Run ``pdf_bytes`` through the configured (or specified) parser.

    Args:
        pdf_bytes: Raw PDF content.
        parser: Optional explicit override (must match one of ``SUPPORTED_PARSERS``).

    Returns:
        Markdown / plain-text content. Always normalised.

    Raises:
        ValueError: If the parser name is unknown.
        Exception: Any underlying parser error — caller decides recovery.
    """

    name = (parser or get_active_parser()).lower()
    fn = _DISPATCH.get(name)
    if fn is None:
        raise ValueError(f"Unknown MEMO_PDF_PARSER value: {name!r}")
    return _normalize_text(fn(pdf_bytes))


def _parse_docintel(pdf_bytes: bytes) -> str:
    from .doc_intelligence import extract_pdf_bytes_to_markdown

    return extract_pdf_bytes_to_markdown(pdf_bytes)


def _parse_pypdf(pdf_bytes: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages = []
    for idx, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        pages.append(f"## Page {idx}\n\n{text.strip()}")
    return "\n\n".join(pages)


def _parse_ocr(pdf_bytes: bytes) -> str:
    import pytesseract
    from pdf2image import convert_from_bytes

    images = convert_from_bytes(pdf_bytes)
    pages: list[str] = []
    for idx, image in enumerate(images, start=1):
        text = pytesseract.image_to_string(image) or ""
        pages.append(f"## Page {idx}\n\n{text.strip()}")
    return "\n\n".join(pages)


_DISPATCH: dict[str, Callable[[bytes], str]] = {
    PARSER_DOCINTEL: _parse_docintel,
    # why: docintel-risklab is reserved as a future variant. For v1 it routes
    # through the same client — documented so callers don't depend on a
    # difference that doesn't exist yet.
    PARSER_DOCINTEL_RISKLAB: _parse_docintel,
    PARSER_PYPDF: _parse_pypdf,
    PARSER_OCR: _parse_ocr,
}
