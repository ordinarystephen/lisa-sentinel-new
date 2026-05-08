# Lisa-Sentinel Documentation

This is the index. Start here.

## Operating

- [DEPLOYMENT.md](DEPLOYMENT.md) — how to deploy on Domino, environment
  variables, system dependencies.
- [CONSTRAINTS.md](CONSTRAINTS.md) — the Domino + Azure constraints we are
  bound to. Read before changing infrastructure-adjacent code.
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — failure modes and the fixes
  the team has already validated.

## Engineering

- [ARCHITECTURE.md](ARCHITECTURE.md) — system overview, data flow,
  responsibilities.
- [EXTRACTION_PIPELINE.md](EXTRACTION_PIPELINE.md) — how a PDF becomes a
  structured memo entry.
- [FUTURE_DB_INTEGRATION.md](FUTURE_DB_INTEGRATION.md) — adapter interface
  and v2+ plan for Postgres/Databricks.

## Product / UX

- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — visual language, component patterns,
  what NOT to do.
- [UX_CONTRACT.md](UX_CONTRACT.md) — features that must be preserved across
  rewrites.

## Getting started

```bash
make install       # install Python deps
cp .env.example .env  # fill in values
make test          # smoke tests, no live calls
make run           # boot Flask on http://localhost:8080
```

For the Domino deployment story, jump straight to
[DEPLOYMENT.md](DEPLOYMENT.md).
