# Prompt: New Feature (Backend + Frontend)

You are about to add a feature that crosses the backend and frontend.
Source of truth for constraints:
[`prompts_for_agents/README.md`](README.md). Every constraint applies.

## Workflow

In this order, no shortcuts:

1. **Design first.** Before any code, sketch the API contract: route
   shape, request/response Pydantic schema, frontend type, UI sketch.
   If you can't describe it in three sentences, the feature isn't ready
   to implement.
2. **Backend second.** Schema → service → route. Wire the validation
   path. Add backend smoke tests.
3. **Frontend third.** Type in `lib/types.ts` → component → context
   updates → wiring. Add vitest cases.
4. **Documentation last.** Once the code is settled and tests pass,
   update `docs/ARCHITECTURE.md` (API surface table + state machine if
   touched), `docs/FRONTEND_DESIGN.md` (component inventory),
   `docs/EXTRACTION_PIPELINE.md` if extraction touched.

## Files this kind of change typically touches

Backend:
- `app/routes/<blueprint>.py` — new routes go here. Use existing
  blueprints (`prompts.py`, `extraction.py`, `documents.py`, `dev.py`,
  `jobs.py`, `health.py`) when the feature fits; create a new one only
  if it's genuinely a new resource family.
- `app/services/<feature>.py` — business logic.
- `app/services/schemas.py` — Pydantic models for request + response.
- `app/services/jobs.py` — for any work that takes >2 seconds.
- `app/__init__.py` — register new blueprints if you created one.

Frontend:
- `frontend/src/lib/types.ts` — TypeScript mirrors.
- `frontend/src/components/<Component>.tsx` — UI.
- `frontend/src/contexts/<Context>.tsx` (+ sibling `use<Context>.ts`) —
  if the feature needs cross-cutting state.
- `frontend/src/lib/api.ts` — never modify the wrappers; only consume
  them.

Tests:
- `tests/test_smoke_<feature>.py` — backend.
- `frontend/src/__tests__/<feature>.test.tsx` — frontend.

## Hard rules (in priority order)

The full constraint list lives in [`README.md`](README.md). The ones most
likely to bite you on a cross-cutting feature:

1. **Relative API paths only** in the frontend (constraint #1).
2. **Azure AD only** if the feature calls Azure (constraint #7).
3. **Pydantic v2 with extra="forbid"** for any LLM-driven response
   (constraint #9).
4. **Async work goes through `jobs.py`** (constraint #11).
5. **Frontend type matches backend Pydantic shape** (constraint #14).
6. **Workspace state lives in `WorkspaceContext`** (constraint #12).
7. **Tests in the same change, not a follow-up** (constraint #15).

## Read these first

1. [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) — system overview
   and the API surface table.
2. [`STAGE_1_SUMMARY.md`](../STAGE_1_SUMMARY.md) — backend reshape; the
   blueprint pattern is documented here.
3. [`STAGE_3_SUMMARY.md`](../STAGE_3_SUMMARY.md) — the worked example
   for "feature that crosses backend + frontend". The three modes show
   the end-to-end pattern: schema → service → route → type → context
   → component → tests → docs.
4. [`STAGE_3_SELFTEST.md`](../STAGE_3_SELFTEST.md) — wiring audit table
   shows the contract pattern for every endpoint.

## What good features look like

- The contract is defined ONCE — Pydantic schema on the backend, mirrored
  in `lib/types.ts`. No ad-hoc shapes.
- Async work goes through the existing `jobs.submit(...)` pattern. The
  frontend uses `pollJob()` from `lib/api.ts`; no new polling helper.
- New endpoints follow the existing URL conventions:
  - `GET /api/<resource>` — list
  - `POST /api/<resource>/<verb>` — async-job kickoff (returns `{job_id}`)
  - `POST /api/<resource>` — sync create
  - `GET /api/<resource>/<id>` — fetch
  - `PUT /api/<resource>` — sync update
  - `DELETE /api/<resource>/<id>` — sync delete
- The frontend uses the existing context layer. If state is genuinely
  cross-cutting, add a context (with the Stage 4 split-pattern: hook in
  `use<Name>.ts`, Provider in `<Name>Context.tsx`).
- Tests on both sides. Don't ship with "I'll add tests later".

## What bad features look like

- A new auth pattern (API keys, OAuth tokens hardcoded, etc.). The
  bearer-token chain is the only auth path.
- A new state library (Redux, Zustand, Jotai). Context is sufficient.
- A new fetch wrapper (axios, ky, custom). `lib/api.ts` is the entry
  point.
- A new async pattern (WebSockets, Server-Sent Events) without first
  going through whether `pollJob` would suffice. Polling is fine for
  the operator-facing tools we ship; SSE/WS adds complexity that
  doesn't pay off until much higher load.
- "I'll just bypass the validation retry for this one case." No.
- A schema field added to `lib/types.ts` but not in `schemas.py`. Or
  vice versa. Always both, in the same change.

## Process: design phase

Before writing code, write down (in the PR description, in a scratchpad,
or in `BLOCKER.md` if you're not sure):

```
## <Feature> design

**Goal:** <one sentence>

**Backend contract:**
- Endpoint: <method> /api/<path>
- Request: <Pydantic schema or `{"field": type}`>
- Response: <Pydantic schema or `{"field": type}`>
- Async or sync? <if async: which job kind>

**Frontend impact:**
- New component(s): <list>
- Modified component(s): <list>
- Context state: <does this need WorkspaceContext changes>
- New type(s) in `lib/types.ts`: <list>

**Tests:**
- Backend: <what scenarios>
- Frontend: <what scenarios>

**Constraint check:**
- API paths relative? Y
- Azure AD only? Y / N/A
- Structured outputs Pydantic? Y / N/A
- Async via jobs.py? Y / N/A
- State machine impact? Y / N
```

If any line in the constraint check is "N" without a "/A", stop and
read the corresponding constraint.

## Process: implementation phase

Backend:
1. Add the schema in `schemas.py`. Run `pytest tests/test_smoke_schemas.py`.
2. Implement the service in `app/services/<feature>.py`. Make it
   testable: take dependencies as arguments, not as imports.
3. Add the route in `app/routes/<blueprint>.py`.
4. If async, wrap it in `jobs.submit(...)`.
5. `make test` and `make lint` green.

Frontend:
1. Mirror the schema in `lib/types.ts`.
2. Build the component(s). Use existing primitives.
3. Wire context state if needed. Use the `use<Name>.ts` split pattern.
4. Add vitest cases via the `installFetchMock` helper.
5. `npm run test`, `npm run lint`, `npm run build` all green.

## Definition of done

- [ ] Pydantic schema in `app/services/schemas.py`; `extra="forbid"`
- [ ] Service in `app/services/<feature>.py`; testable
- [ ] Route in `app/routes/<blueprint>.py`; uses `jobs.submit` if async
- [ ] Backend test in `tests/test_smoke_<feature>.py`; passes
- [ ] Frontend type in `lib/types.ts` mirrors the schema
- [ ] Frontend component(s) under `frontend/src/components/`
- [ ] Frontend test in `frontend/src/__tests__/<feature>.test.tsx`
- [ ] No constraint violations (relative paths, Azure AD only, no API
      keys, no new auth pattern, no new dep without justification)
- [ ] `make test`, `make lint`, `make frontend-test`, `make frontend-lint`,
      `make build` all green
- [ ] `docs/ARCHITECTURE.md` updated (API surface table; state machine if
      touched)
- [ ] `docs/FRONTEND_DESIGN.md` updated if a public component was added
- [ ] PR description summarizes the contract + the user-facing change

## Halt-and-flag protocol

If your feature can't be built without:
- Bypassing structured outputs
- Adding a non-Azure auth pattern
- Hardcoding a path or domain
- Modifying `doc_intelligence.py` or `azure_auth.py`
- Adding a new component library

…stop. Write the conflict to `BLOCKER.md` and propose the
constraint-respecting alternative. The constraint always wins unless an
owner explicitly relaxes it.

---

## Your task

(Append your specific feature description below this line. A few sentences
is plenty — the prompt drives the structure.)
