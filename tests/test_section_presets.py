"""Section-preset lookup tests."""

from __future__ import annotations


def test_generic_preset_returns_none() -> None:
    from app.services.section_presets import get_preset

    assert get_preset("generic") is None
    assert get_preset(None) is None
    assert get_preset("") is None
    assert get_preset("unknown_template") is None


def test_known_preset_returns_headers() -> None:
    from app.services.section_presets import get_preset

    headers = get_preset("quarterly_review")
    assert headers is not None
    assert "Borrower Overview" in headers
    assert "Recommendation" in headers


def test_describe_presets_shape() -> None:
    from app.services.section_presets import describe_presets

    presets = describe_presets()
    names = {p["name"] for p in presets}
    assert {"generic", "quarterly_review", "annual_review"} <= names
    for preset in presets:
        assert isinstance(preset["headers"], list)
        assert isinstance(preset["description"], str)


def test_preset_names_includes_generic() -> None:
    from app.services.section_presets import preset_names

    names = preset_names()
    assert "generic" in names
    assert "quarterly_review" in names
