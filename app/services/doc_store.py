"""Repo-local content-addressed document store.

Replaces the old tier resolver + memo store with a single hash-keyed layout
under ``DOC_STORE_DIR`` (default ``<repo_root>/doc_store``):

::

    doc_store/
    └── <sha256>/
        ├── source.pdf
        ├── metadata.json
        ├── pages/
        │   ├── page_001.png
        │   └── ...
        └── extractions/
            └── <parser_mode>/
                ├── extraction.json
                ├── chunks.json
                ├── embeddings.npz
                └── extracted_at.txt

The SHA256 of the file bytes is the cache key. Two uploads of the same file
collapse to one folder; re-extraction with a new parser mode adds a sibling
under ``extractions/`` without disturbing existing caches.

Page rendering is best-effort. If ``poppler-utils`` is missing we log once
and continue without page images — the UI degrades to "page reference number
only, no image".
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

_log = logging.getLogger(__name__)

# why: render at 150 DPI — measured empirically as the smallest setting where
# table column boundaries stay sharp on a credit memo. Anything below ~120
# starts losing fine ruling lines.
_PAGE_DPI = 150
_POPPLER_WARNED = False
_lock = threading.RLock()


# ---------------------------------------------------------------------------
# Path helpers.
# ---------------------------------------------------------------------------


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def doc_store_root() -> Path:
    """Resolve the doc-store root directory, creating it if absent."""

    raw = os.getenv("DOC_STORE_DIR", "").strip()
    root = Path(raw) if raw else (_repo_root() / "doc_store")
    root.mkdir(parents=True, exist_ok=True)
    return root


def _doc_dir(doc_hash: str) -> Path:
    return doc_store_root() / doc_hash


def _metadata_path(doc_hash: str) -> Path:
    return _doc_dir(doc_hash) / "metadata.json"


def _pages_dir(doc_hash: str) -> Path:
    return _doc_dir(doc_hash) / "pages"


def _extraction_dir(doc_hash: str, parser_mode: str) -> Path:
    safe_mode = parser_mode.replace("/", "_")
    return _doc_dir(doc_hash) / "extractions" / safe_mode


# ---------------------------------------------------------------------------
# Hashing + storage.
# ---------------------------------------------------------------------------


def compute_hash(file_bytes: bytes) -> str:
    """SHA256 hex digest of ``file_bytes``. Cache key for the doc store."""

    return hashlib.sha256(file_bytes).hexdigest()


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def store_document(file_bytes: bytes, original_filename: str) -> dict[str, Any]:
    """Persist ``file_bytes`` (a PDF) plus rendered pages and metadata.

    If the document already exists under its hash, return the cached metadata
    untouched — no re-render, no metadata rewrite.

    Args:
        file_bytes: Raw PDF bytes.
        original_filename: Filename as supplied by the upload (used only for
            display; not part of the cache key).

    Returns:
        The document's metadata dict (the same shape ``get_document`` returns).
    """

    doc_hash = compute_hash(file_bytes)
    with _lock:
        doc_dir = _doc_dir(doc_hash)
        doc_dir.mkdir(parents=True, exist_ok=True)

        source_path = doc_dir / "source.pdf"
        if not source_path.exists():
            source_path.write_bytes(file_bytes)

        meta_path = _metadata_path(doc_hash)
        if meta_path.exists():
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
            metadata.setdefault("cached", True)
            return metadata

        page_count = _render_pages(doc_hash, file_bytes)
        metadata = {
            "hash": doc_hash,
            "filename": Path(original_filename).name or "document.pdf",
            "size_bytes": len(file_bytes),
            "upload_timestamp": _now_iso(),
            "page_count": page_count,
            "pages_rendered": page_count > 0,
        }
        meta_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        _log.info("doc_stored", extra={"doc_hash": doc_hash, "filename": metadata["filename"]})
        metadata["cached"] = False
        return metadata


def _render_pages(doc_hash: str, file_bytes: bytes) -> int:
    """Render every page of the PDF to a PNG under ``pages/``.

    Returns the page count. Returns 0 and logs a single WARN if poppler is not
    available or rendering fails for any reason.
    """

    pages_dir = _pages_dir(doc_hash)
    pages_dir.mkdir(parents=True, exist_ok=True)
    existing = sorted(pages_dir.glob("page_*.png"))
    if existing:
        return len(existing)

    try:
        from pdf2image import convert_from_bytes
    except ImportError as exc:
        _warn_poppler_once(f"pdf2image missing: {exc}")
        return 0

    try:
        images = convert_from_bytes(file_bytes, dpi=_PAGE_DPI)
    except Exception as exc:  # pragma: no cover - host-dependent
        _warn_poppler_once(f"pdf2image conversion failed: {exc}")
        return 0

    for idx, image in enumerate(images, start=1):
        out = pages_dir / f"page_{idx:03d}.png"
        image.save(out, format="PNG")
    return len(images)


def _warn_poppler_once(reason: str) -> None:
    global _POPPLER_WARNED
    if _POPPLER_WARNED:
        return
    _POPPLER_WARNED = True
    _log.warning("page_rendering_unavailable", extra={"reason": reason})


# ---------------------------------------------------------------------------
# Retrieval.
# ---------------------------------------------------------------------------


def get_document(doc_hash: str) -> dict[str, Any] | None:
    """Return the metadata dict for ``doc_hash`` (with extraction summary), or None."""

    meta_path = _metadata_path(doc_hash)
    if not meta_path.exists():
        return None
    metadata = json.loads(meta_path.read_text(encoding="utf-8"))
    metadata["available_extractions"] = _list_extractions(doc_hash)
    metadata["source_path"] = str(_doc_dir(doc_hash) / "source.pdf")
    return metadata


def list_documents() -> list[dict[str, Any]]:
    """Return all stored documents, sorted by upload_timestamp descending."""

    root = doc_store_root()
    out: list[dict[str, Any]] = []
    if not root.exists():
        return out
    for child in root.iterdir():
        if not child.is_dir():
            continue
        meta_path = child / "metadata.json"
        if not meta_path.exists():
            continue
        try:
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            _log.warning("doc_metadata_load_failed", extra={"hash": child.name, "error": str(exc)})
            continue
        metadata["available_extractions"] = _list_extractions(child.name)
        out.append(metadata)
    out.sort(key=lambda m: m.get("upload_timestamp", ""), reverse=True)
    return out


def _list_extractions(doc_hash: str) -> list[str]:
    parent = _doc_dir(doc_hash) / "extractions"
    if not parent.exists():
        return []
    return sorted(p.name for p in parent.iterdir() if p.is_dir())


def get_page_image_path(doc_hash: str, page_number: int) -> Path | None:
    """Return the PNG path for ``page_number`` (1-based), or None if absent."""

    if page_number < 1:
        return None
    candidate = _pages_dir(doc_hash) / f"page_{page_number:03d}.png"
    return candidate if candidate.exists() else None


# ---------------------------------------------------------------------------
# Extractions + embeddings.
# ---------------------------------------------------------------------------


def get_extraction(doc_hash: str, parser_mode: str) -> dict[str, Any] | None:
    """Return the cached extraction.json for ``(doc_hash, parser_mode)``, or None."""

    path = _extraction_dir(doc_hash, parser_mode) / "extraction.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def save_extraction(
    doc_hash: str,
    parser_mode: str,
    extraction: dict[str, Any],
    chunks: list[dict[str, Any]] | None = None,
    embeddings: Any = None,
) -> None:
    """Persist an extraction + (optional) chunks + (optional) embedding matrix.

    Args:
        doc_hash: Stable hash from :func:`compute_hash`.
        parser_mode: e.g. ``"docintel-official"``. Used as the cache key
            sibling under ``extractions/``.
        extraction: The structured payload (already JSON-serialisable).
        chunks: Optional list of ``{id, text, metadata}`` chunks. Persisted to
            ``chunks.json``.
        embeddings: Optional 2-D numpy array of shape ``(n_chunks, dim)``.
            Persisted to ``embeddings.npz`` (key ``vectors``).
    """

    out_dir = _extraction_dir(doc_hash, parser_mode)
    with _lock:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "extraction.json").write_text(
            json.dumps(extraction, indent=2, default=str), encoding="utf-8"
        )
        if chunks is not None:
            (out_dir / "chunks.json").write_text(
                json.dumps(chunks, indent=2, default=str), encoding="utf-8"
            )
        if embeddings is not None:
            try:
                import numpy as np

                np.savez_compressed(out_dir / "embeddings.npz", vectors=np.asarray(embeddings))
            except ImportError:
                # numpy missing → skip persistence; search will degrade gracefully.
                _log.warning(
                    "embeddings_persist_skipped",
                    extra={"doc_hash": doc_hash, "parser_mode": parser_mode},
                )
        (out_dir / "extracted_at.txt").write_text(_now_iso(), encoding="utf-8")


def get_chunks_and_embeddings(
    doc_hash: str, parser_mode: str
) -> tuple[list[dict[str, Any]], Any] | None:
    """Load the cached chunks + embedding matrix for ``(doc_hash, parser_mode)``.

    Returns:
        ``(chunks_list, vectors_array)`` on success. ``None`` if either file
        is missing or numpy cannot be imported.
    """

    out_dir = _extraction_dir(doc_hash, parser_mode)
    chunks_path = out_dir / "chunks.json"
    embeddings_path = out_dir / "embeddings.npz"
    if not chunks_path.exists() or not embeddings_path.exists():
        return None
    try:
        import numpy as np
    except ImportError:
        return None
    chunks = json.loads(chunks_path.read_text(encoding="utf-8"))
    with np.load(embeddings_path) as data:
        vectors = data["vectors"]
    return chunks, vectors


def delete_document(doc_hash: str) -> bool:
    """Remove the entire ``<doc_hash>`` folder. Returns True if it existed."""

    import shutil

    target = _doc_dir(doc_hash)
    if not target.exists():
        return False
    shutil.rmtree(target)
    return True


# ---------------------------------------------------------------------------
# Health probes — exposed via /api/health.
# ---------------------------------------------------------------------------


def doc_store_health() -> dict[str, Any]:
    """Return the doc-store status block for the health endpoint."""

    root = doc_store_root()
    writable = os.access(root, os.W_OK)
    return {
        "path": str(root),
        "exists": root.exists(),
        "writable": writable,
        "document_count": len(list_documents()),
    }


def page_rendering_available() -> bool:
    """Probe whether ``pdf2image.pdfinfo_from_bytes`` can actually run.

    The Python package alone is not enough — Poppler binaries must be
    installed on the host. We invoke ``pdfinfo_from_bytes`` on a tiny
    in-memory PDF to confirm both halves are present.
    """

    try:
        from pdf2image import pdfinfo_from_bytes
    except ImportError:
        return False
    try:
        pdfinfo_from_bytes(_TINY_PDF)
    except Exception:
        return False
    return True


_TINY_PDF = (
    b"%PDF-1.1\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\n"
    b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n"
    b"0000000052 00000 n \n0000000098 00000 n \n"
    b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF\n"
)
