"""Section-header presets for templatised credit-memo formats.

When the user knows a document follows the bank's quarterly or annual review
template, we can skip heuristic header detection and treat the canonical
heading list as authoritative section boundaries. This is faster (no regex
scan) and more accurate (no near-miss heading mismatches).

Generic mode (``None`` or unknown name) falls back to the existing
``extraction.split_sections`` heuristic.

To add a new template: append to ``SECTION_PRESETS`` and the new mode shows
up in ``GET /api/extraction/presets`` automatically.
"""

from __future__ import annotations

from typing import TypedDict


class SectionPreset(TypedDict):
    """Schema returned by :func:`describe_presets`."""

    name: str
    headers: list[str]
    description: str


# why: the values are the canonical headers as they appear in the bank's
# template documents. Matching is case-insensitive and substring-based — see
# ``extraction.split_sections``.
SECTION_PRESETS: dict[str, dict[str, list[str] | str]] = {
    "generic": {
        "headers": [],
        "description": "No pre-defined headers. Falls back to heuristic header detection.",
    },
    "quarterly_review": {
        "headers": [
            "Borrower Overview",
            "Transaction Summary",
            "Financial Highlights",
            "Covenant Compliance",
            "Risk Factors",
            "Recommendation",
        ],
        "description": "Bank quarterly credit review template.",
    },
    "annual_review": {
        "headers": [
            "Executive Summary",
            "Borrower Profile",
            "Financial Performance",
            "Industry Analysis",
            "Covenant Status",
            "Risk Assessment",
            "Outlook",
            "Recommendation",
        ],
        "description": "Bank annual credit review template.",
    },
}


def get_preset(name: str | None) -> list[str] | None:
    """Return the canonical header list for ``name``.

    Args:
        name: Preset key (e.g. ``"quarterly_review"``). ``None`` or unknown
            names route the caller back to heuristic detection.

    Returns:
        List of headers when a non-empty preset is configured. ``None`` for
        the generic / unknown case.
    """

    if not name:
        return None
    preset = SECTION_PRESETS.get(name)
    if preset is None:
        return None
    headers = preset.get("headers") or []
    return list(headers) if headers else None


def describe_presets() -> list[SectionPreset]:
    """Return every preset as a JSON-serialisable list for the UI dropdown."""

    out: list[SectionPreset] = []
    for name, payload in SECTION_PRESETS.items():
        out.append(
            {
                "name": name,
                "headers": list(payload.get("headers") or []),
                "description": str(payload.get("description") or ""),
            }
        )
    return out


def preset_names() -> list[str]:
    """Return the list of preset keys (used by ``/api/health``)."""

    return list(SECTION_PRESETS.keys())
