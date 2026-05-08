# Lisa-Sentinel Frontend

React + Vite + TypeScript SPA. Built into `frontend/dist/` and served by
the Flask process in production via the `spa` blueprint.

After Stage 4 the frontend is feature-complete: the four-step workspace
flow (upload → extract → mode → result), three operating modes (Single
Prompt, Multi-Step, Scenario), the dev-prompts override panel, recent-
prompts bookmarks with restore, and the source-image evidence modal.

## Install

From the repo root:

```bash
make install
```

Or just the frontend:

```bash
make frontend-install
# == cd frontend && npm install
```

## Develop (two terminals)

The Flask backend serves the API on port 5000; Vite serves the SPA on
port 5173 with a proxy to `localhost:5000` for `/api/*`.

```bash
# Terminal 1 — Flask
make dev

# Terminal 2 — Vite
make frontend-dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build for production

```bash
make build
# == cd frontend && npm run build
```

Output lands at `frontend/dist/`. Boot Flask:

```bash
make run
```

`http://localhost:8080` (or whatever `PORT` is set to) serves the React
build directly. The SPA route's placeholder is shown only when
`frontend/dist/` is missing.

## Layout

```
frontend/
├── index.html                 Vite entry HTML
├── package.json
├── tsconfig.app.json
├── vite.config.ts             base: "./" — survives Domino proxy
├── vitest.config.ts
├── tailwind.config.js
└── src/
    ├── App.tsx                LayoutProvider → SessionProvider → HealthProvider
    │                          → WorkspaceProvider → DevPromptsProvider → AppShell
    ├── main.tsx               ReactDOM.createRoot mount
    ├── styles/
    │   ├── tokens.css         CSS variables — Apple-clean palette
    │   └── index.css          Tailwind directives + base styles
    ├── lib/
    │   ├── api.ts             apiGet/apiPost/apiPut/apiPostMultipart + pollJob
    │   ├── format.ts          formatBytes/formatRelativeTime/truncate/classNames
    │   ├── types.ts           API response shapes (mirrors app/services/schemas.py)
    │   └── excel.ts           Lazy-imported SheetJS exports for results tables
    ├── contexts/              Stage 4 split-pattern: hook in use<Name>.ts,
    │   │                      Provider in <Name>Context.tsx
    │   ├── HealthContext.tsx  + useHealth.ts       — GET /api/health + presets
    │   ├── LayoutContext.tsx  + useLayout.ts       — Rail open/closed (localStorage)
    │   ├── SessionContext.tsx + useSession.ts      — Bookmarks, scenario history, toasts
    │   ├── WorkspaceContext.tsx + useWorkspace.ts  — State machine + mode state
    │   └── DevPromptsContext.tsx + useDevPrompts.ts — GET / PUT /api/dev/prompts
    ├── components/            All UI; flat structure
    │   ├── AppShell           Masthead + LeftRail + Workspace + RightRail + Toasts
    │   ├── Masthead           Top bar, rail toggles, status pill
    │   ├── LeftRail / RightRail
    │   ├── Workspace          Owns the four-step flow + state-machine wiring
    │   ├── UploadArea         "Upload new" + "Browse existing" tabs
    │   ├── DropZone / FileList / BrowseExisting
    │   ├── ExtractionConfig   Step 2 — dropdowns + force-reextract + Run
    │   ├── ExtractionProgress Inline progress card with cancel
    │   ├── ModeSelector       Three-card radio + Continue → mode workspace
    │   ├── PromptBox          Reusable prompt input (Ctrl+Enter, file attach)
    │   ├── SinglePromptWorkspace + SinglePromptResults
    │   ├── MultiStepWorkspace
    │   ├── ScenarioWorkspace + ScenarioHistory + ScenarioResults
    │   ├── SourceImageModal   Page-image fetch + verbatim quote overlay
    │   ├── DevPromptPanel     System/user prompt editor with override badges
    │   ├── ConfirmDialog      Used for: discard edits, new session, change mode
    │   ├── RecentPrompts      Left-rail bookmark list + New Session
    │   ├── ToastStack         Bottom-right notifications
    │   ├── Button / IconButton / Input / Textarea / Select
    │   ├── RadioGroup / Checkbox / Tooltip / Badge / Modal / Tabs / Spinner
    └── __tests__/
        ├── setup.ts           Polyfills (matchMedia stub) + jest-dom
        ├── test-helpers.ts    installFetchMock + fixture re-exports
        ├── fixtures/          JSON fixtures matching backend Pydantic shapes
        ├── smoke.test.tsx     App renders
        ├── health.test.tsx    Health context + error state
        ├── upload.test.tsx    Drop zone + Browse existing
        ├── extraction-config.test.tsx Run button gating
        ├── run-extraction.test.tsx     Job polling + transitions + cancel
        ├── single-prompt.test.tsx      Prompt → results → modal
        ├── multi-step.test.tsx         Conversation + multi-step doc-hash resolution
        ├── scenario.test.tsx           Run → table → filters → detail panel
        ├── dev-panel.test.tsx          Edit / save / reset / dirty-warn
        └── recent-prompts.test.tsx     Bookmark add / restore / new session
```

## Workspace state machine (Stage 4)

State lives in `WorkspaceContext` and uses a `WorkspaceState` discriminated
union (`documents_selecting | documents_selected | extracting |
mode_selecting | single_prompt | multi_step | scenario`).

Transitions:

| From | Trigger | To |
| --- | --- | --- |
| `documents_selecting` | `setSelectedHashes(≥1)` | `documents_selected` |
| `documents_selected` | `runExtraction()` | `extracting` |
| `extracting` | success | `mode_selecting` |
| `extracting` | failure | `documents_selected` (retry from same config) |
| `mode_selecting` | pickMode | `single_prompt` / `multi_step` / `scenario` |
| any mode | "Change" + confirm | `mode_selecting` |
| any state | `newSession()` or `setSelectedHashes([])` | `documents_selecting` |
| any state | recent-prompts click | bookmark's mode state |

`AppShell.handleSelectBookmark` hydrates everything via context setters
in a single batched render; the state machine just sets `state` last.

## Patterns

### Context split-pattern

Each context's hook lives in `use<Name>.ts`; the sibling
`<Name>Context.tsx` only exports the Provider. This keeps every `.tsx`
file pure-component so Vite's react-refresh can hot-reload reliably.

### `DevPromptsContext` — load once, refresh on mutation

The provider fetches `GET /api/dev/prompts` once on mount.
`saveOverride()` and `clearOverride()` PUT then `await refresh()`.
Components call `useDevPrompts()` and read `data.overrides_active[mode]`
without each one re-fetching.

### Async job polling

`apiPost` to a job endpoint returns `{job_id}`. Use `pollJob<T>(id, onProgress)`
from `lib/api.ts`. The poll interval is 1 s in production, 5 ms when
`process.env.VITEST === "true"` so the test suite stays fast.

### Test fixtures

Every fixture in `__tests__/fixtures/*.json` matches the backend
Pydantic shape exactly. `test-helpers.ts` re-exports them as typed
constants. `installFetchMock(opts)` accepts:

```ts
{
  health, documents,
  extractionJob: { pollsBeforeFinish, result, failWith, progress },
  singlePromptJob, scenarioJob,
  multiStepResponse,
  devPromptsState,    // mutated when PUT is called
  pageImageBytes,
}
```

Returns a handle with `.calls` (assert request bodies / methods),
`.devPromptsState` (verify mutations), `.advanceJob(id)` (force-skip
remaining polls), `.restore()` (teardown).

## Lint / format / test

```bash
make frontend-lint    # eslint, target 0 warnings
make frontend-test    # vitest, 42 tests
cd frontend && npm run format    # prettier
```

After the Stage 4 context split, frontend lint is clean. If you add a
new context, follow the `use<Name>.ts` + `<Name>Context.tsx` pattern.

## Conventions

- Every API path is **relative** (`api/...`) — never absolute. This is
  what lets the SPA survive Domino's `/proxy/<port>/` prefix.
- `vite.config.ts` sets `base: "./"` so asset URLs in `index.html` are
  also relative. Same proxy reason.
- System fonts only. No webfonts, no CDN dependencies.
- Tailwind utilities for layout; raw CSS only for the design tokens.
- Components live in `src/components/` as `<Name>.tsx` files with a JSDoc
  header explaining purpose and where they're used.
- New cross-cutting state goes in a new context with the split pattern;
  consumers import the hook from `useFoo`, the Provider from `FooContext`.
- Test files use `installFetchMock` from `test-helpers.ts`. Don't roll
  your own fetch mock — the helper supports job-polling scripts and
  request-history assertions.

## When you need to make a change

See [`prompts_for_agents/UPDATE_UI.md`](../prompts_for_agents/UPDATE_UI.md)
for a ready-to-use prompt template that encodes every constraint above.
