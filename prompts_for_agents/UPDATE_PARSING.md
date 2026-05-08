# Prompt: Parser / Extraction Change

You are about to modify how Lisa-Sentinel converts a PDF into structured
text — adding a new parser, a new section preset, or tweaking the section-
detection heuristics. Source of truth for constraints:
[`prompts_for_agents/README.md`](README.md). Pay particular attention to
constraint #8 (don't modify `doc_intelligence.py`).

## Files this kind of change typically touches

- `app/services/parsers.py` — parser dispatch table + capability probes;
  every parser registers an availability probe consumed by `/api/health.parsers`
- `app/services/section_presets.py` — `SECTION_PRESETS` dict; each preset
  is `{name, headers, description}` consumed by `/api/extraction/presets`
- `app/services/doc_intelligence.py` — Azure Document Intelligence
  client. **DO NOT MODIFY** (constraint #8). Use it as-is.
- `app/services/extraction.py` — orchestrates parse → section detection
  → per-section LLM extraction → cache write
- `app/services/doc_store.py` — file layout under `DOC_STORE_DIR/<hash>/`;
  parsed text goes to `extraction.json`, page images to `pages/page_N.png`
- `app/services/embeddings.py` — chunks the parsed text and stores
  embeddings; chunk metadata carries `doc_hash`, `index`, `parser_mode`

## Hard rules (in priority order)

1. **`doc_intelligence.py` is sacred.** It's a verbatim port of the
   agentmemo pattern; deviations cost hours of debugging when DI starts
   returning unexpected shapes. If you must change DI behavior, write
   the change as a wrapper *around* `doc_intelligence.py`, not inside it.
2. **Every parser registers via the dispatch table** in `parsers.py`.
   No bespoke "if parser_mode == 'foo'" branches in routes or services.
3. **Every parser has an availability probe.** The probe must NOT do
   real work — it should check that the SDK is importable, the binary
   is on PATH, the credential is present. The result populates
   `/api/health.parsers`. Graceful degradation when system deps absent
   is a constraint (constraint #4 in the parser-specific list, below).
4. **Section presets are data, not code.** Adding a preset is a dict
   entry in `SECTION_PRESETS`. The `headers` list drives heuristics;
   the `description` is shown in the UI dropdown.
5. **Don't introduce a new caching layer.** `doc_store` already caches
   per-hash, per-parser. The `force_reextract` flag bypasses the cache;
   no new flag needed for "forced re-render".
6. **Per-document failures are reported, not raised.** Extraction is
   per-document and per-section; a failure on document N should produce
   a row with `status: "failed"` and an `error` string, not abort the
   whole job.

## Parser-specific constraints

| Constraint | Why |
| --- | --- |
| Parsers run in process, not as subprocess | We're already inside Domino's container; spawning subprocesses fights the resource budget |
| Parsers receive `bytes`, return `dict[str, Any]` | The dispatch contract; see `parse(file_bytes, ...) -> {"raw_markdown": str, "metadata": dict, ...}` |
| Capability probes return `Capability(available, reason)` | Reason is shown in the UI dropdown when the parser is greyed out |
| Graceful degradation when system deps absent | If `tesseract` isn't on PATH, the OCR fallback parser registers with `available=False` and `reason="tesseract not installed"`; it does not raise on import |
| No external HTTP calls beyond Azure | The credential chain is the only egress |

## Read these first

1. `app/services/parsers.py` — start here. The existing four parsers
   (`docintel-official`, `docintel-risklab`, `pypdf`, `ocr-fallback`)
   are the worked examples.
2. [`docs/EXTRACTION_PIPELINE.md`](../docs/EXTRACTION_PIPELINE.md) — the
   end-to-end flow.
3. [`STAGE_1_SUMMARY.md`](../STAGE_1_SUMMARY.md) — the backend reshape
   that introduced the dispatch table; the rationale section explains
   why we don't accept "if parser_mode == 'foo'" branches.
4. The agentmemo Document Intelligence integration reference (if still in
   the repo): a snapshot of how the upstream pattern is structured, so
   you can verify your wrapper preserves it.

## Adding a new parser mode

1. Implement `parse(file_bytes: bytes, ...) -> dict[str, Any]` somewhere
   in `app/services/` (a new module is fine for non-trivial parsers).
2. Register a capability probe — usually a function that tries an
   import + a no-op call.
3. Add to `parsers.py`:
   - `_PARSERS["<id>"] = parse_function`
   - `_PROBES["<id>"] = probe_function`
4. Update `PARSER_LABELS` in `frontend/src/contexts/HealthContext.tsx`
   so the dropdown shows a human label.
5. Smoke test in `tests/test_smoke_imports.py` — assert the import
   doesn't raise even when system deps are absent.
6. Document in `docs/EXTRACTION_PIPELINE.md`.

## Adding a new section preset

1. Edit `SECTION_PRESETS` in `section_presets.py`:
   ```python
   "my_preset": SectionPreset(
       name="my_preset",
       headers=["Header 1", "Header 2", ...],
       description="When to use this preset.",
   ),
   ```
2. Test: `tests/test_smoke_imports.py` covers preset loading; add a
   case if your headers exercise unusual patterns (numbered prefixes,
   colon-terminated, all-caps, etc.).
3. The frontend dropdown picks it up automatically via
   `/api/extraction/presets`.

## Modifying section detection heuristics

`extraction.py` uses the preset's `headers` list as candidate matches,
plus a heuristic for inferring sections from formatting (bold, all-caps,
numbered prefixes). Changes to the heuristic affect every preset.

- Run extraction against a representative memo BEFORE and AFTER the
  change. Diff the section list. If the diff is unintended, refine the
  heuristic.
- Test fixtures live in `tests/fixtures/` (if present) or under
  `mockups/`. Add one if your change targets a specific edge case.

## Testing requirement

```bash
make test     # All backend smoke tests
make lint     # Ruff
```

Add tests where they catch regressions:
- Capability probe returns Capability(available=True/False) under
  expected conditions.
- Parser returns the documented dict shape.
- Section preset round-trips through `describe_presets()`.

## Definition of done

- [ ] Parser/preset registered via the dispatch table or SECTION_PRESETS
- [ ] Capability probe added; degrades gracefully without system deps
- [ ] `/api/health.parsers` shows the new parser and its status
- [ ] `/api/extraction/presets` shows the new preset
- [ ] `pyproject.toml` / `requirements.txt` lists any new dependencies,
      and the dependency is genuinely available in Domino
- [ ] `doc_intelligence.py` is unchanged (verify with diff)
- [ ] Smoke test added; `make test` green; `make lint` clean
- [ ] Documentation updated (`docs/EXTRACTION_PIPELINE.md` for parser
      additions, `docs/ARCHITECTURE.md` if the dispatch surface changed)

## Halt-and-flag protocol

If you find yourself wanting to modify `doc_intelligence.py` to "fix" a
parsing issue, **stop**. Write the fix as a post-processing step on the
output dict, not an in-place edit. If that genuinely won't work, write
to `BLOCKER.md` with a side-by-side of the upstream pattern and the
proposed change, and wait for sign-off.

---

## Your task

(Append your specific parser / preset / section-detection request below
this line.)
