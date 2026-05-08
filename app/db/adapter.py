"""Abstract DB adapter interface.

Implementations live in sibling modules. v1 ships :class:`NullDBAdapter`; v2+
will add Postgres and Databricks.

The interface is intentionally narrow — only the operations the routes care
about. Each method accepts plain dicts so consumers don't need to import
SQLAlchemy / Spark / etc. just to read it.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class DBAdapter(ABC):
    """The DB-shaped operations the app may persist.

    All methods are synchronous. v2+ adapters can wrap async drivers behind a
    blocking shim if necessary — the route layer doesn't await.
    """

    @abstractmethod
    def save_run(self, run_id: str, payload: dict[str, Any]) -> None:
        """Persist a job/run record."""

    @abstractmethod
    def list_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        """Return the most-recent runs (descending start time)."""

    @abstractmethod
    def get_run(self, run_id: str) -> dict[str, Any] | None:
        """Look up a single run."""

    @abstractmethod
    def save_memo(self, pdf_key: str, payload: dict[str, Any]) -> None:
        """Persist a memo entry — mirrors :func:`app.services.memo_store.save_memo`."""

    @abstractmethod
    def list_memos(self) -> list[dict[str, Any]]:
        """Return all stored memos."""

    @abstractmethod
    def get_memo(self, pdf_key: str) -> dict[str, Any] | None:
        """Look up a single memo."""

    @abstractmethod
    def delete_memo(self, pdf_key: str) -> bool:
        """Delete a memo. Returns ``True`` if it existed."""

    @abstractmethod
    def append_structured_results(
        self, pdf_key: str, rows: list[dict[str, Any]]
    ) -> None:
        """Append structured-extraction rows to a memo."""
