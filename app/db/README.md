# DB Adapter

`app/db/` defines a thin DB-shaped interface (`DBAdapter`) that the route
layer uses for any persistence beyond the file-based memo store.

In v1 the only implementation is `NullDBAdapter`, which:

- Delegates memo persistence to `app.services.memo_store` (which writes to
  the active storage tier).
- Drops run records (no-op).

## Adding Postgres in v2+

1. Add a new adapter file `postgres_adapter.py` that subclasses `DBAdapter`.
2. Use `psycopg` (preferred) and read connection details from env vars
   (`LISA_DB_HOST`, `LISA_DB_NAME`, etc.).
3. Update `app/db/__init__.py::get_adapter` to switch on
   `os.getenv("LISA_DB_ADAPTER")`:

   ```python
   adapter_name = os.getenv("LISA_DB_ADAPTER", "null").lower()
   if adapter_name == "postgres":
       from .postgres_adapter import PostgresAdapter
       _adapter = PostgresAdapter()
   else:
       _adapter = NullDBAdapter()
   ```

4. Add a migration script (alembic / plain SQL) under `scripts/migrations/`.
5. Document the new env vars in `.env.example` and `docs/CONSTRAINTS.md`.
6. Add adapter integration tests under `tests/integration/` (pytest-postgres
   or testcontainers — Domino's network restrictions usually mean these run
   in CI only, not in Domino itself).

## Adding Databricks in v2+

Same pattern — `databricks_adapter.py`, switch on `LISA_DB_ADAPTER=databricks`.
The Databricks SQL connector handles auth via Azure AD tokens, so reuse
`app.services.azure_auth.get_token_provider()` rather than introducing a new
credential path.

See `docs/FUTURE_DB_INTEGRATION.md` for the full design notes.
