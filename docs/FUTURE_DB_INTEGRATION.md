# Future DB Integration

v1 ships with `NullDBAdapter`, which delegates memo persistence to the
file-based `app.services.memo_store` and drops run records. This doc is
the plan for v2+ when we wire a real database.

## Adapter interface

`app/db/adapter.py` defines `DBAdapter`. It is intentionally narrow — only
the operations the routes actually need:

| Method | Purpose |
| --- | --- |
| `save_run` | Persist a job/run record. |
| `list_runs` | Recent runs (descending start time). |
| `get_run` | Single run lookup. |
| `save_memo` | Persist a memo entry. Mirrors `memo_store.save_memo`. |
| `list_memos` | All stored memos. |
| `get_memo` | Single memo lookup. |
| `delete_memo` | Delete a memo. |
| `append_structured_results` | Append structured-extraction rows. |

Adding fields requires a paired update to `NullDBAdapter` so the v1 path
keeps working.

## Postgres adapter

1. Add `psycopg[binary]` to `requirements.txt`.
2. Create `app/db/postgres_adapter.py`:

   ```python
   from .adapter import DBAdapter
   import psycopg
   import json
   import os


   class PostgresAdapter(DBAdapter):
       def __init__(self) -> None:
           self._dsn = os.environ["LISA_DB_DSN"]

       def _conn(self):
           return psycopg.connect(self._dsn)

       def save_memo(self, pdf_key, payload):
           with self._conn() as c, c.cursor() as cur:
               cur.execute(
                   """
                   INSERT INTO memos(pdf_key, payload, updated_at)
                   VALUES (%s, %s::jsonb, NOW())
                   ON CONFLICT (pdf_key) DO UPDATE
                       SET payload = excluded.payload,
                           updated_at = excluded.updated_at;
                   """,
                   (pdf_key, json.dumps(payload, default=str)),
               )
           # ... etc for the other methods
   ```

3. Update `app/db/__init__.py::get_adapter`:

   ```python
   adapter_name = os.getenv("LISA_DB_ADAPTER", "null").lower()
   if adapter_name == "postgres":
       from .postgres_adapter import PostgresAdapter
       _adapter = PostgresAdapter()
   else:
       _adapter = NullDBAdapter()
   ```

4. Add a migration script under `scripts/migrations/0001_init.sql`:

   ```sql
   CREATE TABLE memos (
       pdf_key TEXT PRIMARY KEY,
       payload JSONB NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   CREATE TABLE runs (
       run_id TEXT PRIMARY KEY,
       payload JSONB NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   ```

5. Document the env vars: `LISA_DB_ADAPTER`, `LISA_DB_DSN`. Add to
   `.env.example` and `docs/CONSTRAINTS.md`.

6. Decide whether memos should still write to the file-based store for
   redundancy. Recommended in v2: dual-write for the first month, then
   make Postgres authoritative.

## Databricks adapter

1. Add the Databricks SQL connector to `requirements.txt`. Confirm it can
   reach the workspace via Domino's allowed proxies.
2. Create `app/db/databricks_adapter.py` with the same interface. Use
   `app.services.azure_auth.get_token_provider()` for OAuth — do NOT
   introduce a personal access token.
3. Switch on `LISA_DB_ADAPTER=databricks`.
4. Test pagination — Databricks SQL has different latency characteristics
   from Postgres, and the `list_memos` shape may need a top-N limit.

## When NOT to add a DB adapter

- If only memos need to persist and the file-based store on a mounted
  volume is durable enough.
- If the only motivation is a cross-team data view: a scheduled export
  from the file store to a shared Databricks table is simpler than
  rewiring the runtime.

## Migration path

1. Ship `PostgresAdapter` behind `LISA_DB_ADAPTER=postgres` while keeping
   the file-based path as default.
2. Roll forward: turn on Postgres in lower environments first; verify
   that `save_memo` round-trips and that `list_memos` returns the same
   payloads as the file path.
3. Once production has been parallel-writing for a month, switch the
   default and decommission the file-based store.
