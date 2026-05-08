# Prompt: LLM / Prompt / Schema Change

You are about to modify how Lisa-Sentinel calls the LLM, validates its
response, or shapes the prompts that drive extraction / Q&A / scenario
screening. Source of truth for constraints:
[`prompts_for_agents/README.md`](README.md). The "Constraints that always
apply" section there is non-negotiable. Pay particular attention to
constraints #7-#11 (Azure + LLM).

## Files this kind of change typically touches

- `app/prompts/*.txt` — bundled prompt templates (system + user)
- `app/services/prompt_manager.py` — loads bundled prompts, holds
  dev-panel overrides, invalidates the LangGraph cache
- `app/services/schemas.py` — every Pydantic model the LLM is asked to
  return; all use `_Strict` (extra="forbid")
- `app/services/validation.py` — `validate_or_retry` wrapper that does
  one re-prompt on schema failure, then surfaces a `_validation_error`
  envelope
- `app/services/qa.py` — single-prompt + multi-step Q&A
- `app/services/scenario.py` — scenario screening
- `app/services/extraction.py` — section extraction + Excel structured
  extraction
- `app/services/llm.py` — LangChain client construction (Azure OpenAI,
  bearer token via `azure_auth.get_token_provider`)
- `app/services/azure_auth.py` — DO NOT modify (constraint #8 — same
  rule as `doc_intelligence.py`)
- `frontend/src/lib/types.ts` — TypeScript mirror of every Pydantic
  shape the frontend consumes; drift breaks the UI silently
- `tests/test_smoke_schemas.py` — schema round-trip + validation tests

## Hard rules (in priority order)

1. **Azure AD only.** No `api_key=` parameters. No `OpenAI()` constructor.
   Use `make_llm()` from `app/services/llm.py`. The bearer token provider
   is constructed once and reused (constraint #7).
2. **Don't modify `app/services/doc_intelligence.py`** (constraint #8).
3. **Pydantic v2 with `extra="forbid"`.** Every response model extends
   `_Strict`. Drift causes silent acceptance of malformed responses.
4. **One retry on schema failure, then `_validation_error`.** Never
   silently fall through to default values. The user needs to see that
   the LLM produced an unparseable answer, not a fake "no results".
5. **Evidence is required when the model says it answered the
   question.** Cross-field validators in `MemoQaResponse` and
   `ScenarioScreeningResponse` enforce this; preserve those validators
   on any field-shape change.
6. **Prompts go through `prompt_manager.get_prompts(<mode>)`.** Don't
   read `.txt` files directly — that bypasses the dev-panel override.
   `<mode>` is one of `section_extraction`, `memo_qa`,
   `scenario_screening`. Adding a fourth mode means extending
   `ALLOWED_MODES`, the bundled prompts dict, and the dev-panel UI.
7. **Frontend type matches backend shape.** Any field added/removed in
   `schemas.py` must be reflected in `lib/types.ts` in the same change.
8. **Document the prompt change.** If you're changing prompt text, the
   commit message records *what* you changed and *why*. The dev panel
   lets users override at runtime; the bundled text is the floor.

## Read these first

1. [`docs/EXTRACTION_PIPELINE.md`](../docs/EXTRACTION_PIPELINE.md) — how
   chunking, retrieval, and prompting fit together.
2. `app/services/schemas.py` — start here even if you're only changing a
   prompt; the schema names which fields the LLM is expected to produce.
3. The relevant `app/prompts/<mode>.txt` file. Note that `_envelope_skeleton`
   in `qa.py`/`scenario.py` defines the wrapping that's added around the
   schema output (e.g., `document_hash`, `question`, `_transport_error`).
4. [`STAGE_1_SUMMARY.md`](../STAGE_1_SUMMARY.md) — the backend reshape;
   includes the API surface table.
5. [`STAGE_3_SELFTEST.md`](../STAGE_3_SELFTEST.md) — type-contract
   verification table maps every backend producer to the frontend type
   that consumes it.

## What good LLM/prompt changes look like

- **Schema first.** Edit `schemas.py` to add/remove the field, including
  validators. Run `pytest tests/test_smoke_schemas.py` — the round-trip
  + extra-keys-forbidden tests should fail in informative ways if you've
  drifted.
- **Service second.** Update the envelope skeleton + the `data` dict
  that gets `model_dump()`-ed into it.
- **Prompt third.** Edit `app/prompts/<mode>.txt`. Bias toward
  *describing the schema* in the system prompt; the model adheres better
  when the schema is part of the system message than when it's reverse-
  engineered from a user message.
- **Frontend type fourth.** Mirror the change in `lib/types.ts`. Run
  `npx tsc -b` — if anything in the UI was using the field, the type
  error tells you what to fix.
- **Tests fifth.** `tests/test_smoke_schemas.py` for the new shape;
  vitest on the UI if a renderer changed.

## Schema discipline

- All response models extend `_Strict`. No model uses `Optional` without
  a documented reason — `None` and "field absent" are different signals.
- Every `Field(..., min_length=1)` is intentional. The LLM treats empty
  strings as defaults; min_length=1 forces it to actually answer.
- Cross-field validators (`@model_validator(mode="after")`) run after
  every field has parsed. Use them for "evidence required when answered"
  patterns, not field-level validators.
- Date-stamped fields use ISO 8601 strings, set server-side after
  validation.
- Numeric fields the LLM can't reliably produce (e.g., page numbers
  computed from chunk metadata) are NOT in the schema; they're added
  server-side from `chunk.metadata`.

## Adding a new mode

If you're adding a fourth mode (e.g., "comparative analysis"):

1. New schema in `schemas.py` (`<Mode>Response`).
2. New prompt in `app/prompts/<mode>.txt`.
3. New service module `app/services/<mode>.py` with a `screen_*` /
   `answer_*` function that calls `make_llm()` + `validate_or_retry`.
4. New blueprint or new route on `app/routes/prompts.py`.
5. New `<Mode>Workspace.tsx` in `frontend/src/components/`.
6. Extend `WorkflowMode` in `lib/types.ts`, the `MODE_OPTIONS` in
   `ModeSelector.tsx`, the workspace state machine, and
   `prompt_manager.ALLOWED_MODES`.
7. Tests on both sides.

This is enough work that it's better to use [`ADD_FEATURE.md`](ADD_FEATURE.md)
instead of this template.

## Testing requirement

```bash
make test       # Backend smoke including schema round-trips
make lint       # Ruff
```

Add to `tests/test_smoke_schemas.py`:
- A round-trip case: `<Model>(...).model_dump()` parses back via
  `<Model>.model_validate(...)`.
- A required-field case: missing a required field raises
  `ValidationError` with a useful message.
- Any cross-field validator gets its own test.

If the prompt change affects an end-to-end route, add a smoke test on the
route (don't hit live Azure — mock `make_llm` to return a known string,
then verify the route maps it correctly).

## Definition of done

- [ ] Pydantic schema in `app/services/schemas.py` reflects the new
      shape; extra="forbid" still set
- [ ] Service layer (`qa.py` / `scenario.py` / `extraction.py`) updates
      the envelope to match
- [ ] Prompt text in `app/prompts/<mode>.txt` updated; describes the
      schema in the system message
- [ ] Frontend type in `lib/types.ts` mirrors the schema
- [ ] Frontend renderer updated to consume the new field (or to
      gracefully ignore the removed one)
- [ ] Schema test added; it passes
- [ ] `make test` green; `make lint` clean
- [ ] No `api_key=` in any new code
- [ ] No CDN-loaded model SDK; `make_llm()` is the entry point
- [ ] Doc updated if the public API surface changed
      (`docs/EXTRACTION_PIPELINE.md`, `docs/ARCHITECTURE.md`)

## Halt-and-flag protocol

If your task requires bypassing structured-output discipline, talking to
a non-Azure LLM, or skipping the validation retry, write to `BLOCKER.md`
and stop. These are constraint violations that need explicit owner
sign-off, not a clever workaround.

---

## Your task

(Append your specific LLM/prompt/schema change request below this line.)
