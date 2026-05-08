"""Importability smoke test — catches missing pinned-dep issues."""

from __future__ import annotations

import importlib

MODULES = [
    "app",
    "app.config",
    "app.routes",
    "app.routes.health",
    "app.routes.documents",
    "app.routes.extraction",
    "app.routes.prompts",
    "app.routes.dev",
    "app.routes.jobs",
    "app.routes.spa",
    "app.services.azure_auth",
    "app.services.llm",
    "app.services.doc_intelligence",
    "app.services.parsers",
    "app.services.extraction",
    "app.services.embeddings",
    "app.services.qa",
    "app.services.scenario",
    "app.services.jobs",
    "app.services.doc_store",
    "app.services.section_presets",
    "app.services.prompt_manager",
    "app.services.schemas",
    "app.services.validation",
    "app.utils.logging",
    "app.utils.markdown",
    "app.utils.normalize",
    "app.db.adapter",
    "app.db.null_adapter",
]


def test_imports() -> None:
    for name in MODULES:
        importlib.import_module(name)


def test_normalize_text_collapses_blank_lines() -> None:
    from app.utils.normalize import _normalize_text

    raw = "a\r\n\r\n\r\n\r\nb\r\n"
    assert _normalize_text(raw) == "a\n\nb"


def test_chunk_text_basic() -> None:
    from app.services.embeddings import chunk_text

    chunks = chunk_text("a" * 100 + "b" * 100, size=50, overlap=10)
    assert len(chunks) >= 4
    for chunk in chunks:
        assert len(chunk) <= 50
