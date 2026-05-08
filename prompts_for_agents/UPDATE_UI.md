# Prompt: UI Change

You are about to modify the Lisa-Sentinel frontend. Source of truth for
constraints: [`prompts_for_agents/README.md`](README.md). The "Constraints
that always apply" section there is non-negotiable.

## Files this kind of change typically touches

- `frontend/src/components/` — every UI component lives here
- `frontend/src/contexts/` — `Health`, `Layout`, `Session`, `Workspace`,
  `DevPrompts` providers; their hooks live in sibling `use<Name>.ts` files
- `frontend/src/lib/types.ts` — every backend response shape used by the
  UI is mirrored here; don't drift
- `frontend/src/lib/api.ts` — `apiGet`/`apiPost`/`apiPut`/`pollJob`; use
  these, don't write a parallel fetch wrapper
- `frontend/src/lib/format.ts` — `truncate`, `classNames`,
  `formatRelativeTime`, `formatBytes`
- `frontend/src/styles/tokens.css` — design tokens (colors, type scale,
  spacing); referenced by Tailwind classes via `tailwind.config.js`

## Hard rules (in priority order)

1. **Relative API paths only.** `apiGet("path")`, never absolute. See
   constraint #1 in the shared README.
2. **Use the in-repo component primitives.** Don't introduce a new
   component library or CDN-loaded UI kit (constraint #4).
3. **Design tokens, not hardcoded values.** Tailwind utility classes that
   reference the token names in `tokens.css`. See `Button.tsx`,
   `Badge.tsx`, etc. for the pattern.
4. **Accessibility baseline:** every interactive element has a label
   (`aria-label` or visible text), focus-visible styles work, modals
   trap focus and dismiss on Escape, color is never the only signal.
5. **Workspace state lives in `WorkspaceContext`.** Mode-specific local
   state belongs in `mode.<...>` so a recent-prompts click can hydrate
   it. See `SinglePromptWorkspace`/`MultiStepWorkspace`/`ScenarioWorkspace`
   for examples.
6. **Tests are part of the change, not a follow-up.** Vitest + React
   Testing Library. Use the harness in `frontend/src/__tests__/test-helpers.ts`
   (it has `installFetchMock` with configurable job scripts and fixture
   data; don't roll your own fetch mock).

## Read these first

1. The component closest to what you're building. Examples:
   - New form-style component → `ExtractionConfig.tsx`
   - New mode-specific workspace → `SinglePromptWorkspace.tsx`
   - New modal → `Modal.tsx` + `ConfirmDialog.tsx` + `SourceImageModal.tsx`
   - New input control → `Input.tsx`/`Textarea.tsx`/`Select.tsx`
2. [`docs/FRONTEND_DESIGN.md`](../docs/FRONTEND_DESIGN.md) — visual language
   and the existing component inventory.
3. [`STAGE_2_SUMMARY.md`](../STAGE_2_SUMMARY.md) — how the layout shell
   was built. [`STAGE_3_SUMMARY.md`](../STAGE_3_SUMMARY.md) — how the
   three modes were built. The Stage-3 summary's state-machine diagram
   is essential reading if you're touching mode transitions.
4. [`STAGE_3_SELFTEST.md`](../STAGE_3_SELFTEST.md) — the wiring audit
   shows the contract for every endpoint the UI hits. Use it.

## What good UI changes look like

- A new component is named `<Pascal>.tsx` in `frontend/src/components/`,
  with a docstring at the top explaining its purpose and where it's used.
- It uses the existing Button, Input, Modal, etc. — even if it tweaks
  the visual treatment via Tailwind classes.
- Its props are typed and documented in a `<Pascal>Props` interface above
  the component.
- It reads cross-cutting state via `useWorkspace()` / `useSession()` /
  `useLayout()` / `useDevPrompts()` / `useHealth()` — not via prop
  drilling from `App.tsx`.
- It has a vitest file (`__tests__/<feature>.test.tsx`) that exercises
  the user-visible behavior, not the internals. Use the fetch harness;
  don't mock `fetch` ad hoc.
- It does NOT introduce a router, a state library, a UI kit, or a CDN.

## What bad UI changes look like

- A new fetch helper outside `lib/api.ts`.
- Hardcoded colors / radii / spacings instead of token-based Tailwind
  utilities.
- Direct `<a href="/api/...">` instead of relative path + `apiGet`.
- A new context provider when an existing one already covers the state.
- Adding tests as a "Stage 2" follow-up — Stage 4 of the original build
  proved this never happens cleanly.
- Reaching into another component's internal state (every component
  exposes its public shape via props or context).

## Where to put new components

| Kind | Location |
| --- | --- |
| Reusable UI primitive (button, input, modal) | `frontend/src/components/` |
| Mode-specific workspace | `frontend/src/components/<Mode>Workspace.tsx` |
| Layout chrome (rails, masthead, toast stack) | `frontend/src/components/` |
| New cross-cutting state | New context in `frontend/src/contexts/`, with a sibling `use<Name>.ts` file (Stage 4 split-pattern; see the existing five) |
| New helpers | `frontend/src/lib/<feature>.ts` |
| Test fixtures | `frontend/src/__tests__/fixtures/<name>.json` (must match `lib/types.ts` exactly) |

## Testing requirement

Every meaningful change adds at least one vitest case. Use the pattern in
`__tests__/single-prompt.test.tsx` or `__tests__/scenario.test.tsx`:

```ts
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/App";
import { installFetchMock } from "./test-helpers";

describe("<feature>", () => {
  let mock: ReturnType<typeof installFetchMock>;
  afterEach(() => mock?.restore());
  it("does the thing", async () => {
    mock = installFetchMock({ /* configure job scripts here */ });
    render(<App />);
    // user.click, user.type, screen.findByRole, etc.
  });
});
```

For radio inputs (sr-only): click the wrapping `<label>` element by
finding its text content via `screen.getByText(...).closest("label")`.

For the LeftRail (closed-by-default in jsdom): use `{ hidden: true }` on
`getByRole` queries that target buttons inside the rail.

Run tests after changes:

```bash
make frontend-test   # Target: all green
make frontend-lint   # Target: 0 errors / 0 warnings
make build           # Target: dist/ produced with relative asset paths
```

## Definition of done

- [ ] Type-check passes (`tsc -b` clean)
- [ ] Lint clean (eslint, 0 warnings)
- [ ] Vitest green
- [ ] `make build` produces `dist/` with `src="./..."` paths
- [ ] No new dependencies in `frontend/package.json` unless explicitly
      required and approved
- [ ] Constraint check: no absolute API paths, no localhost, no API keys
- [ ] Component has a docstring; props have an interface; tests cover the
      user-visible behavior
- [ ] Documentation updated if the change adds a public component or
      changes a documented behavior (`docs/FRONTEND_DESIGN.md`,
      `frontend/README.md`)

## Halt-and-flag protocol

If your assigned change conflicts with a constraint above, write to
`BLOCKER.md` (see the shared README) before doing anything else. Then
implement the constraint-respecting option.

---

## Your task

(Append your specific UI change request below this line.)
