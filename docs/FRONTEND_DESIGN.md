# Frontend Design System

Apple-clean, white, minimal. The palette is intentionally near-monochrome.
Color is reserved for status (success, warn, error) and rare emphasis.

The Stage 2 frontend lives under `frontend/`. This document is the
authoritative reference for tokens, components, and accessibility — Stage
3 expands on it but doesn't change the foundations.

## Design tokens

Defined as CSS custom properties in `frontend/src/styles/tokens.css` and
mirrored as Tailwind theme extensions in `frontend/tailwind.config.js`.

### Colors

| Token | Hex | Use |
| --- | --- | --- |
| `--color-bg` | `#ffffff` | Page background. |
| `--color-bg-subtle` | `#fafafa` | Sidebars, summary cards. |
| `--color-bg-muted` | `#f4f4f5` | Hover surfaces, inactive containers. |
| `--color-bg-hover` | `#f4f4f5` | Hover-state alias. |
| `--color-ink` | `#18181b` | Primary text. |
| `--color-ink-muted` | `#52525b` | Secondary text. |
| `--color-ink-subtle` | `#a1a1aa` | Tertiary text, captions. |
| `--color-accent` | `#18181b` | Primary action — same as ink for monochrome confidence. |
| `--color-accent-hover` | `#27272a` | Primary hover. |
| `--color-rule` | `#e4e4e7` | Hairline borders. |
| `--color-rule-strong` | `#d4d4d8` | Slightly stronger borders. |
| `--color-success` | `#15803d` | Muted forest. |
| `--color-warn` | `#a16207` | Muted amber. |
| `--color-error` | `#991b1b` | Muted oxblood. |
| `--color-focus-ring` | `#18181b` | Same as ink. |

### Typography

System fonts only — no Google Fonts, no CDN.

| Token | Stack |
| --- | --- |
| `--font-sans` | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif` |
| `--font-display` | `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif` |
| `--font-mono` | `ui-monospace, "SF Mono", "Cascadia Code", monospace` |

Sizes (px): 12 / 14 / 15 / 16 / 18 / 20 / 24 / 32. Body default is 15.
Line height is 1.5 for body, 1.2 for display sizes. Display sizes carry
`-0.01em` letter-spacing.

### Spacing

8px base. Tailwind utilities cover 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96.
Screen-edge padding: 24 px on small widths, 48 px on large.

### Radii

| Token | Value | Use |
| --- | --- | --- |
| `--radius-sm` (Tailwind `rounded-sm`) | 4 px | Inputs, small buttons. |
| `--radius-md` (Tailwind `rounded-md`) | 8 px | Cards, panels. |
| `--radius-lg` (Tailwind `rounded-lg`) | 12 px | Drop zone, prominent containers. |

No fully-rounded buttons. Pill shapes are reserved for small status
badges.

### Shadows

| Token | Value | Use |
| --- | --- | --- |
| `--shadow-sm` (Tailwind `shadow-sm`) | `0 1px 2px rgba(0,0,0,0.04)` | Subtle elevation for hover-only surfaces. |
| `--shadow-md` (Tailwind `shadow-md`) | `0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` | Modals, tooltips, dropdowns when open. |

The dominant pattern is hairline borders, not shadows.

## Layout regions

```
┌─────────────────────────────────────────────────────────┐
│ Masthead 48 px                                           │
├──────┬──────────────────────────────────────────┬───────┤
│ Left │ Workspace                                 │ Right │
│ rail │ (max-width 960 px, padding 48 px top)     │ rail  │
│ 280  │                                           │ 360   │
└──────┴──────────────────────────────────────────┴───────┘
```

- Masthead: app name, rail toggles, status pill, theme placeholder.
- Left rail: "New Session" + recent-prompts list. Default open on
  desktop, collapsed on mobile.
- Workspace: vertical step sequence (upload → config → mode placeholder).
- Right rail: dev prompt panel. Default closed; toggle from the
  masthead.

## Responsive breakpoints

Tailwind defaults. Desktop-first that gracefully reduces.

| Width | Behaviour |
| --- | --- |
| `< 640 px` | Right rail hidden, left rail collapses to icon. |
| `≥ 768 px` (`md`) | Left rail expands, right rail still hidden by default. |
| `≥ 1024 px` (`lg`) | Full three-column layout. |
| `≥ 1280 px` (`xl`) | Wider canvas, more breathing room. |

## Component inventory (Stage 2)

### Layout

| Component | Notes |
| --- | --- |
| `AppShell` | Composes Masthead + LeftRail + Workspace + RightRail + ToastStack. |
| `Masthead` | 48 px, hairline border bottom. |
| `LeftRail` / `RightRail` | Collapsible width transition. |
| `Workspace` | Hosts the four-step vertical flow. |

### Primitives

`Button` (4 variants × 3 sizes), `IconButton`, `Input`, `Textarea`
(auto-resize variant), `Select` (custom dropdown — no native
`<select>`), `RadioGroup` (card-style), `Checkbox`, `Tooltip`, `Badge`
(neutral / success / warn / error), `Modal` (Stage 3 will use it for the
page-image preview), `Tabs` (inline strip), `Spinner`.

### Feature components

`UploadArea`, `DropZone`, `FileList`, `BrowseExisting`,
`ExtractionConfig`, `RecentPrompts`, `DevPromptPanel`, `ToastStack`.

## Component inventory (Stage 3 additions)

### Workspace flow

| Component | Purpose | Props | Where used | A11y notes |
| --- | --- | --- | --- | --- |
| `ExtractionProgress` | Inline progress card while extraction is in flight. Shows progress bar, status message, elapsed time, cancel button. | `jobState, startedAt, onCancel` | `Workspace` (state=`extracting`) | `role="status"`, `aria-live="polite"` |
| `ModeSelector` | Three-card radio group (Single / Multi-Step / Scenario). Pre-selects "Single" so default is one click; collapses to "Mode: X · Change" pill once locked. Stage 4 added a confirm dialog when the user clicks Change with unsaved work. | `activeMode, onSelectMode, onChangeMode, documentCount` | `Workspace` (state=`mode_selecting` or any mode) | Native radio inputs (sr-only), labels are clickable |

### Prompt input

| Component | Purpose | Props | Where used | A11y notes |
| --- | --- | --- | --- | --- |
| `PromptBox` | Reusable AI-prompt-box. Auto-grows, Enter inserts newline, Ctrl/Cmd+Enter submits. Paperclip parses `.xlsx` (SheetJS, lazy), `.csv`, `.txt` of questions. Stage 4 added auto-grow on imperative `setText` (bookmark restore). | `value, onChange, onSubmit, placeholder, disabled, submitLabel, allowAttachments, shortcutHint` (forwardRef → `clear`, `setText`) | `SinglePromptWorkspace`, `MultiStepWorkspace`, `ScenarioWorkspace` | `aria-label` on icon buttons; helper text describes shortcut |

### Single Prompt

| Component | Purpose | Props | Where used | A11y notes |
| --- | --- | --- | --- | --- |
| `SinglePromptWorkspace` | Owns the Single Prompt run lifecycle. Async via `POST /api/prompts/single` → `pollJob`. Surfaces "Using modified memo_qa prompt" when dev panel has an override. | `bookmarkId, overrideActive` | `Workspace` (state=`single_prompt`) | — |
| `SinglePromptResults` | Question groups, each with a nested table of (question × document) rows. "Download Excel", "Expand all", "Collapse all". Click an answer cell to open `SourceImageModal`. | `result, questions` | `SinglePromptWorkspace` | `aria-expanded` on group toggles; "No result" rows have no click affordance |

### Multi-Step

| Component | Purpose | Props | Where used | A11y notes |
| --- | --- | --- | --- | --- |
| `MultiStepWorkspace` | Sticky-bottom prompt box plus scrollable conversation history. Synchronous turns via `POST /api/prompts/multi-step`. Auto-scroll-to-bottom unless the user is reading history. Resolves evidence's `document_hash` via `env.retrieved_chunks` (multi-step envelope omits the field). | `bookmarkId, overrideActive` | `Workspace` (state=`multi_step`) | Conversation list is `<ol>`; scroll container has `onScroll` so scroll-up disables auto-scroll |

### Scenario

| Component | Purpose | Props | Where used | A11y notes |
| --- | --- | --- | --- | --- |
| `ScenarioWorkspace` | Scenario-screening workspace. Async via `POST /api/prompts/scenario` → `pollJob`. | `bookmarkId, overrideActive` | `Workspace` (state=`scenario`) | — |
| `ScenarioHistory` | Accordion of past scenarios in this session. Each entry: summary + timestamp + "Load this scenario" button (populates the prompt box). | `onLoad` | `ScenarioWorkspace` | `aria-label` on expand/collapse buttons |
| `ScenarioResults` | Sortable / filterable risk table (High first by default). Filter chips for risk level. Inline detail panel per row showing evidence (with direction badges), reasoning, limitations, recommended follow-up. "Download Excel". | `result, scenarioText` | `ScenarioWorkspace` | Sort controls are buttons with `aria-label`-equivalent text |

### Modals

| Component | Purpose | Props | Where used | A11y notes |
| --- | --- | --- | --- | --- |
| `SourceImageModal` | Fetches `GET /api/documents/<hash>/pages/<n>` and shows the page PNG with the verbatim quote, confidence, rationale. Falls back to text-only on fetch error. | `open, onClose, documentHash, documentName, pageReference, quote, questionSummary, confidence, confidenceRationale` | `SinglePromptResults`, `MultiStepWorkspace`, `ScenarioResults` | Built on `Modal`; Escape + outside-click + close button all dismiss |
| `ConfirmDialog` | Tiny dialog wrapper over `Modal`. Used for "Discard unsaved changes?" (DevPromptPanel tab-switch), "Start a new session?" (AppShell), "Change mode?" (Workspace). | `open, title, body, confirmLabel, cancelLabel, destructive, onConfirm, onCancel` | `AppShell`, `DevPromptPanel`, `Workspace` | Built on `Modal`; default focus on Confirm; Escape cancels |

### Dev panel

| Component | Purpose | Props | Where used | A11y notes |
| --- | --- | --- | --- | --- |
| `DevPromptPanel` | Right-rail panel. Three mode tabs (Section Extraction / Memo Q&A / Scenario Screening), system + user prompt textareas, Save Override + Reset to Bundled buttons, "Modified" badge per tab when an override is active, dirty-state warning + tab-switch confirm. | (no props — reads from `useDevPrompts`) | `AppShell` (right rail) | Tabs use `role="tab"`; textareas have visible labels |

## Mode-specific UX patterns

- **Ctrl/Cmd+Enter to submit, Enter for newline.** Universal across
  `PromptBox` consumers. Helper text below the textarea reminds the user.
- **Sticky bottom prompt for multi-step.** Conversation scrolls above;
  prompt stays anchored.
- **Auto-scroll-to-bottom** but only when the user is at the bottom.
  Manual scroll-up disables auto-scroll until the user returns to the
  bottom.
- **Source image modal pattern.** All three modes open the same
  `SourceImageModal` with `(documentHash, pageReference, quote, ...)`.
  Multi-step resolves `documentHash` via `env.retrieved_chunks` instead
  of `env.document_hash` (which the multi-step envelope doesn't carry).
- **Mode pill + Change link.** Once a mode is active, `ModeSelector`
  collapses to a small pill. "Change" prompts a confirm dialog if the
  current workspace has unsaved work.
- **Recent-prompts bookmarks.** Every successful run upserts a
  `SessionBookmark` with the full payload. Clicking restores the
  workspace state via `WorkspaceContext` setters.

## Accessibility baseline

Bake in now — not a Stage 4 problem.

- Every interactive element is keyboard-accessible. The custom
  `Select` supports arrow keys, Enter, and Escape.
- Focus is always visible — `*:focus-visible` paints a 2 px outline in
  `--color-focus-ring`. Never hidden.
- Every form control has a `<label>` (or `aria-label` for icon-only
  controls).
- Every icon that conveys meaning carries an `aria-label`.
- The drop zone announces file additions through an `aria-live` polite
  region.
- Color is never the sole conveyor of state — every status badge pairs
  color with text.

## Visual references

The Stage 2 layout was guided by five reference designs the user
provided. The aesthetic and behavior patterns are matched; the literal
code was not copied. References are kept here so Stage 3+ can refer back
when extending.

| Component | Reference |
| --- | --- |
| Upload drop zone | `https://cdn.21st.dev/ruixen.ui/file-upload/default/bundle.1755958894925.html` |
| Extraction-method dropdown | `https://cdn.21st.dev/bundled/384.html` |
| Mode radio cards | `https://cdn.21st.dev/larsen66/radio-group-1/radio-group-nine/bundle.1761028811506.html` |
| AI prompt box (Stage 3) | `https://cdn.21st.dev/johuniq/ai-prompt-box/default/bundle.1773916120385.html` |
| Scenario history menu (Stage 3) | `https://cdn.21st.dev/bundled/505.html` |

When matching the references: keep the spacing, the proportions, and the
interaction patterns. Discard any colour or shadow choices that
contradict the Apple-clean palette above.

## What NOT to do

- No external CDNs (fonts, scripts, images).
- No webfonts. System fonts only.
- No coloured gradients.
- No fully-rounded buttons.
- No shadcn / MUI / Chakra / similar component library.
- No emoji icons. Lucide React supplies neutral line icons.
- No bright accents — primary is dark grey on white, not blue.
- No "fun" microcopy. Bank-business-friendly tone throughout.
