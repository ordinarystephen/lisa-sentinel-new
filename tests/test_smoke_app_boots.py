"""App-factory smoke test."""

from __future__ import annotations


def test_app_factory_creates_app(app) -> None:
    assert app is not None
    expected = {"health", "documents", "extraction", "prompts", "jobs", "dev", "spa"}
    assert expected.issubset(app.blueprints.keys())


def test_index_serves_placeholder_when_no_build(client) -> None:
    """Without a frontend build the SPA route serves the Stage 1 placeholder."""

    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.get_data(as_text=True)
    assert "Lisa-Sentinel" in body


def test_unknown_path_falls_through_to_spa(client) -> None:
    """Any non-API path returns the SPA shell so client-side routing works."""

    resp = client.get("/some/deep/path")
    assert resp.status_code == 200
    body = resp.get_data(as_text=True)
    assert "Lisa-Sentinel" in body


def test_unknown_api_path_returns_404(client) -> None:
    """API misses MUST be 404, not the SPA shell."""

    resp = client.get("/api/does-not-exist")
    assert resp.status_code == 404
