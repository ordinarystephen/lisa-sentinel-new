"""Document lifecycle routes — upload, list, fetch, page images.

The doc-store handles persistence and page rendering. This blueprint is a
thin HTTP shim.
"""

from __future__ import annotations

from pathlib import Path

from flask import Blueprint, abort, jsonify, request, send_file

from app.services import doc_store

bp = Blueprint("documents", __name__, url_prefix="/api/documents")


@bp.post("/upload")
def upload():
    """Accept one or more PDFs by upload OR a server-side folder path.

    Request shapes (any one of):
      * ``multipart/form-data`` with a ``file`` part.
      * ``multipart/form-data`` with one or more ``files[]`` parts.
      * ``application/json`` with ``{"folder_path": "..."}``.
    """

    items = _collect_pdfs()
    if not items:
        return jsonify({"error": "no_pdfs", "message": "No PDFs supplied."}), 400

    documents: list[dict] = []
    cached_hashes: list[str] = []
    for filename, data in items:
        metadata = doc_store.store_document(data, filename)
        if metadata.get("cached"):
            cached_hashes.append(metadata["hash"])
        documents.append(_clean_metadata(metadata))
    return jsonify({"documents": documents, "cached": cached_hashes})


@bp.get("")
def list_documents():
    """Return every stored document, newest first."""

    docs = [_clean_metadata(m) for m in doc_store.list_documents()]
    return jsonify({"documents": docs})


@bp.get("/<doc_hash>")
def get_document(doc_hash: str):
    """Return one document's metadata + available extraction modes."""

    metadata = doc_store.get_document(doc_hash)
    if metadata is None:
        return jsonify({"error": "not_found", "hash": doc_hash}), 404
    return jsonify(_clean_metadata(metadata))


@bp.get("/<doc_hash>/pages/<int:page_number>")
def get_page_image(doc_hash: str, page_number: int):
    """Serve the rendered PNG for one page."""

    path = doc_store.get_page_image_path(doc_hash, page_number)
    if path is None:
        abort(404)
    return send_file(path, mimetype="image/png")


@bp.delete("/<doc_hash>")
def delete_document(doc_hash: str):
    """Remove a document and every artefact under its hash folder."""

    deleted = doc_store.delete_document(doc_hash)
    if not deleted:
        return jsonify({"error": "not_found", "hash": doc_hash}), 404
    return jsonify({"deleted": True, "hash": doc_hash})


def _collect_pdfs() -> list[tuple[str, bytes]]:
    """Pull PDFs out of the request body. Returns ``[(filename, bytes)]``."""

    items: list[tuple[str, bytes]] = []
    if request.files:
        for key in ("files[]", "files", "file"):
            for upload_ in request.files.getlist(key):
                if not upload_ or not upload_.filename:
                    continue
                items.append((upload_.filename, upload_.read()))
        # Avoid duplicates if the same key was hit twice.
        seen: set[tuple[str, int]] = set()
        deduped: list[tuple[str, bytes]] = []
        for name, data in items:
            key = (name, len(data))
            if key in seen:
                continue
            seen.add(key)
            deduped.append((name, data))
        items = deduped
    elif request.is_json:
        body = request.get_json(silent=True) or {}
        folder = (body.get("folder_path") or "").strip()
        if folder:
            base = Path(folder)
            if base.is_dir():
                for pdf in sorted(base.glob("*.pdf")):
                    items.append((pdf.name, pdf.read_bytes()))
    return items


def _clean_metadata(metadata: dict) -> dict:
    """Strip filesystem-internal fields before returning to the client."""

    safe = {k: v for k, v in metadata.items() if k != "source_path"}
    return safe
