"""Text normalisation helpers, ported verbatim from the agentmemo reference.

The exact form of :func:`_normalize_text` is part of the integration contract —
extracted markdown is downstream-compared in tests against the reference, so we
must not "improve" the function in passing.
"""

from __future__ import annotations

import re

# why: keep these constants module-level so we don't pay the regex compile cost
# per call in tight extraction loops.
_TRIPLE_NEWLINE_RE = re.compile(r"\n{3,}")


def _normalize_text(text: str) -> str:
    """Normalise UTF-8, line endings, and collapse excess blank lines.

    Verbatim port of the agentmemo helper. Do NOT modify behaviour without a
    paired update on the reference side.

    Args:
        text: Arbitrary text, possibly containing mixed encodings or line endings.

    Returns:
        Text re-encoded as UTF-8 (replacing un-decodable bytes), with ``\\r\\n``
        and lone ``\\r`` collapsed to ``\\n``, and runs of 3+ newlines collapsed
        to exactly two. The result is also ``strip``-ed.
    """

    text = text.encode("utf-8", errors="replace").decode("utf-8")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _TRIPLE_NEWLINE_RE.sub("\n\n", text)
    return text.strip()


def normalize_text(text: str) -> str:
    """Public wrapper around :func:`_normalize_text` for callers that prefer
    a non-underscored name.
    """

    return _normalize_text(text)
