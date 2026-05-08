"""Prompt-manager override / fallback tests."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _no_lingering_overrides():
    """Each test starts with no override files."""

    from app.services import prompt_manager

    for mode in prompt_manager.ALLOWED_MODES:
        prompt_manager.clear_override(mode)
    yield
    for mode in prompt_manager.ALLOWED_MODES:
        prompt_manager.clear_override(mode)


def test_get_prompts_returns_bundled_when_no_override() -> None:
    from app.services import prompt_manager

    prompts = prompt_manager.get_prompts("section_extraction")
    assert prompts["system"]
    assert prompts["user"] is not None
    assert "{section_name}" in prompts["user"]


def test_memo_qa_has_no_user_template() -> None:
    """``memo_qa`` composes its user message inline; ``user`` is None."""

    from app.services import prompt_manager

    prompts = prompt_manager.get_prompts("memo_qa")
    assert prompts["system"]
    assert prompts["user"] is None


def test_set_override_persists_and_returns_active() -> None:
    from app.services import prompt_manager

    new_system = "STAGE 1 TEST: pretend system prompt."
    result = prompt_manager.set_override("memo_qa", system=new_system)
    assert result["system"] == new_system

    again = prompt_manager.get_prompts("memo_qa")
    assert again["system"] == new_system


def test_partial_override_falls_back_to_bundled_for_missing_half() -> None:
    """Setting only ``user`` keeps the bundled ``system``."""

    from app.services import prompt_manager

    bundled_system = prompt_manager.get_prompts("section_extraction")["system"]
    prompt_manager.set_override("section_extraction", user="REPLACED USER TEMPLATE")

    prompts = prompt_manager.get_prompts("section_extraction")
    assert prompts["system"] == bundled_system
    assert prompts["user"] == "REPLACED USER TEMPLATE"


def test_clear_override_returns_to_bundled() -> None:
    from app.services import prompt_manager

    prompt_manager.set_override("scenario_screening", system="OVERRIDDEN")
    assert prompt_manager.has_override("scenario_screening") is True
    prompt_manager.clear_override("scenario_screening")
    assert prompt_manager.has_override("scenario_screening") is False
    prompts = prompt_manager.get_prompts("scenario_screening")
    assert "Insufficient Evidence" in prompts["system"]


def test_unknown_mode_raises() -> None:
    from app.services import prompt_manager

    with pytest.raises(ValueError):
        prompt_manager.get_prompts("excel_extraction")  # cut in Stage 1


def test_list_active_prompts_includes_every_mode() -> None:
    from app.services import prompt_manager

    snapshot = prompt_manager.list_active_prompts()
    assert set(snapshot.keys()) == set(prompt_manager.ALLOWED_MODES)
