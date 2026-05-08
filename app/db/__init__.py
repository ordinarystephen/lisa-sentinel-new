"""DB adapter package — interface in :mod:`app.db.adapter`, v1 no-op in
:mod:`app.db.null_adapter`. See ``app/db/README.md`` for the v2+ extension plan.
"""

from __future__ import annotations

from .adapter import DBAdapter
from .null_adapter import NullDBAdapter

__all__ = ["DBAdapter", "NullDBAdapter", "get_adapter"]


_adapter: DBAdapter | None = None


def get_adapter() -> DBAdapter:
    """Return the cached adapter singleton.

    v1 always returns :class:`NullDBAdapter`; in v2+ the selection will be
    driven by an env var (e.g. ``LISA_DB_ADAPTER=postgres``).
    """

    global _adapter
    if _adapter is None:
        _adapter = NullDBAdapter()
    return _adapter
