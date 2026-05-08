"""Per-document chunk store + FAISS-backed retrieval, anchored at the doc store.

Each document × parser_mode pairing has its own ``chunks.json`` plus
``embeddings.npz`` under ``doc_store/<hash>/extractions/<parser_mode>/``.
We do NOT maintain a persistent global FAISS index — when a query arrives we
build a transient in-memory index from the relevant per-document caches. For
local-disk storage the assembly cost is negligible and the contract stays
simple.

Graceful degradation: missing FAISS or missing embeddings deployment causes
``search`` to return ``[]`` after one WARN log per process.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from typing import Any

from app.config import get_settings

from . import doc_store

_log = logging.getLogger(__name__)
_lock = threading.RLock()
_FAISS_WARNED = False


@dataclass
class Chunk:
    """A retrievable chunk."""

    id: str
    text: str
    metadata: dict[str, Any]


# ---------------------------------------------------------------------------
# Chunking.
# ---------------------------------------------------------------------------


def chunk_text(text: str, *, size: int, overlap: int) -> list[str]:
    """Naive sliding-window chunker.

    Args:
        text: Source text.
        size: Target chunk size in characters.
        overlap: Overlap (chars) between adjacent chunks.

    Returns:
        Stripped chunks. Empty when ``text`` is empty.
    """

    if not text:
        return []
    if size <= 0:
        return [text]
    if overlap < 0 or overlap >= size:
        overlap = max(0, size // 4)

    chunks: list[str] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + size, n)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end == n:
            break
        start = end - overlap
    return chunks


# ---------------------------------------------------------------------------
# Refresh — runs after every successful extraction.
# ---------------------------------------------------------------------------


def refresh_for_document(doc_hash: str, parser_mode: str) -> dict[str, Any]:
    """Rebuild the chunk store + embedding matrix for one document.

    Reads ``extraction.json``, splits ``raw_markdown`` into chunks, embeds
    them via the configured Azure embeddings deployment, and persists both
    artefacts under the same parser-mode folder.

    Args:
        doc_hash: Hash from :func:`doc_store.compute_hash`.
        parser_mode: Cache key sibling under ``extractions/``.

    Returns:
        ``{doc_hash, chunks, embedded, status}`` summary.
    """

    settings = get_settings()
    extraction = doc_store.get_extraction(doc_hash, parser_mode)
    if extraction is None:
        return {"doc_hash": doc_hash, "chunks": 0, "embedded": 0, "status": "no_extraction"}

    markdown = extraction.get("raw_markdown") or ""
    raw_chunks = chunk_text(
        markdown, size=settings.chunk_size, overlap=settings.chunk_overlap
    )
    chunk_records: list[dict[str, Any]] = [
        {
            "id": f"{doc_hash[:8]}::{i}",
            "text": chunk,
            "metadata": {"index": i, "doc_hash": doc_hash, "parser_mode": parser_mode},
        }
        for i, chunk in enumerate(raw_chunks)
    ]
    summary: dict[str, Any] = {
        "doc_hash": doc_hash,
        "parser_mode": parser_mode,
        "chunks": len(chunk_records),
        "embedded": 0,
        "status": "ok",
    }

    if not chunk_records:
        with _lock:
            doc_store.save_extraction(doc_hash, parser_mode, extraction, chunks=chunk_records)
        return summary

    try:
        from .llm import make_embeddings
    except ImportError:
        with _lock:
            doc_store.save_extraction(doc_hash, parser_mode, extraction, chunks=chunk_records)
        summary["status"] = "embeddings_unavailable"
        return summary

    try:
        embedder = make_embeddings()
        vectors = embedder.embed_documents([c["text"] for c in chunk_records])
        summary["embedded"] = len(vectors)
        with _lock:
            doc_store.save_extraction(
                doc_hash,
                parser_mode,
                extraction,
                chunks=chunk_records,
                embeddings=vectors,
            )
    except Exception as exc:  # noqa: BLE001
        _log.warning(
            "embeddings_refresh_failed",
            extra={"doc_hash": doc_hash, "parser_mode": parser_mode, "error": str(exc)},
        )
        with _lock:
            doc_store.save_extraction(doc_hash, parser_mode, extraction, chunks=chunk_records)
        summary["status"] = f"failed: {exc}"
    return summary


# ---------------------------------------------------------------------------
# Search.
# ---------------------------------------------------------------------------


def search(
    query: str,
    document_hashes: list[str],
    parser_mode: str,
    *,
    top_k: int = 10,
) -> list[Chunk]:
    """Return the top-``k`` chunks across the listed documents.

    A FAISS index is built per-call from the per-document caches. For our
    storage scale (single-digit thousands of chunks per query) this is
    cheaper than maintaining a persistent global index.
    """

    if not query or not document_hashes:
        return []

    bundle = _load_bundle(document_hashes, parser_mode)
    if bundle is None:
        return []
    chunks, vectors = bundle

    try:
        import faiss  # type: ignore
        import numpy as np

        from .llm import make_embeddings
    except ImportError as exc:
        _warn_faiss_once(f"dependency missing: {exc}")
        return chunks[:top_k]

    try:
        embedder = make_embeddings()
        qvec = np.array([embedder.embed_query(query)], dtype="float32")
        matrix = np.asarray(vectors, dtype="float32")
        if matrix.ndim != 2 or matrix.shape[0] != len(chunks):
            return chunks[:top_k]
        # why: L2-normalise both sides so inner-product behaves as cosine.
        faiss.normalize_L2(matrix)
        faiss.normalize_L2(qvec)
        index = faiss.IndexFlatIP(matrix.shape[1])
        index.add(matrix)
        scores, indices = index.search(qvec, min(top_k, len(chunks)))
        out: list[Chunk] = []
        for i in indices[0]:
            if 0 <= i < len(chunks):
                out.append(chunks[i])
        return out
    except Exception as exc:  # noqa: BLE001
        _warn_faiss_once(f"faiss query failed: {exc}")
        return chunks[:top_k]


def _load_bundle(
    document_hashes: list[str], parser_mode: str
) -> tuple[list[Chunk], Any] | None:
    """Concatenate every doc's chunks + vectors into a single (list, matrix).

    Returns ``None`` when no doc has both files cached.
    """

    try:
        import numpy as np
    except ImportError:
        return None

    all_chunks: list[Chunk] = []
    matrices: list[Any] = []
    for doc_hash in document_hashes:
        bundle = doc_store.get_chunks_and_embeddings(doc_hash, parser_mode)
        if bundle is None:
            continue
        chunk_records, vectors = bundle
        for r in chunk_records:
            all_chunks.append(
                Chunk(id=r["id"], text=r["text"], metadata=r.get("metadata", {}))
            )
        matrices.append(vectors)

    if not all_chunks or not matrices:
        return None
    return all_chunks, np.vstack(matrices)


def _warn_faiss_once(reason: str) -> None:
    global _FAISS_WARNED
    if _FAISS_WARNED:
        return
    _FAISS_WARNED = True
    _log.warning("embeddings_search_degraded", extra={"reason": reason})
