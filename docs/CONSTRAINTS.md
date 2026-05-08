# Constraints

Hard rules that shape this codebase. They originate from Domino's runtime
environment and from our Azure tenancy policy.

## Domino runtime

1. **Restricted egress.** Only Azure services reachable via Domino's
   pre-configured proxies. No public internet calls, no external CDNs, no
   alternative LLM providers, no telemetry sinks outside the tenant.
2. **HTTP proxy prefix.** The app is served behind
   `https://<domain>/proxy/<port>/`. Frontend API calls must use
   relative paths (`api/...`). The Vite build sets `base: "./"` so
   `index.html` references assets via `./assets/...`. Hardcoded `/api/`
   or absolute asset paths produce MIME-type errors that look like 404s.
3. **Filesystem.** Writes go to `/tmp` or env-configured directories. Do
   not assume any path is persistent.
4. **No automatic Python reload.** Restart Flask manually after code
   changes — `run.py` is a thin entry point on top of `create_app()`.
5. **Dependencies.** Installed via `requirements.txt` only. System
   dependencies (`poppler-utils`, `tesseract-ocr`) are pre-installed by
   Domino admins; the app degrades gracefully if absent.
6. **dotenv ordering.** `load_dotenv(dotenv_path=Path(__file__).parent /
   ".env", override=False)` at module import. Domino-injected env vars take
   precedence over `.env` values.

## Azure authentication

1. **Credential chain.** `azure.identity.DefaultAzureCredential` only. Do
   not pin a single auth method.
2. **Scope.** `https://cognitiveservices.azure.com/.default` for both
   OpenAI and Document Intelligence.
3. **No API keys.** There are no API keys for these services in this
   app. Do not introduce any. (Both Microsoft and the bank's Azure tenancy
   strategy disallow them for shared services.)
4. **Token reuse.** Construct a single bearer-token provider via
   `azure.identity.get_bearer_token_provider`. Reuse across every LLM call.
   Do NOT request a new token per request.

## LLM stack — pinned

```
langchain==0.3.27
langchain-openai==0.3.33
langgraph==0.6.7
langgraph-checkpoint==2.1.1
azure-identity==1.25.0
azure-ai-documentintelligence>=1.0.0
```

Do not change these versions. Do not introduce alternative LLM libraries
(OpenAI SDK direct, Anthropic, etc.).

### LLM construction

- Use `langchain_openai.AzureChatOpenAI`.
- Pass: `azure_endpoint`, `azure_deployment`, `api_version`,
  `azure_ad_token_provider`, `temperature`.
- Do NOT pass `api_key`.
- The LangGraph instance is built once and cached at the module level
  (`app.services.llm._graph`). Invalidate via `invalidate_graph()` rather
  than rebuilding ad hoc.

## Azure Document Intelligence

- Endpoint pattern: `https://127.0.0.1:8443` (Domino's local nginx proxy).
  Do NOT call `*.cognitiveservices.azure.com` directly — the proxy is the
  only allowed path.
- Same credential chain as OpenAI.
- API version default: `2024-11-30` (overridable via
  `DOCINTEL_API_VERSION`).

## Doc store

Stage 1 replaced the multi-tier storage probe with a single
content-addressed doc store at `<DOC_STORE_DIR>/<sha256>/`. The
doc-store probe is reported in `/api/health.doc_store` and a write
failure surfaces as an upload error in the UI. There is no longer a
silent failover chain; the probe is loud by being the only path.

## Frontend (Stages 2 + 3 + 4)

1. **Relative API paths.** `apiGet("path")`, never absolute. Same proxy
   reason as Domino constraint #2.
2. **No external CDNs.** No Google Fonts, no jsDelivr, no unpkg. System
   fonts only. Lucide icons are bundled.
3. **No new component libraries.** Use the in-repo primitives in
   `frontend/src/components/`. If a new primitive is genuinely needed,
   add it there following the existing pattern.
4. **Pydantic shape ↔ TypeScript type.** Every endpoint the frontend
   hits has a type in `frontend/src/lib/types.ts` that matches the
   backend Pydantic shape. Drift breaks the UI silently.
5. **Async via job polling.** `apiPost` to a job endpoint returns
   `{job_id}`; the frontend polls via `pollJob()` from
   `lib/api.ts`. No alternative async pattern (no SSE, no WebSockets).
6. **Workspace state in `WorkspaceContext`.** The seven-state
   discriminated union in `lib/types.ts` is the source of truth. Don't
   add ad-hoc `useState` for state-machine fields.
7. **Bookmark restore via context setters.** `AppShell.handleSelectBookmark`
   hydrates `WorkspaceContext` in a single batched render; mode
   workspaces re-render with the restored state. No prop drilling.
8. **Recent prompts are in-memory.** They reset on page refresh. If
   persistence is needed, that's a v3 design decision, not a v2 patch.
9. **Tests live next to the code.** Vitest + React Testing Library;
   fixtures match Pydantic shapes exactly; `installFetchMock` is the
   only fetch mock pattern.
10. **Lint clean.** 0 errors, 0 warnings. The Stage 4 split-pattern
    (hook in `use<Name>.ts`, Provider in `<Name>Context.tsx`) keeps
    react-refresh happy.

## Required environment variables

The full list with defaults lives in `DEPLOYMENT.md` and `.env.example`.
The required set:

- `AZURE_OPENAI_DEPLOYMENT`
- `OPENAI_API_VERSION`
- `AZURE_DOCINTEL_ENDPOINT`

The optional set covers parser selection, storage tiers, worker counts,
embedding parameters, and logging.

## UX preservation contract

See `UX_CONTRACT.md`. The list of features that MUST be preserved across
rewrites, the items we are explicitly allowed to improve, and the known
issues that this rebuild resolves.

## Halt-and-flag protocol

If any constraint conflicts with a build decision, do NOT silently work
around it. Surface the conflict (a `BLOCKER.md` file at the repo root is
the standard form for the build phase), then continue with what you can.
