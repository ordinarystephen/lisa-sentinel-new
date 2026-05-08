"""``GET /api/health`` — simplified post-Stage-1 contract.

The tier-resolver fields are gone; doc-store + page-rendering probes take
their place. The Azure / parser / env-var blocks are unchanged from Phase 2C.
"""

from __future__ import annotations

from flask import Blueprint, jsonify

from app.config import get_settings
from app.services import azure_auth, doc_store, parsers, section_presets

bp = Blueprint("health", __name__, url_prefix="/api")

SERVICE_NAME = "lisa-sentinel"
SERVICE_VERSION = "0.2.0"


@bp.get("/health")
def health():
    """Return the health envelope."""

    settings = get_settings()
    caps = parsers.probe_capabilities()
    parser_payload: dict[str, str] = {}
    for name, cap in caps.items():
        parser_payload[name] = "available" if cap.available else (
            f"unavailable: {cap.reason}" if cap.reason else "unavailable"
        )
    parser_payload["available_presets"] = section_presets.preset_names()

    body = {
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "status": "ok",
        "doc_store": doc_store.doc_store_health(),
        "page_rendering": "available" if doc_store.page_rendering_available() else "unavailable",
        "parsers": parser_payload,
        "active_parser": settings.memo_pdf_parser,
        "env_present": settings.env_present(),
        "env_missing": settings.env_missing(),
        "azure": {
            "credential_chain": azure_auth.credential_chain_name(),
            "doc_intel_endpoint": settings.azure_docintel_endpoint,
            "openai_endpoint": settings.azure_openai_endpoint or "<unset>",
        },
    }
    return jsonify(body)
