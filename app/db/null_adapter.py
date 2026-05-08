"""Stage 1 no-op DB adapter.

The ``memo_store`` module that the previous adapter delegated to was deleted
in Stage 1; document persistence now lives under
:mod:`app.services.doc_store`. The DB-adapter interface stays wired so v2+
can plug in Postgres / Databricks without touching the HTTP layer, but in
v1 every method is a no-op.
"""

from __future__ import annotations

from typing import Any

from .adapter import DBAdapter


class NullDBAdapter(DBAdapter):
    """No-op adapter — every method returns the empty value for its type."""

    def save_run(self, run_id: str, payload: dict[str, Any]) -> None:  # noqa: D401
        return None

    def list_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        return []

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        return None

    def save_memo(self, pdf_key: str, payload: dict[str, Any]) -> None:
        return None

    def list_memos(self) -> list[dict[str, Any]]:
        return []

    def get_memo(self, pdf_key: str) -> dict[str, Any] | None:
        return None

    def delete_memo(self, pdf_key: str) -> bool:
        return False

    def append_structured_results(
        self, pdf_key: str, rows: list[dict[str, Any]]
    ) -> None:
        return None
