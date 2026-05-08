"""Azure Document Intelligence client + PDF→markdown extraction.

Verbatim port of the agentmemo reference pattern. Two key constraints:

* The endpoint is Domino's local nginx proxy (``https://127.0.0.1:8443``). We
  do NOT call ``*.cognitiveservices.azure.com`` directly.
* Authentication is ``DefaultAzureCredential`` only. No API keys.

Failure semantics (per spec):
    * Client construction failure (missing env, missing SDK) → raise.
    * Per-file extraction error → caller inserts an ``[ERROR ...]`` marker and
      continues the batch.
    * NEVER auto-fall-back to another parser. Parser switching is exclusively
      via ``MEMO_PDF_PARSER``.
"""

from __future__ import annotations

import os

from app.utils.normalize import _normalize_text


def _docintel_client():
    """Construct the Azure Document Intelligence client.

    Returns:
        A ``DocumentIntelligenceClient`` instance.

    Raises:
        ValueError: If ``AZURE_DOCINTEL_ENDPOINT`` is not set.
        ImportError: If the Azure SDKs are not installed.
    """

    from azure.ai.documentintelligence import DocumentIntelligenceClient
    from azure.identity import DefaultAzureCredential

    endpoint = os.getenv("AZURE_DOCINTEL_ENDPOINT", "").strip()
    if not endpoint:
        raise ValueError("AZURE_DOCINTEL_ENDPOINT is not set")

    return DocumentIntelligenceClient(
        endpoint=endpoint,
        credential=DefaultAzureCredential(),
        api_version=os.getenv("DOCINTEL_API_VERSION", "2024-11-30"),
    )


def extract_pdf_bytes_to_markdown(pdf_bytes: bytes) -> str:
    """Run a PDF byte payload through Document Intelligence layout in markdown mode.

    Args:
        pdf_bytes: Raw PDF bytes.

    Returns:
        Normalised markdown content.

    Raises:
        ValueError: If the DI endpoint is unset.
        Exception: Any error surfaced from the DI client (caller decides how
            to mark the batch).
    """

    client = _docintel_client()
    poller = client.begin_analyze_document(
        "prebuilt-layout",
        body=pdf_bytes,
        content_type="application/octet-stream",
        output_content_format="markdown",
    )
    result = poller.result()
    return _normalize_text(result.content or "")


# why: shared delimiter so downstream consumers (preview, embedding chunker)
# can reliably split a multi-file payload back apart.
FILE_DELIMITER_TEMPLATE = "=== FILE: {name} ==="


def format_multi_file_markdown(items: list[tuple[str, str]]) -> str:
    """Concatenate per-file markdown using the shared delimiter format.

    Args:
        items: List of ``(filename, markdown)`` tuples.

    Returns:
        A single string with each file separated by ``=== FILE: <name> ===``.
    """

    parts: list[str] = []
    for name, md in items:
        parts.append(FILE_DELIMITER_TEMPLATE.format(name=name))
        parts.append(md.strip())
        parts.append("")
    return "\n".join(parts).rstrip() + "\n"
