# Coding-Agent Prompts

This directory holds prompt templates that are designed to be copied into an
AI coding assistant (Claude Code, Cursor, GitHub Copilot Chat, etc.) along
with a specific change request. Each prompt encodes the constraints that
make Lisa-Sentinel work in Domino, so the assistant doesn't drift into
patterns that look reasonable in isolation but break the deployment target.

## Purpose

The codebase has a small number of hard rules — relative API paths, Azure-AD
auth (no API keys), Pydantic-validated structured outputs, the doc-store
file layout, the section-extraction prompt structure, the four-step
workspace flow. These rules aren't always obvious from a single file; they
emerge across the system. These prompt templates restate them at the start
of every change so the AI assistant has them in working memory before it
writes a single line.

## How to use

1. Pick the template that matches the kind of change you're making.
2. Copy the entire file into your assistant.
3. Append your specific change request at the bottom (a few sentences is
   plenty — the template tells the assistant how to investigate, plan, and
   verify).
4. Let the assistant work. It should produce a self-contained PR-ready
   change. If it produces output that violates a constraint, push back; the
   constraint section is non-negotiable.

## The prompts

| File | When to use |
| --- | --- |
| [`UPDATE_UI.md`](UPDATE_UI.md) | Any frontend change — new components, screens, modes, design tweaks |
| [`UPDATE_LLM.md`](UPDATE_LLM.md) | Prompt edits, schema changes, new modes that need an LLM call |
| [`UPDATE_PARSING.md`](UPDATE_PARSING.md) | Adding parsers, presets, section-detection rules |
| [`ADD_FEATURE.md`](ADD_FEATURE.md) | A net-new feature that crosses backend + frontend |
| [`ONBOARD_NEW_DEVELOPER.md`](ONBOARD_NEW_DEVELOPER.md) | First-day-on-the-repo orientation (humans or agents) |

## The constraints that always apply

These appear in every UPDATE prompt; this is the source of truth. If a
prompt below this section disagrees with this section, this wins.

### Domino + frontend

1. **All API calls use relative paths.** `apiGet("dev/prompts")`, never
   `apiGet("/api/dev/prompts")`. The Vite base config is `./` so the SPA
   survives Domino's `/proxy/<port>/` HTTP proxy.
2. **No `localhost`/`127.0.0.1` in runtime code.** Test fixtures only.
3. **No CDN-loaded assets.** No external JavaScript, no external CSS,
   system fonts only.
4. **No new component libraries.** Use the in-repo primitives: `Button`,
   `Input`, `Textarea`, `Select`, `RadioGroup`, `Checkbox`, `Tooltip`,
   `Badge`, `Modal`, `Tabs`, `Spinner`, `IconButton`, `ToastStack`,
   `ConfirmDialog`. If a component is missing, write it in
   `frontend/src/components/` following the existing pattern.
5. **Design tokens come from `frontend/src/styles/tokens.css`.** No
   hardcoded colors / sizes / radii in components.
6. **Build output asset paths use `./`.** Verify after `make build` that
   `frontend/dist/index.html` shows `src="./assets/..."` and `href="./..."`.

### Azure + LLM

7. **Azure AD only.** No `api_key=` parameters anywhere in `app/`. The
   credential chain is `DefaultAzureCredential`; the bearer token provider
   is constructed once in `app/services/azure_auth.py` and reused across
   every Azure call.
8. **Don't modify `app/services/doc_intelligence.py`.** It is a verbatim
   port of the agentmemo pattern; deviating from it costs us hours of
   debugging when Document Intelligence misbehaves.
9. **Structured outputs via Pydantic v2.** Every LLM response shape is a
   model in `app/services/schemas.py` with `model_config = {"extra":
   "forbid"}`. Every LLM caller wraps `validate_or_retry`. One retry on
   schema failure, then surface a `_validation_error` envelope.
10. **Prompts live in `app/prompts/*.txt`** and are loaded via
    `app/services/prompt_manager.py`. Dev-panel overrides invalidate the
    LangGraph cache via the same module.
11. **Async work goes through `app/services/jobs.py`.** Long-running
    extraction and prompt jobs return `{job_id}`; the frontend polls
    `GET /api/jobs/<id>/status`. Don't add a new async pattern.

### State + UX

12. **Workspace state lives in `WorkspaceContext`.** The state machine is
    the seven-state union in `lib/types.ts`. Don't add ad-hoc state.
13. **Recent prompts (`SessionContext.prompts`) are in-memory only.** They
    persist for the page-session and reset on refresh. Don't reach for
    localStorage or a backend table — that's a v3 concern.
14. **Every endpoint the frontend hits has a TypeScript type in
    `lib/types.ts`** that matches the backend Pydantic shape. If the
    frontend uses a field, the backend must produce it. Run the type-check
    after any contract change.

### Process

15. **Tests come before the doc updates.** Vitest + React Testing
    Library on the frontend, pytest on the backend.
16. **Lint clean.** `make frontend-lint` (eslint, 0 warnings) and
    `make lint` (ruff) both have to pass.
17. **Build clean.** `make build` produces `frontend/dist/` without TS
    errors. `make test` and `make frontend-test` are both green.

## What to do if a constraint conflicts with the request

**Halt and flag.** Don't quietly violate a rule because the request is
ambiguous. Write to `BLOCKER.md` at repo root:

```
# Blocker

The request to <X> conflicts with constraint <N> (<short summary of the rule>).

Two options:
1. <approach that respects the constraint>
2. <approach that asks the user to relax the constraint>

Default: do (1) and call this out in the PR description.
```

Then proceed with option 1 unless told otherwise. Constraint violations
caught in code review are cheap; constraint violations that ship to Domino
are expensive.
