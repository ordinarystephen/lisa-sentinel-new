# Prompt: Onboard a New Developer (or Agent)

This prompt orients someone (human or AI assistant) coming to the
Lisa-Sentinel codebase for the first time. Hand it to them along with
"please read all of the linked docs in order, then summarize back to me
what this codebase does and what's off-limits."

## Purpose

Get to first useful contribution in under a day. By the end of this
read-through you should be able to:
- Explain the four-step user flow (upload → extract → mode → result).
- Name the seven backend blueprints.
- List the rules you can't break (the constraints in the shared README).
- Find the right `prompts_for_agents/UPDATE_*.md` for any change you
  want to make.
- Run the app locally and run the tests.

## Read these in order

1. **[`/README.md`](../README.md)** — one-page orientation. Names the
   project, points to everything else.
2. **[`/DEMO.md`](../DEMO.md)** — how to run the app, both locally
   without Azure (UI works, runs that touch Azure show graceful errors)
   and with full Azure access. The Domino smoke checklist is here.
3. **[`/docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)** — system
   overview. Read the API surface table; read the state machine; read
   the data-flow narrative for a typical run.
4. **[`/docs/CONSTRAINTS.md`](../docs/CONSTRAINTS.md)** — the rules. If
   any constraint surprises you, that's the document to revisit when
   you're tempted to deviate.
5. **[`/docs/EXTRACTION_PIPELINE.md`](../docs/EXTRACTION_PIPELINE.md)**
   — how a PDF becomes structured text becomes embeddings becomes a
   prompt context. Sets expectations for parser swaps + prompt edits.
6. **[`/docs/FRONTEND_DESIGN.md`](../docs/FRONTEND_DESIGN.md)** — visual
   language and component inventory. Skim if you're backend-only;
   read carefully if you're touching the UI.
7. **[`/STAGE_1_SUMMARY.md`](../STAGE_1_SUMMARY.md)** — backend
   reshape: routes split into blueprints, services stand alone.
8. **[`/STAGE_2_SUMMARY.md`](../STAGE_2_SUMMARY.md)** — frontend
   foundation: React + Vite + Tailwind, contexts, layout shell.
9. **[`/STAGE_3_SUMMARY.md`](../STAGE_3_SUMMARY.md)** — three modes
   (Single Prompt, Multi-Step, Scenario). The state-machine diagram is
   essential.
10. **[`/STAGE_3_SELFTEST.md`](../STAGE_3_SELFTEST.md)** — wiring audit.
    The flow-by-flow trace is the best map of how a click in the UI
    becomes a backend response.
11. **[`/BUILD_SUMMARY.md`](../BUILD_SUMMARY.md)** and
    **[`/PHASE_2C_SUMMARY.md`](../PHASE_2C_SUMMARY.md)** — pre-Stage-1
    history. Useful when you find an old file with no obvious owner.

## Tour the codebase

```
lisa-sentinel/
├── app/                          # Flask backend
│   ├── __init__.py               # Application factory; registers blueprints
│   ├── config.py                 # Settings (env vars + defaults)
│   ├── routes/                   # Seven blueprints
│   │   ├── health.py             # GET /api/health
│   │   ├── documents.py          # Upload, list, fetch, delete, page images
│   │   ├── extraction.py         # POST /api/extraction/run, GET presets
│   │   ├── prompts.py            # POST /api/prompts/{single,multi-step,scenario}
│   │   ├── dev.py                # GET / PUT /api/dev/prompts (override panel)
│   │   ├── jobs.py               # GET /<id>/status, POST /<id>/cancel
│   │   └── spa.py                # Catch-all for the React SPA
│   ├── services/                 # Business logic, no Flask imports
│   │   ├── azure_auth.py         # DefaultAzureCredential + token provider
│   │   ├── llm.py                # AzureChatOpenAI factory (uses azure_auth)
│   │   ├── doc_intelligence.py   # DI client (DO NOT MODIFY — agentmemo port)
│   │   ├── parsers.py            # Dispatch table for parser modes
│   │   ├── section_presets.py    # SECTION_PRESETS dict
│   │   ├── extraction.py         # Per-section LLM extraction; structured-output
│   │   ├── embeddings.py         # Chunking + retrieval (FAISS optional)
│   │   ├── qa.py                 # Single-prompt + multi-step Q&A
│   │   ├── scenario.py           # Scenario screening
│   │   ├── prompt_manager.py     # Loads bundled prompts; holds dev overrides
│   │   ├── jobs.py               # Threaded job system; the only async pattern
│   │   ├── doc_store.py          # Disk-backed metadata + page-image storage
│   │   ├── schemas.py            # Pydantic v2 models (ALL extra="forbid")
│   │   └── validation.py         # validate_or_retry: one retry then envelope
│   └── prompts/                  # Bundled .txt prompt templates
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Provider tree
│   │   ├── main.tsx              # ReactDOM mount
│   │   ├── components/           # All UI (37 files; flat structure)
│   │   ├── contexts/             # 5 contexts; Provider in .tsx, hook in use<Name>.ts
│   │   ├── lib/                  # api.ts (fetch+pollJob), format.ts, types.ts, excel.ts
│   │   ├── styles/               # tokens.css + Tailwind directives
│   │   └── __tests__/            # Vitest suites + fixtures
│   ├── index.html
│   ├── vite.config.ts            # base: "./" — survives Domino proxy
│   └── tailwind.config.js        # Token-driven theme
├── docs/                         # Architecture, constraints, deployment, design
├── prompts_for_agents/           # ⬅ You are here
├── tests/                        # Backend smoke tests (pytest)
├── scripts/                      # Operator utilities
├── doc_store/                    # (Runtime) per-hash document storage
├── Makefile                      # The canonical task list
├── run.py                        # Entry point: python run.py
└── requirements.txt
```

## Local setup

```bash
# 1. Install everything (Python deps + npm deps).
make install

# 2. Copy and fill in the env file.
cp .env.example .env
# Set DOC_STORE_DIR, AZURE_OPENAI_ENDPOINT, AZURE_DOCINTEL_ENDPOINT, etc.
# Without Azure values, the app still boots — runs that need Azure
# return graceful errors.

# 3. Build the frontend (production bundle into frontend/dist/).
make build

# 4. Run.
python run.py    # http://localhost:5000

# Or, dev mode with hot-reload:
#   Terminal A: python run.py        (Flask on 5000)
#   Terminal B: cd frontend && npm run dev   (Vite on 5173, proxies /api → 5000)
```

## Domino setup

The app sits behind Domino's `/proxy/<port>/` HTTP proxy. The Vite base
config is `./` so SPA asset paths survive the proxy prefix. Frontend
fetches use **relative** URLs (`apiGet("dev/prompts")`, never
`/api/dev/prompts`) for the same reason.

Detailed deployment instructions: [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).

## Common tasks → which prompt

| Task | Use |
| --- | --- |
| Add or modify a UI component | [`UPDATE_UI.md`](UPDATE_UI.md) |
| Tweak a prompt or add a schema field | [`UPDATE_LLM.md`](UPDATE_LLM.md) |
| Add a parser mode or section preset | [`UPDATE_PARSING.md`](UPDATE_PARSING.md) |
| Add a feature that crosses backend + frontend | [`ADD_FEATURE.md`](ADD_FEATURE.md) |
| Investigate an open question, no code change | (no template — just read the relevant Stage Summary) |

## The constraints in 30 seconds

(Source of truth: [`README.md`](README.md). Memorize these.)

1. Relative API paths only.
2. Azure AD via `DefaultAzureCredential`. No API keys.
3. Don't modify `doc_intelligence.py` or `azure_auth.py`.
4. Pydantic v2 with `extra="forbid"`. One retry on validation failure.
5. Async work uses `jobs.py`. No WebSockets, no SSE.
6. Workspace state lives in `WorkspaceContext`.
7. Recent prompts in-memory only.
8. Tests are part of every change.
9. No new dependencies without justification.
10. Lint clean (eslint 0 warnings, ruff clean).
11. Build clean (TypeScript 0 errors).

## Halt-and-flag protocol

If a request conflicts with a constraint, halt. Write to `BLOCKER.md`:
the conflict, the constraint-respecting option, and the option that
relaxes the constraint. Default to the constraint-respecting option;
note that you'd need explicit owner sign-off to relax it.

## What to do after onboarding

1. Pick a small change — a typo fix, a copy update, an obvious test
   gap. Use the matching `UPDATE_*.md`.
2. Submit a PR. Verify all five make targets are green.
3. Read the PR review comments carefully. The constraints will be
   enforced; the design choices are negotiable.

Welcome.
