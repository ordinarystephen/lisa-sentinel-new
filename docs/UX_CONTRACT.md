# UX Preservation Contract

This is the source of truth for what the app must do when it is rebuilt or
refactored. Future contributors: every change must respect "MUST PRESERVE"
unless an explicit superseding contract is recorded here.

## MUST PRESERVE

1. **Six-tab structure.** `Overview`, `PDF / Image`, `Excel`, `Memo Q&A`,
   `Data & Setup`, `Docs`. Renames are permitted only if the semantic
   intent is preserved.
2. **Sidebar with these labelled controls:** "Data Root" (formerly
   `SENTINEL_DATA_ROOT`), `Memo Type`, `PDF workers`, `Question workers`,
   `Section prompt file`, `Memo extraction system prompt`, `Memo
   extraction user prompt template`. Renames are permitted only when they
   improve clarity.
3. **PDF/Image source bifurcation.** `Upload files` versus `Use a folder
   path (no upload)` are both available.
4. **Four-step extraction scaffold.** Visible step headings:
   1. `1) Choose documents`
   2. `2) Extract and store memo content`
   3. `3) Choose prompts`
   4. `4) Run structured extraction`
5. **Two extraction inputs.** Single ad-hoc question AND uploaded prompts
   workbook.
6. **Section-level extraction + preview pattern.** Image / raw text /
   AI-extracted content per section.
7. **Filterable result table + CSV / Excel download.**
8. **Memo Q&A dual modes** (`Retrieved evidence` versus `Full extracted
   memo`) and **dual scopes** (`Single Document` versus `All Documents`).
9. **Scenario screening** with `risk_level`, `rationale`, `confidence`,
   `evidence` output.
10. **Persistent evidence store.** Entries / chunks / profiles persisted
    server-side, reusable across sessions.
11. **Loading feedback for long operations.** Progress bars / spinners
    with human-readable status text. Use modern async polling, not
    Streamlit's blocking model.
12. **Empty-state guidance** that points to the next action (upload /
    scan / build evidence / refresh embeddings).
13. **Detail view (Phase 2C).** Every results-table row exposes a "View
    detail" affordance that opens a full-width detail panel with: summary
    card, confidence panel, evidence cards (verbatim quote + page
    reference + relevance + direction), reasoning section, limitations
    list, and source metadata. The detail view is the auditability surface
    when a row's value is challenged in committee. Hash route:
    `#detail`. Validation failures get a dedicated layout that surfaces
    the schema name, validation errors, and the raw model response.
14. **Structured evidence rendering.** Inline evidence under QA and
    scenario tables MUST render quote / page_reference / chunk_id /
    relevance as distinct fields — never as flat text. Markdown answers
    are rendered server-side via `render_markdown` and injected into the
    page as HTML; client code MUST NOT use `.textContent` on a Markdown
    answer.
15. **Section extraction visibility.** The PDF / Image tab renders a
    per-memo section results panel showing facts / risks /
    open-questions counts and a "View detail" link for every
    fact and risk.

## EXPLICITLY ALLOWED TO IMPROVE

- Replace raw exception text with normalised user-friendly errors. Keep
  technical detail in an expandable "Details" section.
- Co-locate results with run controls. Review Results docks near the run
  button, not at the page bottom.
- Modernise visual styling per `DESIGN_SYSTEM.md`.
- Add ETA hints and cancellation for long operations.
- Add an explicit auth-failure UI state with remediation guidance.
- Consolidate duplicate prompt setup UI (DRY pattern across PDF and
  Excel tabs).
- Replace opaque jargon with bank-business-friendly labels. Keep
  technical terms in tooltips / help text.
- Make persistence boundaries visible at point of use ("Stored
  persistently" / "This session only" badges).

## KNOWN ISSUES TO FIX (NOT PRESERVE)

- Two-app split confusion → single consolidated app.
- Detached results area → results dock near actions.
- Raw exception dumps → normalised error UI with technical details
  collapsed.
- No auth-failure state → explicit re-auth UI.
- No cancellation → cancellation supported via the job system.
- Duplicated prompt UI across tabs → shared component.
- Auto-embedding-refresh commented out → ENABLED in this rebuild.
- Structured-extraction-results-not-persisting commented out →
  PERSISTING in this rebuild.

## How to propose a contract change

1. Open a PR that updates this doc.
2. List the affected MUST PRESERVE bullet(s) and the rationale.
3. Get sign-off from a product stakeholder before merging UI changes that
   contradict the existing contract.
