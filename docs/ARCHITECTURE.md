# Architecture

## Goals

Lisa-Sentinel is the v1 POC for an internal credit-memo intelligence
application. It lives behind Domino's HTTP proxy, calls Azure OpenAI and
Azure Document Intelligence over Domino-managed network paths, and never
talks to the public internet.

Three primary use cases:

1. **Memo extraction** — turn PDFs into structured section-level memo
   entries.
2. **Q&A** — answer analyst questions against one or many documents.
3. **Scenario screening** — score every document against a stress scenario.

## Stage 1 reshape (May 2026)

The Phase 1 / 2C build was a Flask app with a Jinja-rendered shell and
vanilla-JS modules. Stage 1 split that in two:

- The Flask process is now an **API server**. Every surface lives under
  `/api/...`. A single SPA-serving catch-all route returns the React build
  from `frontend/dist/` for any other path.
- The previous tier resolver and memo store are gone. A single
  **content-addressed doc store** (`doc_store/<sha256>/...`) replaces both.
- Excel structured extraction is **cut**.
- Prompt files are loaded via a **prompt manager** that respects per-mode
  runtime overrides written by the dev panel (Stage 3).

## High-level diagram

```
              ┌────────────────────────────────────────────────────┐
              │              React SPA (Stage 2)                   │
              │              served from frontend/dist             │
              └─────────────────────┬──────────────────────────────┘
                                    │  fetch /api/...
                                    ▼
              ┌────────────────────────────────────────────────────┐
              │ Flask app (run.py) — API + SPA catch-all           │
              │  - Blueprints: health, documents, extraction,      │
              │                prompts, dev, jobs, spa             │
              │  - Async jobs (ThreadPoolExecutor)                 │
              └─────────────────────┬──────────────────────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
┌──────────────┐         ┌────────────────────┐         ┌──────────────────────┐
│ doc_store    │         │ extraction +       │         │ prompt_manager       │
│  hash-keyed  │◀────────│ embeddings +       │────────▶│ bundled + dev        │
│  PDF + pages │         │ qa + scenario      │         │ overrides            │
│  + metadata  │         │ (per-doc runners)  │         └──────────────────────┘
└──────┬───────┘         └─────────┬──────────┘
       │                            │
       ▼                            ▼
┌──────────────┐         ┌────────────────────┐
│ FAISS index  │         │ AzureChatOpenAI +  │
│ built per    │         │ Azure DI client    │
│ query in mem │         │ (Default cred chain)│
└──────────────┘         └────────────────────┘
```

## Frontend (Stage 2)

The UI is a React + Vite SPA under `frontend/`. Vite builds to
`frontend/dist/`; the Flask `spa` blueprint catch-all serves
`index.html` from there for any non-API path. Asset URLs are emitted
relative (`./assets/...`) via `base: "./"` in `vite.config.ts` so the
build survives Domino's `/proxy/<port>/` prefix without modification.

| Concern | File |
| --- | --- |
| Design tokens | `frontend/src/styles/tokens.css` (CSS vars) + `frontend/tailwind.config.js` (Tailwind extends). |
| API client | `frontend/src/lib/api.ts` — every path RELATIVE. |
| Type contracts | `frontend/src/lib/types.ts` — mirrors `app/services/schemas.py` and route bodies. |
| Layout shell | `AppShell` composes `Masthead` + `LeftRail` + `Workspace` + `RightRail`. |
| Workspace flow | `UploadArea` → `ExtractionConfig` → `ModeSelector` → mode workspace (`SinglePromptWorkspace`, `MultiStepWorkspace`, or `ScenarioWorkspace`). |

In dev, Vite serves the SPA on port 5173 with a proxy that forwards
`/api/*` to Flask on port 5000. Two terminals: `make dev` (Flask) and
`make frontend-dev` (Vite). In production a single Flask process serves
both API and built SPA.

See `docs/FRONTEND_DESIGN.md` for the full token reference, component
inventory, and accessibility baseline.

## Modules

| Module | Responsibility |
| --- | --- |
| `app.config` | Env loading, `Settings` dataclass, default values. |
| `app.utils.logging` | JSON logger + per-run folder writer. |
| `app.utils.markdown` | Safe markdown rendering for QA answer panels. |
| `app.utils.normalize` | Verbatim port of agentmemo `_normalize_text`. |
| `app.services.azure_auth` | `DefaultAzureCredential` + bearer-token provider singletons. |
| `app.services.llm` | `AzureChatOpenAI` factory + LangGraph singleton. |
| `app.services.doc_intelligence` | Azure DI client + `extract_pdf_bytes_to_markdown`. |
| `app.services.parsers` | Dispatch + capability probes (docintel / pypdf / OCR). |
| `app.services.doc_store` | Content-addressed PDF + extraction + page-image storage. |
| `app.services.section_presets` | Templated section header lookup (quarterly / annual reviews). |
| `app.services.prompt_manager` | Bundled + dev-override prompt loader. |
| `app.services.extraction` | Section detection + per-section LLM call + persistence + embedding refresh. |
| `app.services.embeddings` | Per-document chunk store + transient FAISS index. |
| `app.services.qa` | Single, multi-document, and conversational Q&A flows. |
| `app.services.scenario` | Per-document scenario screening. |
| `app.services.jobs` | Background job registry + `ThreadPoolExecutor`. |
| `app.services.schemas` | Pydantic v2 response schemas (universal extraction fields). |
| `app.services.validation` | `validate_or_retry` JSON-decode + Pydantic validation + single retry. |
| `app.db.adapter` + `null_adapter` | Future-DB hook; v1 is a no-op. |
| `app.routes.spa` | Catch-all serving the React build. |
| `app.routes.health` | `/api/health` — service / doc_store / parsers / azure block. |
| `app.routes.documents` | Upload, list, fetch, page images, delete. |
| `app.routes.extraction` | Run batch extraction, fetch cached, list section presets. |
| `app.routes.prompts` | Single Q&A / multi-step / scenario. |
| `app.routes.dev` | GET / PUT runtime prompt overrides. |
| `app.routes.jobs` | Background job status + cancel. |

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Readiness + capabilities. |
| POST | `/api/documents/upload` | Multipart upload OR `{folder_path}` JSON. |
| GET | `/api/documents` | All stored documents, newest first. |
| GET | `/api/documents/<hash>` | Single document metadata + available extractions. |
| GET | `/api/documents/<hash>/pages/<n>` | Rendered page PNG. |
| DELETE | `/api/documents/<hash>` | Remove the document and every artefact. |
| GET | `/api/extraction/presets` | Section-header presets for the UI dropdown. |
| POST | `/api/extraction/run` | Queue a batch extraction job. |
| GET | `/api/extraction/<hash>/<parser_mode>` | Cached extraction. |
| POST | `/api/prompts/single` | Queue a (questions × documents) Q&A job. |
| POST | `/api/prompts/multi-step` | Synchronous conversational turn. |
| POST | `/api/prompts/scenario` | Queue a scenario-screening job. |
| GET | `/api/dev/prompts` | Active prompts + override flags. |
| PUT | `/api/dev/prompts` | Set or clear an override for one mode. |
| GET | `/api/jobs/<id>/status` | Poll job state. |
| POST | `/api/jobs/<id>/cancel` | Best-effort cancel. |
| GET | `/...` | SPA — React build (Stage 2); placeholder until then. |

## /api/health contract (v0.2.0)

```json
{
  "service": "lisa-sentinel",
  "version": "0.2.0",
  "status": "ok",
  "doc_store": {
    "path": "/path/to/doc_store",
    "exists": true,
    "writable": true,
    "document_count": 12
  },
  "page_rendering": "available",
  "parsers": {
    "docintel-official": "available",
    "pypdf": "available",
    "ocr-fallback": "unavailable: tesseract binary not found",
    "available_presets": ["generic", "quarterly_review", "annual_review"]
  },
  "active_parser": "docintel-official",
  "env_present": ["AZURE_OPENAI_DEPLOYMENT", "OPENAI_API_VERSION", "AZURE_DOCINTEL_ENDPOINT"],
  "env_missing": [],
  "azure": {
    "credential_chain": "DefaultAzureCredential",
    "doc_intel_endpoint": "https://127.0.0.1:8443",
    "openai_endpoint": "<from env or unset>"
  }
}
```

The previous tier-resolver fields (`storage.label`, `storage.tier`,
`storage.degraded`, etc.) are gone. The single doc-store path replaces them.

## Doc store

Every uploaded PDF lands at `doc_store/<sha256>/source.pdf`. Page images
render to `doc_store/<sha256>/pages/page_NNN.png` at 150 DPI on first
upload (best-effort — silently skipped if Poppler is unavailable).
Extractions cache by parser mode under `extractions/<parser_mode>/`
(`extraction.json` + `chunks.json` + `embeddings.npz` + `extracted_at.txt`).
Re-uploading the same bytes hits the cache without re-rendering.

The doc-store root is configurable via `DOC_STORE_DIR`; default is
`<repo_root>/doc_store/`.

## Async job contract

Long endpoints return `{job_id}` immediately. The SPA polls
`GET /api/jobs/<job_id>/status` (1 s cadence) until `state` is
`succeeded | failed | cancelled`. Cancellation flips a flag the worker
checks between iterations. Job records evict after one hour.

## Determinism notes

- `make_llm` defaults to `temperature=0.0`.
- The LangGraph singleton is built once and cached at module level. Any
  prompt-manager override invalidates it via `llm.invalidate_graph()`.
- The Azure bearer-token provider is constructed once and reused — no
  per-call token requests.

## Mode implementations (Stage 3)

After extraction succeeds, the workspace exposes three operating modes
selected via `ModeSelector`:

### Single Prompt — `SinglePromptWorkspace`

Async run via `POST /api/prompts/single` → `pollJob`. The user types one
or more questions (or attaches a `.xlsx` / `.csv` / `.txt` of questions).
Results render as `SinglePromptResults` — question groups with nested
per-document rows. Click an answer cell to open `SourceImageModal`, which
fetches `GET /api/documents/<hash>/pages/<n>` and overlays the verbatim
quote. "Download Excel" exports via `lib/excel.ts::exportSinglePromptToExcel`
(SheetJS, lazy-imported into its own bundle chunk).

### Multi-Step — `MultiStepWorkspace`

Synchronous turn-by-turn conversation via `POST /api/prompts/multi-step`.
The full conversation history is sent each turn (the backend doesn't
persist conversation state). User turns render as bubbles; assistant
turns render the answer (markdown), evidence (collapsible), and a
"View source" button per quote. Auto-scrolls to the bottom unless the
user has scrolled up to read history. The multi-step envelope omits the
single-prompt-only `document_hash`/`question` fields; the modal resolves
the document hash by looking up the evidence's `chunk_id` in
`env.retrieved_chunks`.

### Scenario — `ScenarioWorkspace`

Async run via `POST /api/prompts/scenario` → `pollJob`. Single textarea
for the scenario; the result renders as a sortable / filterable risk
table with an inline detail panel per row (evidence with direction
badges, reasoning, limitations, recommended follow-up). "Download Excel"
exports via `exportScenarioToExcel`. A `ScenarioHistory` accordion shows
prior scenarios in this session and can repopulate the prompt textarea.

## Workspace state machine

State lives in `WorkspaceContext` and uses a discriminated `WorkspaceState`
union (Stage 4 dropped the transient `extraction_configured` state — the
only path to it was failure-retry, which now returns to `documents_selected`).

```
                   newSession()
                       │
                       ▼
     ┌──────► documents_selecting ◄──────────────────┐
     │              │                                │
     │   setSelectedHashes (≥1 hash)                 │
     │              ▼                                │
     │      documents_selected                       │
     │              │     ▲                          │
     │   runExtraction()  │ failure                  │
     │              ▼     │                          │
     │         extracting                            │
     │              │ success                        │
     │              ▼                                │
     │        mode_selecting ◄──────── handleChangeMode
     │              │                                │
     │              ▼  pickMode                      │
     │   single_prompt | multi_step | scenario  ─────┘
     │
     │   ANY → documents_selecting (newSession() or setSelectedHashes([]))
     └──────────────────────────────────────────────────
```

Bookmark restore (`AppShell.handleSelectBookmark`) jumps directly to a
mode state, hydrates everything via `WorkspaceContext` setters, and the
`Workspace` component renders the corresponding mode workspace.

## Component dependency map

```
LayoutProvider
└── SessionProvider
    └── HealthProvider
        └── WorkspaceProvider
            └── DevPromptsProvider
                └── AppShell
                    ├── Masthead              (useLayout)
                    ├── LeftRail
                    │   └── RecentPrompts     (useSession)
                    ├── Workspace             (useWorkspace, useSession, useDevPrompts)
                    │   ├── UploadArea        (useSession)
                    │   │   └── BrowseExisting
                    │   ├── ExtractionConfig  (useHealth)
                    │   ├── ExtractionProgress
                    │   ├── ModeSelector
                    │   ├── SinglePromptWorkspace  (useWorkspace, useSession)
                    │   │   └── SinglePromptResults → SourceImageModal
                    │   ├── MultiStepWorkspace     (useWorkspace, useSession)
                    │   │   └── SourceImageModal
                    │   └── ScenarioWorkspace      (useWorkspace, useSession)
                    │       ├── ScenarioHistory
                    │       └── ScenarioResults → SourceImageModal
                    ├── RightRail
                    │   └── DevPromptPanel    (useDevPrompts, useSession)
                    └── ToastStack            (useSession)
```

Each context's hook lives in `use<Name>.ts` (Stage 4 split-pattern); the
sibling `<Name>Context.tsx` only exports the Provider.

## End-to-end data flow

A typical run: user uploads `riverbend.pdf`, picks Single Prompt, asks
"What is the senior leverage ratio?".

```
1. UploadArea → POST /api/documents/upload
   └─ doc_store.store_document → render pages → cache metadata
   └─ Response: { documents: [{hash, filename, ...}], cached: [] }

2. ExtractionConfig.onRun → POST /api/extraction/run
   └─ jobs.submit(extraction.extract_batch, ...)
   └─ Response: { job_id }

3. Workspace.runExtraction → pollJob(job_id) → GET /api/jobs/<id>/status (×N)
   └─ extraction.extract_batch:
       └─ doc_store.get_extraction (cache check)
       └─ parsers.parse(file_bytes, mode=...) → raw_markdown
       └─ section_presets.detect_sections
       └─ for each section: validate_or_retry(make_llm.invoke, msgs, SectionExtractionResponse)
       └─ doc_store.save_extraction (extraction.json + chunks.json + embeddings.npz)
   └─ Final state: succeeded, result: { results: [...] }

4. Workspace transitions to mode_selecting
   ModeSelector → user picks "Single Prompt" → state = "single_prompt"

5. SinglePromptWorkspace → POST /api/prompts/single
   └─ jobs.submit(qa.answer_questions, ...)
   └─ Response: { job_id }

6. pollJob → qa.answer_questions:
   └─ for each (question × doc):
       └─ embeddings.search → top-k chunks
       └─ build messages with context
       └─ validate_or_retry(make_llm.invoke, msgs, MemoQaResponse)
   └─ Response: { rows: [QaEnvelope] }

7. SinglePromptResults renders question groups
   User clicks an answer → SourceImageModal
   GET /api/documents/<hash>/pages/<page> → image/png blob
```

Every API call uses a relative path; every async run goes through `jobs.py`;
every LLM response is validated through `validate_or_retry`; every chunk
metadata carries `doc_hash` so the multi-step modal can resolve documents
without a `document_hash` field on the envelope.

## Where to look next

- For the failure-mode catalog, see `TROUBLESHOOTING.md`.
- For the data flow inside an extraction job, see `EXTRACTION_PIPELINE.md`.
- For why we wired things this way, see `CONSTRAINTS.md`.
- For step-by-step build history, see the `STAGE_1_SUMMARY.md` →
  `STAGE_3_SELFTEST.md` → `STAGE_4_SUMMARY.md` chain in the repo root.
- For change-templates that respect every constraint, see
  `prompts_for_agents/`.
