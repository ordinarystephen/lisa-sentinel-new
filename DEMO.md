# DEMO

End-to-end walk-through of running Lisa-Sentinel locally and in Domino.
Read top to bottom; every step has a copy-paste-ready command and an
expected outcome.

## 1. What this is

Lisa-Sentinel turns credit-memo PDFs into structured, citation-bearing
extractions, answers analyst questions across documents, and screens
documents against stress-test scenarios.

The runtime is a Flask API server (`app/`) plus a React + Vite SPA
(`frontend/`). In production a single `python run.py` process serves
both — the SPA is built into `frontend/dist/` and served by the `spa`
blueprint catch-all. In Domino, the whole thing sits behind the
`/proxy/<port>/` HTTP proxy.

There are no API keys. Authentication is `DefaultAzureCredential` only.

## 2. Prerequisites

- Python 3.11
- Node 18+ and npm
- `git` and a terminal
- For Domino: workspace access on the bank's tenant
- For local Azure verification (optional): the Azure CLI signed in via
  `az login`

## 3. Local setup (no Azure required)

This path runs the full app locally. The UI works; runs that need Azure
return graceful structured errors.

```bash
cd /path/to/lisa-sentinel
python3.11 -m venv .venv311
source .venv311/bin/activate
make install            # pip install + npm install
```

Run the smoke tests to confirm the install:

```bash
make test               # 48 backend smoke tests
make frontend-test      # 42 vitest cases
```

Both should be green in well under a minute. If `make test` fails on
import errors, the venv isn't 3.11 — the codebase uses PEP 604 union
syntax that older Pythons can't parse.

Build the frontend:

```bash
make build
```

Expected: `frontend/dist/` is created with `index.html` referencing
`./assets/index-*.js` and `./assets/index-*.css` (relative paths so the
build survives Domino's proxy prefix). The `xlsx` SheetJS package is
code-split into its own lazy chunk (~140 KB gzipped).

Boot:

```bash
make run                # python run.py
```

Expected: a structured JSON log line, then Werkzeug's banner showing it
listens on `http://0.0.0.0:5000` (or whatever `PORT` is set to). The
process stays in the foreground; Ctrl+C stops it.

Open `http://localhost:5000` in a browser.

Expected first-paint: the masthead shows "Lisa-Sentinel" + a "ready" or
"backend unreachable" badge, the workspace canvas shows a "1. Choose
documents" heading with Upload-new / Browse-existing tabs, and the left
rail shows "No prompts yet — run something to populate this list".

Hit the health endpoint directly to see what the app reports about
itself:

```bash
curl -s http://localhost:5000/api/health
```

Expected (without Azure wired):

```json
{
  "service": "lisa-sentinel",
  "version": "0.2.0",
  "status": "ok",
  "doc_store": { "exists": true, "writable": true, "document_count": 0 },
  "page_rendering": "available",
  "parsers": {
    "docintel-official": "unavailable: ...",
    "pypdf": "available",
    "ocr-fallback": "unavailable: ...",
    "available_presets": ["generic", "quarterly_review", "annual_review"]
  },
  "env_present": [],
  "env_missing": ["AZURE_OPENAI_DEPLOYMENT", "OPENAI_API_VERSION", "AZURE_DOCINTEL_ENDPOINT"]
}
```

The app is healthy; it just can't run real extractions until you wire
Azure.

## 4. Dev mode (two terminals, hot reload)

For frontend development, run Flask and Vite in parallel. Vite's dev
server proxies `/api/*` to Flask:

```bash
# Terminal A: Flask on port 5000
make dev    # FLASK_DEBUG=1 FLASK_RUN_PORT=5000 python run.py

# Terminal B: Vite on port 5173
make frontend-dev
```

Open `http://localhost:5173`. Edits to `frontend/src/` hot-reload
without a Flask restart. Backend edits restart Flask via debug mode.

## 5. What works without Azure

- The full UI renders. All four steps of the workspace flow are
  navigable.
- Step 1 (Upload) accepts PDFs but real upload requires the doc-store
  to be writable, which it is by default. Page rendering needs
  `poppler-utils` and `pdf2image`; without them, page-image previews
  fail gracefully and a banner appears.
- Step 2 (Configure extraction) populates the parser dropdown from
  `/api/health.parsers` — only `pypdf` will be `available` without DI.
- Step 3 (Run extraction) submits a job. The job fails when the LLM
  call fires; the `_transport_error` envelope surfaces in the toast.
- Step 4 mode workspaces all render. Submits return job-id, jobs fail
  on first LLM call, errors surface as toasts and as `_transport_error`
  envelopes in the result rows.
- The dev panel (right rail) loads the bundled prompts on mount. Edit /
  Save / Reset all work — saving an override is local to the running
  process and does not need Azure.

## 6. Configuring Azure (when ready to use real extraction)

Three required env vars wire the app to the bank's Azure tenancy. Auth
is `DefaultAzureCredential` only — no API keys.

Stop the running app (`Ctrl+C`). Copy the example env file:

```bash
cp .env.example .env
```

Fill in:

| Variable | Required | Description |
| --- | --- | --- |
| `AZURE_OPENAI_DEPLOYMENT` | yes | Deployment name (e.g. `gpt-4o-bank-tenant`) |
| `OPENAI_API_VERSION` | yes | API version (e.g. `2024-08-01-preview`) |
| `AZURE_DOCINTEL_ENDPOINT` | yes | In Domino: `https://127.0.0.1:8443` (the local nginx proxy). Locally: leave blank if you only want LLM calls, or point at a port-forward |
| `AZURE_OPENAI_ENDPOINT` | no | Tenant endpoint URL. Defaults to the team's |
| `AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT` | no | Embeddings deployment. Required for retrieved-evidence Q&A; without it the Q&A flow falls back to full-doc context |
| `DOCINTEL_API_VERSION` | no | Defaults to `2024-11-30` |
| `MEMO_PDF_PARSER` | no | `docintel-official` (default), `pypdf`, `docintel-risklab`, `ocr-fallback` |
| `DOC_STORE_DIR` | no | Doc-store root. Defaults to `<repo>/doc_store/` |

Sign in to Azure CLI for local creds:

```bash
az login
az account set --subscription "<subscription-id>"
```

Verify with the environment probe (read-only, no live Azure calls):

```bash
make check-env
```

Boot and re-check health:

```bash
make build && make run
curl -s http://localhost:5000/api/health
```

Expected: `env_missing` is `[]`, the configured parser shows as
`available`.

## 7. End-to-end smoke flow (with Azure)

Browser at `http://localhost:5000`. Five steps, each verifies a layer.

### Step 1 — Upload a document

Drag a PDF onto the drop zone, or click the zone and pick a file. The
upload should complete in seconds for a typical memo.

**No sample is bundled.** For first-deploy smoke testing, any business-y
multi-page PDF works. The easiest free source is **SEC EDGAR**:

- Browse <https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=10-K>,
  click any "10-K" filing → "Open document" → save the PDF version locally
  and upload it.
- 10-K filings have the right shape (sections, financial detail,
  multi-page) for the four-step flow. A 20–60-page filing is a sweet spot.

Expected after upload: a row appears in the upload list with status
"done"; the "1 document selected for processing" summary appears below;
section 2 ("Configure extraction") becomes visible.

Verify on disk: `ls doc_store/` shows a hash directory containing
`source.pdf`, `metadata.json`, and (if poppler is available) a `pages/`
folder with PNGs.

### Step 2 — Run extraction

Pick a parser (default is fine), pick a section preset, leave
concurrency at 4. Click "Run extraction".

Expected: an inline progress card appears below the Run button. Status
updates ("[1/1] abc12345...") arrive every second. After ~10-30 seconds
the toast "Extraction complete · 1 document, N sections" fires and the
"3. Choose a mode" panel appears.

If extraction fails: the toast surfaces the error message; the progress
card shows "Extraction failed" with the error text; you can retry from
the same Run button.

### Step 3 — Try Single Prompt mode

In "3. Choose a mode", "Single Prompt" is pre-selected. Click Continue.

Expected: a prompt textarea labelled "Ask a question or paste multiple
questions, one per line. Or attach a file with questions." appears.

Type one question (e.g. "What are the key covenants?") and press
Ctrl+Enter (or Cmd+Enter on macOS) or click the Send button.

Expected: another progress card while the job runs (~5-15 seconds).
Then a Results section with a question group ("Q1: What are the key
covenants?") containing one nested table row per document. Click on
the answer cell to open the source-image modal — it shows the page
PNG with the verbatim quote underlaid.

### Step 4 — Try Multi-Step mode

Click "Change" next to the mode pill at the top. Confirm the dialog
("Change mode? Your current Single Prompt workspace will be cleared.")
to drop back to mode selection. Pick Multi-Step, click Continue.

Expected: a sticky-bottom prompt box plus an empty conversation area.
Type "What's the capital structure?" and Ctrl+Enter.

Expected: a "You" bubble appears, then a "Lisa-Sentinel is thinking…"
placeholder, then the assistant turn replaces the placeholder with an
answer + collapsible evidence section. Type a follow-up; the second
turn includes the prior conversation in the request.

### Step 5 — Try the Dev Prompt Panel

Click the "Show dev panel" button on the masthead (right side). The
right rail opens; the Memo Q&A tab textareas show the bundled prompt.

Edit the system prompt (e.g. add a sentence). The "Unsaved changes"
warning appears. Click Save Override. Toast: "Override saved · LangGraph
cache invalidated · Next run uses new prompts".

Now go back to Single Prompt mode and run a question. The
"Using modified memo_qa prompt (dev panel override active)" indicator
appears at the top of the workspace, and the run uses your modified
prompt.

Click "Reset to Bundled" in the dev panel to revert.

## 8. Running in Domino

The Domino path is the same code with a different launcher.

### Repo location

Under the project's working directory, typically
`/mnt/<project-name>/lisa-sentinel`. The app reads from this path and
writes per-run logs to `<repo>/logging/` unless `LISA_LOG_DIR` points
elsewhere.

### Required env vars in the Domino workspace

Set these in the Domino workspace environment, not in `.env` — Domino-
injected env vars take precedence because dotenv loads with
`override=False`.

| Variable | Notes |
| --- | --- |
| `AZURE_OPENAI_DEPLOYMENT` | Bank's Azure OpenAI deployment name |
| `OPENAI_API_VERSION` | API version |
| `AZURE_DOCINTEL_ENDPOINT` | **Always** `https://127.0.0.1:8443` in Domino. The local nginx proxy is the only allowed DI path per `docs/CONSTRAINTS.md` |
| `AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT` | Required for retrieved-evidence Q&A |
| `DOC_STORE_DIR` | Path to a persistent volume mounted into the workspace. Without this, doc-store falls through to `<repo>/doc_store/` |

### System dependencies (admin-side)

- `poppler-utils` — for `pdf2image` page rendering
- `tesseract-ocr` — for the `ocr-fallback` parser (only needed if you
  expect to use OCR)

Both should be in the Domino compute environment image. If they're
absent, the related parsers register as `unavailable` and the UI shows
them greyed out — the app still boots and most flows still work.

### Build before launch

Domino's launch command runs `python run.py`. `frontend/dist/` must
exist before this runs, or the `spa` blueprint will serve a placeholder.
Either:

1. Add `make build` as a build step in the Domino workspace
   configuration, OR
2. Commit `frontend/dist/` to the repo (not recommended — it's a build
   artifact), OR
3. Run `make build` once interactively in the workspace before starting
   the public server.

Recommended: option 1.

### Domino smoke checklist

Once the workspace is up and `python run.py` is running:

1. Open `https://<domino-domain>/proxy/<port>/`. Expected: the React UI
   renders identically to local. No 404s on `./assets/index-*.js` or
   the CSS bundle.
2. `curl -s https://<domino-domain>/proxy/<port>/api/health`. Expected:
   `env_missing: []`, `parsers.docintel-official: "available"`,
   `azure.credential_chain: "DefaultAzureCredential"`.
3. Upload a memo via the UI. Verify the doc-store path on disk shows
   the new hash directory.
4. Run extraction. Verify the progress card updates in real time
   (poll cadence is 1 s) and that the success toast fires.
5. Run a Single Prompt question. Click an answer cell — verify the
   source-image modal loads the page PNG.

If any step fails, check `/api/health` first. Almost every Domino issue
is a missing env var or an unwritable doc-store path.

## 9. Common issues

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Frontend 404s on `./assets/index-*.js` after deploy | Stale `frontend/dist/` from a previous build | `rm -rf frontend/dist && make build` |
| `import-analysis` errors in `make build` | TypeScript or ESLint errors that the dev server tolerates | `cd frontend && npx tsc -b` to see; fix the errors |
| `health.azure.credential_chain` says `unavailable` | Not signed in via `az login` locally, or no managed identity in Domino | Sign in / verify the Domino workspace identity |
| Extraction succeeds but Q&A returns "transport error" | Embeddings deployment missing | Set `AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT` or accept full-doc context Q&A |
| Page-image modal shows "Could not load page image" | Poppler / `pdf2image` missing during upload | Ensure `poppler-utils` is on PATH and re-upload (or skip — text-only Q&A still works) |
| Dev panel changes don't take effect | The LangGraph cache was invalidated server-side, but the JS bundle is stale (cached) | Hard-refresh the browser |
| Workspace navigation feels stuck | Recent-prompts entry has stale state from a prior session | Click "New Session" — confirm the dialog |
| Tests fail with `Unable to find role "button"` | Looking for buttons inside the LeftRail (closed-by-default in jsdom) | Use `{ hidden: true }` on `getByRole` |

## 10. Where to look next

- `docs/ARCHITECTURE.md` — system overview, state machine, data flow.
- `docs/EXTRACTION_PIPELINE.md` — how a PDF becomes structured text
  becomes embeddings becomes a prompt context.
- `docs/FRONTEND_DESIGN.md` — visual language and component inventory.
- `docs/CONSTRAINTS.md` — the rules. If a constraint surprises you,
  read this and the linked rationale before making changes.
- `docs/DEPLOYMENT.md` — Domino-specific deployment notes.
- `prompts_for_agents/` — drop-in prompt templates for AI coding
  assistants. If you're an AI assistant, start with
  `ONBOARD_NEW_DEVELOPER.md`.
