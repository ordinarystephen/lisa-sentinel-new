"""Pytest fixtures shared across smoke tests.

These tests do NOT call live Azure services. They verify the import graph,
the app factory, the doc-store contracts, the prompt manager, the section
presets, and the new ``/api/health`` envelope.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# why: tests live alongside the app — make ``app.*`` importable without
# requiring a pip install.
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


@pytest.fixture(autouse=True)
def _reset_caches(monkeypatch, tmp_path):
    """Per-test reset for module-level caches and the doc-store root.

    Every test gets its own ``DOC_STORE_DIR`` under ``tmp_path`` so writes
    from one test never leak into another.
    """

    monkeypatch.setenv("DOC_STORE_DIR", str(tmp_path / "doc_store"))

    from app import config
    from app.services import azure_auth, jobs

    config.reset_settings_cache()
    azure_auth.reset_for_tests()
    jobs.reset_for_tests()
    yield
    config.reset_settings_cache()
    azure_auth.reset_for_tests()
    jobs.reset_for_tests()


@pytest.fixture()
def app(monkeypatch, tmp_path):
    """Construct a Flask app pointing at a per-test doc store."""

    monkeypatch.setenv("DOC_STORE_DIR", str(tmp_path / "doc_store"))
    monkeypatch.setenv("LISA_LOG_DIR", str(tmp_path / "logs"))

    from app import config, create_app

    config.reset_settings_cache()
    return create_app()


@pytest.fixture()
def client(app):
    """A Flask test client."""

    return app.test_client()


@pytest.fixture()
def tiny_pdf_bytes() -> bytes:
    """Minimal valid PDF used in store/page-render tests."""

    return (
        b"%PDF-1.1\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\n"
        b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n"
        b"0000000052 00000 n \n0000000098 00000 n \n"
        b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF\n"
    )
