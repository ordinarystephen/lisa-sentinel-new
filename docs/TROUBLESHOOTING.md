# Troubleshooting

Failure modes we have already debugged on Domino. Listed roughly in the order
that operators tend to hit them.

## 1. Static assets 404 (or load with the wrong MIME type)

**Symptom:** the page is unstyled, the JS console shows `MIME type
('text/html') is not executable`.

**Cause:** something is hard-coding `/static/...` instead of going through
`url_for('static', filename=...)`. Domino's HTTP proxy strips the
`/proxy/<port>/` prefix and the absolute path no longer resolves.

**Fix:** every `<link>`/`<script>` MUST use `url_for`. Same rule for
`<img>`. Search the templates: `git grep '"/static/'` should return zero hits.

## 2. API calls 404 against `/api/...`

**Symptom:** the network tab shows `GET https://<domain>/api/health` →
404, but `https://<domain>/proxy/<port>/api/health` works.

**Cause:** the JS used an absolute path. Per `CONSTRAINTS.md`, all frontend
fetches must use RELATIVE paths (`api/...`).

**Fix:** ensure every `fetch` call goes through `LisaApi.get` / `LisaApi.post`,
which uses relative paths. Search `app/static/js/`: `grep "fetch.*'/api"`
should return zero hits.

## 3. `AZURE_DOCINTEL_ENDPOINT is not set`

**Symptom:** `/api/pdf-image/extract/run` job fails with this string in the
result envelope.

**Cause:** the env var is missing in the Domino app environment. The
`pypdf` parser will still work but the docintel-* parsers will not.

**Fix:** set `AZURE_DOCINTEL_ENDPOINT=https://127.0.0.1:8443` in Domino, or
switch `MEMO_PDF_PARSER=pypdf` if you intend to use the pure-Python path.

## 4. Token request fails with `DefaultAzureCredential` chain errors

**Symptom:** the first LLM or DI call returns a
`ClientAuthenticationError` from `azure.identity`.

**Cause:** none of the credential sources resolved (managed identity, env
vars, CLI). On Domino, this almost always means the workspace identity is
not entitled.

**Fix:**
- Confirm the Azure RBAC assignments on the OpenAI / DI resources.
- Confirm the Domino runtime identity matches what the cloud team
  configured.
- Check `/api/health.azure.credential_chain` is `DefaultAzureCredential`.
- Do NOT introduce an API key. There are no API keys in this app by
  policy.

## 5. Storage banner appears with `(FAILOVER from …)`

**Symptom:** the app boots fine, the banner says "Storage degraded — disk:
/tmp (FAILOVER from /storage/lisa-sentinel: …)".

**Cause:** the configured persistent path is missing or full.

**Fix:**
- Confirm Domino has the volume mounted at `MEMO_APP_STORAGE_DIR`.
- Run `df -h` inside the runtime to check free space.
- Persistent data lives there; the failover to `/tmp` is intentional, but
  any work done while degraded is ephemeral.

## 6. Tesseract / Poppler probes report "unavailable"

**Symptom:** `/api/health.parsers["ocr-fallback"]` is unavailable with a
binary-missing reason.

**Cause:** the system packages were not pre-installed in the Domino
environment image.

**Fix:**
- Ask the Domino admin to add `poppler-utils` and `tesseract-ocr` to the
  base image.
- Until then, do not select `MEMO_PDF_PARSER=ocr-fallback`. The other
  parsers (`docintel-official`, `pypdf`) keep working.

## 7. Embeddings refresh reports `embeddings_unavailable`

**Symptom:** the refresh succeeds chunk-wise but the result has
`embedded: 0` and `status: embeddings_unavailable`.

**Cause:** `AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT` is unset, or the deployment
isn't authorized.

**Fix:** set the env var to the embeddings deployment name. Re-run the
refresh from the Data & Setup tab. Q&A still works without embeddings via
`mode = Full extracted memo`.

## 8. A single PDF crashes a batch

**Symptom:** the job state goes to `succeeded` but one row in the result
list contains `[ERROR EXTRACTING <name>: …]`.

**Cause:** per spec we never abort the whole batch for one bad file. The
error string is captured and the rest of the batch finishes.

**Fix:** open the per-run folder under `logging/` — `events.jsonl` will have
the structured log entry for the failure, including stack trace.

## 9. Repeated parser switching produces stale results

**Symptom:** changed `MEMO_PDF_PARSER`, but old extractions linger.

**Cause:** memos are persisted by `pdf_key`. Switching the parser does NOT
re-extract; it only affects new extractions.

**Fix:** delete the stale memos via `DELETE /api/pdf-image/memos/<pdf_key>`
or via the Overview tab's recent list, then re-run extraction.
