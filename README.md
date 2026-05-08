# Lisa-Sentinel

Internal credit-memo extraction, Q&A, and scenario screening for a bank.

v2 POC. Runs on Domino with Azure OpenAI and Azure Document Intelligence
(no API keys — Azure AD via `DefaultAzureCredential`).

**New here?** Start with [`DEMO.md`](DEMO.md) for setup and verification, or
[`prompts_for_agents/ONBOARD_NEW_DEVELOPER.md`](prompts_for_agents/ONBOARD_NEW_DEVELOPER.md)
if you're a developer (or AI assistant) coming to the codebase for the first
time.

## Stack

- **Backend:** Flask 3 — application factory + blueprint-per-route.
- **Frontend:** React 18 + TypeScript 5 + Vite 6 + Tailwind 3 + Lucide. Vanilla
  fetch (no router, no component library, no CDN).
- **LLM:** LangChain + LangGraph against Azure OpenAI, structured outputs via
  Pydantic v2.
- **Document parsing:** Azure Document Intelligence (primary) with `pypdf`
  and optional Tesseract OCR fallbacks, switchable via `MEMO_PDF_PARSER`.

## Quick start (local)

```bash
make install
cp .env.example .env   # fill values
make build && make run
```

The app boots on `http://localhost:8080`. For dev mode with hot-reload of
the frontend, run `python run.py` in one terminal and `cd frontend && npm
run dev` in another. In Domino, the SPA sits behind the `/proxy/<port>/`
HTTP proxy — see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Layout

| Path | Purpose |
| --- | --- |
| `app/` | Flask app — factory, blueprint routes, services, prompts. |
| `app/routes/` | Seven blueprints: health, documents, extraction, prompts, dev, jobs, spa. |
| `app/services/` | Azure auth, LLM, parsers, extraction, embeddings, jobs, prompt manager, storage. |
| `app/prompts/` | Plain-text LLM prompt templates. |
| `frontend/` | React/Vite SPA. The `make build` step produces `frontend/dist/` which Flask serves via the `spa` blueprint. |
| `frontend/src/components/` | All UI components (UploadArea, ExtractionConfig, ModeSelector, three mode workspaces, DevPromptPanel, etc.). |
| `frontend/src/contexts/` | Health, Layout, Session, Workspace, DevPrompts contexts plus `use<Name>.ts` hook files. |
| `docs/` | Architecture, deployment, constraints, design system, UX contract, extraction pipeline. |
| `prompts_for_agents/` | Ready-made prompt templates for AI coding assistants — drop in a change request and they enforce the project's constraints. |
| `tests/` | Backend smoke tests (no live Azure calls). |
| `frontend/src/__tests__/` | Frontend tests (vitest + React Testing Library). |
| `scripts/` | Operator utilities (`check_environment.py`, `run_dev.sh`). |

## Documentation

| Doc | When to read |
| --- | --- |
| [`DEMO.md`](DEMO.md) | First-time setup, dev workflow, Domino smoke checklist |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System overview, data flow, state machine |
| [`docs/CONSTRAINTS.md`](docs/CONSTRAINTS.md) | Domino + Azure rules and the why behind them |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Build step, env vars, system deps, proxy paths |
| [`docs/EXTRACTION_PIPELINE.md`](docs/EXTRACTION_PIPELINE.md) | How extraction → embeddings → Q&A flows |
| [`docs/FRONTEND_DESIGN.md`](docs/FRONTEND_DESIGN.md) | Component inventory and visual language |
| [`docs/UX_CONTRACT.md`](docs/UX_CONTRACT.md) | Features that survive rewrites |
| [`prompts_for_agents/`](prompts_for_agents/) | Drop-in prompts for AI-assisted edits |

## Working with AI coding assistants

Drop one of the [`prompts_for_agents/`](prompts_for_agents/) templates into your
assistant (Claude Code, Cursor, Copilot Chat) along with your change
description. Each template encodes the project's constraints (relative API
paths, Azure-AD-only auth, structured-output discipline, the Domino proxy)
so the assistant doesn't drift.

## Health

`GET /api/health` is the canonical readiness endpoint. It surfaces parser
availability, doc-store writability, environment variables present/missing,
and the Azure credential chain in use. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
for the full schema.

## Tests

```bash
make test           # Backend (pytest, 48 smoke tests)
make frontend-test  # Frontend (vitest, 42 tests including the mode flows)
make lint           # Backend (ruff)
make frontend-lint  # Frontend (eslint, 0 warnings target)
make build          # Frontend production build → frontend/dist/
```
