# Deployment (Domino)

## Pre-requisites (set up by Domino admin once)

- Compute environment (a Python 3.11+ image) with these system packages
  pre-installed:
  - `poppler-utils` — required for both **page-image rendering** in the
    doc store (`pdf2image.convert_from_bytes` at 150 DPI) and the OCR
    fallback parser. Without it, page PNGs are silently skipped on upload
    and the UI falls back to "page reference number only, no image".
  - `tesseract-ocr` — required for the `ocr-fallback` parser. Without it
    the parser is reported as `unavailable` in `/api/health`; other
    parsers continue to work.
  - The app DEGRADES GRACEFULLY if either is missing. The
    `page_rendering` field in `/api/health` surfaces poppler availability;
    `parsers["ocr-fallback"]` surfaces the OCR readiness.
- The Azure OpenAI workspace and Azure Document Intelligence resource that
  the Domino tenant is allowed to call. No public internet egress is used.
- Azure DI is reached via Domino's local nginx proxy at
  `https://127.0.0.1:8443`. Do NOT call `*.cognitiveservices.azure.com`
  directly.
- The runtime identity used by Domino (managed identity / federated
  credential / CLI fallback) has `Cognitive Services User` against the
  OpenAI deployment and `Document Intelligence User` against the DI
  resource.

## Environment variables

Set these in the Domino app/project environment. Domino-injected vars take
precedence over `.env` (we load with `override=False`).

### Required

| Variable | Purpose |
| --- | --- |
| `AZURE_OPENAI_DEPLOYMENT` | Name of the deployed Azure OpenAI model. |
| `OPENAI_API_VERSION` | Azure OpenAI API version, e.g. `2024-08-01-preview`. |
| `AZURE_DOCINTEL_ENDPOINT` | Domino's nginx proxy URL — `https://127.0.0.1:8443`. |

### Optional

| Variable | Default | Purpose |
| --- | --- | --- |
| `AZURE_OPENAI_ENDPOINT` | `""` | Tenant endpoint. Surfaced as `<unset>` in /api/health when blank. |
| `AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT` | `""` | Embeddings deployment name. |
| `DOCINTEL_API_VERSION` | `2024-11-30` | DI API version. |
| `MEMO_PDF_PARSER` | `docintel-official` | One of `docintel-official`, `pypdf`, `docintel-risklab`, `ocr-fallback`. |
| `DOC_STORE_DIR` | `<repo_root>/doc_store/` | Path of the content-addressed doc store. |
| `MEMO_PDF_WORKERS` | `4` | Background extraction worker count. |
| `MEMO_QUESTION_WORKERS` | `4` | (Reserved) parallelism for portfolio Q&A. |
| `MEMO_CHUNK_SIZE` | `1500` | Embedding chunk size (chars). |
| `MEMO_CHUNK_OVERLAP` | `200` | Embedding chunk overlap (chars). |
| `LISA_LOG_LEVEL` | `INFO` | Root log level. |
| `LISA_LOG_DIR` | `logging` | Per-run folder root. |

## Doc store

The Stage 1 reshape replaced the multi-tier storage probe with a single
content-addressed doc store at `<repo>/doc_store/<sha256>/`. Configure
the root via `DOC_STORE_DIR`. The doc-store probe is reported in
`/api/health.doc_store` (`exists`, `writable`, `document_count`) — if it
isn't writable, the UI surfaces an error on the first upload.

## Boot

The deploy sequence builds the frontend before booting Flask:

```bash
make install     # pip install + cd frontend && npm install
make build       # cd frontend && npm run build → frontend/dist/
python run.py    # or `make run`
```

`run.py` reads `PORT` (Domino-injected) or `FLASK_RUN_PORT`, defaulting to
`8080`. The `spa` blueprint serves `frontend/dist/index.html` for the SPA
shell; if `frontend/dist/` is missing, a Stage-1 placeholder HTML
appears instead — boots succeed but the UI is the placeholder.

### Frontend build details

- `vite.config.ts` sets `base: "./"` so asset URLs in the rendered
  `index.html` are relative. This is what lets the build survive
  Domino's `/proxy/<port>/` prefix without modification.
- The build is fully self-contained — no CDN dependencies, system fonts
  only.
- For local two-terminal development: `make dev` (Flask on 5000) +
  `make frontend-dev` (Vite on 5173 with proxy to 5000).

### Doc store path

Document storage lives at `<repo_root>/doc_store/` by default. Override
with `DOC_STORE_DIR=/persistent/path` when the Domino workspace mounts a
volume the team wants extractions to land on.

## Smoke check after deploy

1. Open `https://<domain>/proxy/<port>/` in a browser. The React UI
   renders. No 404s on `./assets/index-*.js` or the CSS bundle.
2. Hit `/api/health` directly. Expect 200 and a JSON body matching
   `docs/ARCHITECTURE.md`. `env_missing` should be empty.
   `parsers.docintel-official` should be `available`.
   `azure.credential_chain` should be `DefaultAzureCredential`.
3. In the UI, click "Browse existing" — the document list loads (empty
   on first deploy). Upload a small PDF via the "Upload new" tab.
   Verify the doc-store path on disk shows the new hash directory.
4. Click Run extraction. The progress card updates every second; the
   success toast fires within a minute for a typical memo.
5. Pick Single Prompt mode, ask a question, click Send. Wait for the
   results table. Click an answer cell — verify the source-image modal
   loads the page PNG.
6. Open the right rail (Show dev panel). The bundled prompts populate.
   No PUT call yet — just confirm the load works.

If any step fails, check `/api/health` first.

## Rolling back

This is a stateless app — there is no migration. Re-deploying a previous
image is sufficient. Persistent document data lives in `DOC_STORE_DIR`,
not the container, so rolling back the image preserves the evidence base.

## Restart semantics

- Python module reload is NOT automatic in Domino. After any code change,
  restart the Flask process (Domino's app restart button).
- Settings are cached by `functools.lru_cache`; a process restart clears it.
- The LangGraph singleton is also cached; a restart rebuilds it.
