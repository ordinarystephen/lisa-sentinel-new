"""``/api/health`` v0.2 contract tests."""

from __future__ import annotations


def test_health_returns_200(client) -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["service"] == "lisa-sentinel"
    assert body["version"] == "0.2.0"
    assert body["status"] == "ok"


def test_health_has_doc_store_block(client) -> None:
    body = client.get("/api/health").get_json()
    block = body["doc_store"]
    assert set(block) >= {"path", "exists", "writable", "document_count"}
    assert isinstance(block["exists"], bool)
    assert isinstance(block["writable"], bool)
    assert isinstance(block["document_count"], int)


def test_health_advertises_page_rendering_state(client) -> None:
    body = client.get("/api/health").get_json()
    assert body["page_rendering"] in {"available", "unavailable"}


def test_health_parsers_block_includes_presets(client) -> None:
    body = client.get("/api/health").get_json()
    parsers = body["parsers"]
    assert "available_presets" in parsers
    assert "generic" in parsers["available_presets"]
    assert "quarterly_review" in parsers["available_presets"]


def test_health_drops_legacy_storage_tier_keys(client) -> None:
    """Stage 1 dropped the tier resolver. The old ``storage`` block must be gone."""

    body = client.get("/api/health").get_json()
    assert "storage" not in body


def test_health_env_lists_disjoint(client) -> None:
    body = client.get("/api/health").get_json()
    present = set(body["env_present"])
    missing = set(body["env_missing"])
    assert present.isdisjoint(missing)
