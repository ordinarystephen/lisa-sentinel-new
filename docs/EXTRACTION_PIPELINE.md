# Extraction Pipeline

End-to-end walk-through of what happens when an analyst kicks off an
extraction.

> **Stage 1 (May 2026):** the tier resolver and `memo_store` are gone. The
> pipeline now sources documents from the content-addressed
> :mod:`app.services.doc_store`, caches per-`parser_mode` extractions
> alongside their chunk + embedding artefacts, supports section-header
> presets for templatised documents, and runs documents in parallel through
> a `ThreadPoolExecutor`. See "Stage 1 storage model" below for the on-disk
> layout.

## Stage 1 storage model

Every PDF is hash-keyed under the doc store. The cache key for an
extraction is the pair `(sha256, parser_mode)` — a re-extraction with a
new parser writes a sibling folder rather than displacing the previous
result.

```
doc_store/
└── <sha256>/
    ├── source.pdf
    ├── metadata.json
    ├── pages/                        rendered at 150 DPI on first upload
    │   ├── page_001.png
    │   └── ...
    └── extractions/
        └── <parser_mode>/
            ├── extraction.json       full structured payload
            ├── chunks.json           per-document embedding chunks
            ├── embeddings.npz        numpy matrix (key: vectors)
            └── extracted_at.txt      ISO 8601 timestamp
```

Cache logic when an extraction is requested:

1. The route receives `(document_hashes, parser_mode, force_reextract,
   concurrency, section_preset?)`.
2. Per document, a worker checks `get_extraction(doc_hash, parser_mode)`.
3. If a cached payload exists and `force_reextract` is false, the row is
   returned with `status: "cached"`.
4. Otherwise the worker reads `source.pdf`, runs the configured parser,
   splits sections (preset list if provided, heuristic otherwise), runs the
   per-section LLM call with validation, persists the result, and triggers
   `embeddings.refresh_for_document` to rebuild that document's chunk +
   embedding cache.

Up to `concurrency` documents process in parallel; the route's job-runner
emits per-document progress to the polling endpoint.

## Section-header presets

Templatised documents (the bank's quarterly and annual reviews) carry a
known set of headings. When the caller passes `section_preset:
"quarterly_review"`, the splitter uses the canonical header list as
authoritative section boundaries instead of the heuristic regex scan. New
templates are added by appending to `SECTION_PRESETS` in
`app/services/section_presets.py`; the new entry surfaces automatically at
`GET /api/extraction/presets`.

Generic mode (no preset) falls back to the heuristic detector against
`extraction.DEFAULT_SECTIONS`.

## Page rendering

On first upload the doc store renders every page to PNG at 150 DPI under
`pages/`. This is best-effort: if Poppler binaries are not installed the
service logs a single WARN and continues without page images. The UI
falls back to "page reference number only, no image" when the page asset
is missing.



> **Phase 2C (May 2026):** every LLM-driven path in this pipeline now emits a
> validated structured envelope with a universal extraction schema. See
> `app/services/schemas.py` for the Pydantic contracts and the section
> "Schema discipline" below.

## Schema discipline (Phase 2C)

Every extracted fact, risk, Q&A answer, and scenario row carries a uniform
set of fields:

| Field | Type | Purpose |
| --- | --- | --- |
| `value` | typed (str / int / float / bool / object) | The extracted content. |
| `exact_quote` | string | Verbatim text from the source. No paraphrasing allowed. |
| `page_reference` | int / string / null | Page number or range. Null only when the parser did not produce page anchors. |
| `is_explicitly_stated` | bool | True when the source directly states the value; false when inferred. |
| `ambiguity_notes` | string / null | Caveats — multiple plausible values, source unclear, etc. |
| `extraction_confidence` | `"high"` / `"medium"` / `"low"` | Based on how directly the source supports the extraction. |
| `confidence_rationale` | string | One sentence explaining the confidence rating. |

Risks add `severity`, `risk_category`, `is_inferred_vs_stated`. Scenario
evidence adds `direction` (`supports_exposure` / `refutes_exposure` /
`contextual`). The full Pydantic contracts live in
`app/services/schemas.py`.

### Validation flow

1. The service builds messages and invokes the LLM through
   `app.services.validation.validate_or_retry`.
2. The response is JSON-decoded (code fences stripped) and parsed into the
   target Pydantic model with `extra="forbid"`.
3. On failure the validator dispatches **one** retry: the original
   messages plus an assistant-echo + a user message containing the
   previous response and the validation errors. The schema requirements
   stay authoritative — only an error-correction message is appended.
4. If the retry also fails, the service receives a `ValidationFailure`
   record and persists a structured envelope:
   - `_validation_error` — schema parse failed after retry.
   - `_transport_error` — LLM construction or call failed at the network
     layer.
   - `_unexpected_error` — anything else.
5. Successful responses are persisted as the validated model's
   `model_dump()`. The service stamps `extraction_metadata.extraction_timestamp`
   server-side after validation.

### Envelope shape on disk

```
{
  "pdf_key": "...",
  "schema_version": 2,
  "raw_markdown": "...",
  "sections": {
    "borrower": {
      "heading": "## Borrower",
      "text": "...",
      "extracted": {                     // SectionExtractionResponse.model_dump()
        "summary": "...",
        "facts": [<universal fields>...],
        "risks": [<universal+severity/category>...],
        "open_questions": [<question/why_unanswered/suggested_next_step>...],
        "extraction_metadata": {...}
      }
    }
  },
  "structured_results": [<ExcelExtractionResponse rows>...]
}
```

When validation fails, the corresponding `extracted` block is replaced with
`{ "_validation_error": {...} }` (or transport / unexpected variants).

### Backwards compatibility

Phase 1 entries (no `schema_version` or `schema_version < 2`) are migrated on
read by `memo_store._migrate_on_read`:

- Every fact / risk gets the universal-schema defaults
  (`extraction_confidence: "unknown"`, `ambiguity_notes: "Migrated from
  Phase 1 — no provenance available."`).
- The record is annotated with `_legacy_schema: True`. The UI shows a
  "Pre-validation extraction" badge so analysts know the provenance is
  thin.
- The on-disk file is **not** rewritten — re-extracting under the new
  prompts is the canonical path to upgrade a record.



## 1. Document intake

- **Upload mode**: the browser POSTs `multipart/form-data` to
  `/api/pdf-image/extract/run` with one or more `files` parts. The route
  reads each file into memory.
- **Folder mode**: the browser POSTs `application/json` with `{folder:
  "<path>"}`. The route lists `*.pdf` files in the directory.

For each PDF the route builds a `(filename, bytes)` tuple. The list is
passed to a background job via `app.services.jobs.submit`.

## 2. Background job kickoff

- A UUID becomes the `job_id`, returned to the client immediately.
- The frontend polls `GET /api/jobs/<id>/status` every 1s until the job
  reaches `succeeded` / `failed` / `cancelled`.

## 3. Per-document parsing

For each `(filename, bytes)`:

1. `app.services.parsers.parse_pdf` dispatches to the configured parser
   (`MEMO_PDF_PARSER`):
   - `docintel-official` → `app.services.doc_intelligence.extract_pdf_bytes_to_markdown`.
     Calls Azure DI with `prebuilt-layout` and `output_content_format=markdown`.
   - `pypdf` → reads `bytes` via `pypdf.PdfReader`, concatenates pages.
   - `docintel-risklab` → reserved alias for `docintel-official` in v1.
   - `ocr-fallback` → `pdf2image` to render pages, `pytesseract` to OCR.
2. The parser output is normalised through
   `app.utils.normalize._normalize_text` (verbatim agentmemo helper —
   UTF-8 re-encode, line-ending normalisation, collapse 3+ blank lines).

## 4. Section detection

`app.services.extraction.split_sections` walks the markdown, detects
headings via a regex (`^#{1,6} …`), and assigns each heading to a known
section name (executive summary, borrower, facility, financials, covenants,
collateral, risk, esg). Text before the first matched heading becomes the
`preamble` section.

If no headings match, the whole document becomes a single `preamble`
section. We never silently drop content.

## 5. LLM section extraction

For each section, `run_section_prompt` calls `make_llm()` (cached
`AzureChatOpenAI`) with:

- System prompt: `app/prompts/section_extraction_system.txt`
- User prompt: `app/prompts/section_extraction_user.txt` formatted with
  the section name and text.

The system prompt requires a single JSON object with keys `summary`,
`facts`, `risks`, `open_questions`. We `json.loads` the response. Parse
failures land as `{"_parse_error": str, "raw": str}` so the frontend can
show the operator what the model returned.

## 6. Persistence

`memo_store.save_memo` writes a JSON file under
`<active_storage_tier>/memos/<pdf_key>.json`. The payload:

```json
{
  "pdf_key": "borrower_acme_2026_q1",
  "raw_markdown": "...",
  "sections": {
    "borrower": {
      "heading": "## Borrower",
      "text": "...",
      "extracted": {"summary": "...", "facts": [...], "risks": [...], "open_questions": [...]}
    }
  },
  "structured_results": []
}
```

If the active tier is in-memory, persistence happens in a process-local
dict (and is surfaced as `(FAILOVER ...)` in the storage banner).

## 7. Embedding refresh (auto)

`embeddings.refresh_for_memo(pdf_key, raw_markdown)` runs synchronously
after the memo is saved. It:

1. Chunks the markdown via a sliding window of `MEMO_CHUNK_SIZE` chars
   with `MEMO_CHUNK_OVERLAP` chars of overlap.
2. Saves chunks to `<active_storage_tier>/embeddings/<pdf_key>/chunks.json`.
3. Calls Azure OpenAI embeddings (`AzureOpenAIEmbeddings`) on every chunk.
4. Builds a FAISS `IndexFlatIP` over the L2-normalised vectors and writes
   it to `faiss.index`.

Embedding failures (deployment unset, FAISS missing) are logged WARN and
the summary returns `status: failed: <reason>` — the rest of the pipeline
keeps going.

## 8. Structured extraction (Excel tab path)

The Excel tab triggers a separate job that, for each `(memo, prompt)`
pair, calls `qa.answer_single` and persists the row back into the memo
store via `memo_store.append_structured_results`. Both behaviours
(auto-refresh embeddings, persist structured rows) were commented out in
the legacy app — this rebuild enables them per UX contract.

## 9. Q&A and scenario screening

These read from the memo store and the per-document chunk store. They do
not write back to the memo (Q&A) or write only to a separate scenario
results payload (scenario). Embedding indexes are not invalidated by
either path.

## Failure semantics summary

| Stage | Failure | Behaviour |
| --- | --- | --- |
| Parser dispatch | Unknown name | `ValueError`, route returns 400. |
| Parser execution | Exception | `[ERROR EXTRACTING <name>: ...]` in batch result, batch continues. |
| Section LLM | Non-JSON response | `_parse_error` envelope persisted; UI shows raw output. |
| Memo store | Disk full / unwritable | Storage tier failover triggers; logged WARN. |
| Embeddings refresh | Deployment unset / FAISS missing | `status: failed`; pipeline continues. |
| Q&A | Memo missing | `error: memo_not_found` row, scope-all batch continues. |
| Scenario | LLM failure | `risk_level: Insufficient Evidence`, `rationale: Scenario screening failed: <error>`. |
