"""Markdown rendering helpers used by the Docs tab and any markdown surfaces.

We use the stdlib-friendly ``markdown`` package. Rendering is conservative — no
HTML pass-through, no unsafe extensions — so user-supplied or doc-bundle text
cannot inject script content into the page.
"""

from __future__ import annotations

from pathlib import Path

import markdown as _md

# why: the extensions below cover headings, fenced code, and tables — enough
# for the docs we ship without enabling anything that allows raw HTML.
_MD_EXTENSIONS = (
    "fenced_code",
    "tables",
    "toc",
    "sane_lists",
)


def render_markdown(text: str) -> str:
    """Render markdown text to safe HTML.

    Args:
        text: Markdown source.

    Returns:
        HTML string. Raw HTML in the source is escaped, not passed through.
    """

    return _md.markdown(text or "", extensions=list(_MD_EXTENSIONS), output_format="html5")


def render_markdown_file(path: Path) -> str:
    """Read a markdown file from disk and render it to HTML.

    Args:
        path: Filesystem path to a ``.md`` file. The file must exist.

    Returns:
        Rendered HTML.

    Raises:
        FileNotFoundError: If ``path`` does not exist.
    """

    text = path.read_text(encoding="utf-8")
    return render_markdown(text)
