"""Extraction routes — kick off batch extraction + read cached results.

The heavy lifting lives in :mod:`app.services.extraction`. This blueprint
queues a background job for batch runs and exposes a synchronous read for
already-cached extractions.
"""

from __future__ import annotations

from typing import Any

from flask import Blueprint, jsonify, request

from app.services import doc_store, extraction, jobs, section_presets

bp = Blueprint("extraction", __name__, url_prefix="/api/extraction")


@bp.get("/presets")
def list_presets():
    """Return every section-header preset for the UI dropdown."""

    return jsonify({"presets": section_presets.describe_presets()})


@bp.post("/run")
def run_extraction():
    """Queue a batch extraction job.

    Body fields:
      * ``document_hashes`` — list of doc-store hashes.
      * ``parser_mode`` — e.g. ``docintel-official``.
      * ``section_preset`` — optional preset name (see ``/api/extraction/presets``).
      * ``force_reextract`` — bool, default false.
      * ``concurrency`` — int, default 4.
    """

    body = request.get_json(silent=True) or {}
    hashes = list(body.get("document_hashes") or [])
    if not hashes:
        return jsonify({"error": "no_documents"}), 400
    parser_mode = (body.get("parser_mode") or "docintel-official").strip()
    section_preset = body.get("section_preset")
    force_reextract = bool(body.get("force_reextract") or False)
    concurrency = int(body.get("concurrency") or 4)

    def runner(ctx) -> dict[str, Any]:
        ctx.update(message=f"extracting {len(hashes)} document(s)")

        def on_progress(done: int, total: int, doc_hash: str) -> None:
            ctx.update(
                progress=int(done / max(1, total) * 100),
                message=f"[{done}/{total}] {doc_hash[:12]}",
            )

        rows = extraction.extract_batch(
            hashes,
            parser_mode=parser_mode,
            section_preset=section_preset,
            force_reextract=force_reextract,
            concurrency=concurrency,
            on_progress=on_progress,
        )
        ctx.update(progress=100, message="extraction complete")
        return {"results": rows}

    job_id = jobs.submit(runner, kind="extraction")
    return jsonify({"job_id": job_id})


@bp.get("/<doc_hash>/<parser_mode>")
def get_cached(doc_hash: str, parser_mode: str):
    """Return the cached extraction for ``(doc_hash, parser_mode)``."""

    metadata = doc_store.get_document(doc_hash)
    if metadata is None:
        return jsonify({"error": "document_not_found", "hash": doc_hash}), 404
    payload = doc_store.get_extraction(doc_hash, parser_mode)
    if payload is None:
        return jsonify({"error": "extraction_not_found"}), 404
    return jsonify(payload)
