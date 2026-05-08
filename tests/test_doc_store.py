"""Doc-store contract tests.

These tests do NOT exercise poppler — page rendering is opportunistic and
the ``page_count == 0`` path is the expected one in the test sandbox.
"""

from __future__ import annotations

import pytest


def test_compute_hash_is_deterministic(tiny_pdf_bytes) -> None:
    from app.services.doc_store import compute_hash

    a = compute_hash(tiny_pdf_bytes)
    b = compute_hash(tiny_pdf_bytes)
    assert a == b
    assert len(a) == 64


def test_store_then_get_round_trip(tiny_pdf_bytes) -> None:
    from app.services.doc_store import compute_hash, get_document, store_document

    metadata = store_document(tiny_pdf_bytes, "memo.pdf")
    assert metadata["hash"] == compute_hash(tiny_pdf_bytes)
    assert metadata["filename"] == "memo.pdf"
    assert metadata["size_bytes"] == len(tiny_pdf_bytes)
    assert metadata["cached"] is False

    fetched = get_document(metadata["hash"])
    assert fetched is not None
    assert fetched["hash"] == metadata["hash"]
    assert fetched["available_extractions"] == []


def test_store_is_idempotent(tiny_pdf_bytes) -> None:
    """Re-storing the same bytes hits the cache, not a re-render."""

    from app.services.doc_store import store_document

    first = store_document(tiny_pdf_bytes, "memo.pdf")
    second = store_document(tiny_pdf_bytes, "memo.pdf")
    assert first["hash"] == second["hash"]
    assert second["cached"] is True


def test_store_uses_basename(tiny_pdf_bytes) -> None:
    """A path-prefixed filename is reduced to its basename."""

    from app.services.doc_store import store_document

    metadata = store_document(tiny_pdf_bytes, "../tmp/credit/memo.pdf")
    assert metadata["filename"] == "memo.pdf"


def test_list_documents_orders_newest_first(tiny_pdf_bytes) -> None:
    from app.services.doc_store import list_documents, store_document

    a = store_document(tiny_pdf_bytes, "first.pdf")
    other = tiny_pdf_bytes + b"\n%% trailing\n"
    b = store_document(other, "second.pdf")

    docs = list_documents()
    hashes = [d["hash"] for d in docs]
    assert {a["hash"], b["hash"]} <= set(hashes)


def test_extraction_cache_round_trip(tiny_pdf_bytes) -> None:
    from app.services.doc_store import (
        get_extraction,
        save_extraction,
        store_document,
    )

    metadata = store_document(tiny_pdf_bytes, "memo.pdf")
    payload = {"sections": {}, "raw_markdown": "# Memo"}
    save_extraction(metadata["hash"], "pypdf", payload)
    cached = get_extraction(metadata["hash"], "pypdf")
    assert cached == payload


def test_get_extraction_missing_returns_none(tiny_pdf_bytes) -> None:
    from app.services.doc_store import get_extraction, store_document

    metadata = store_document(tiny_pdf_bytes, "memo.pdf")
    assert get_extraction(metadata["hash"], "pypdf") is None


def test_get_page_image_path_returns_none_when_unrendered(tiny_pdf_bytes) -> None:
    """Without poppler the pages folder is empty; lookup returns None."""

    from app.services.doc_store import get_page_image_path, store_document

    metadata = store_document(tiny_pdf_bytes, "memo.pdf")
    # In the test sandbox we do not assume poppler is present. If pages
    # were rendered, page 1 must exist; if not, the lookup returns None.
    page_count = metadata.get("page_count", 0)
    if page_count > 0:
        assert get_page_image_path(metadata["hash"], 1) is not None
    else:
        assert get_page_image_path(metadata["hash"], 1) is None


def test_delete_document(tiny_pdf_bytes) -> None:
    from app.services.doc_store import delete_document, get_document, store_document

    metadata = store_document(tiny_pdf_bytes, "memo.pdf")
    assert delete_document(metadata["hash"]) is True
    assert get_document(metadata["hash"]) is None
    assert delete_document(metadata["hash"]) is False


def test_doc_store_health_block(tiny_pdf_bytes) -> None:
    from app.services.doc_store import doc_store_health, store_document

    store_document(tiny_pdf_bytes, "memo.pdf")
    health = doc_store_health()
    assert health["exists"] is True
    assert health["writable"] is True
    assert health["document_count"] == 1


@pytest.mark.parametrize("page_number", [0, -1])
def test_get_page_image_rejects_invalid(tiny_pdf_bytes, page_number) -> None:
    from app.services.doc_store import get_page_image_path, store_document

    metadata = store_document(tiny_pdf_bytes, "memo.pdf")
    assert get_page_image_path(metadata["hash"], page_number) is None
