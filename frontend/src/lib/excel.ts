/**
 * Tiny SheetJS wrappers for the two export buttons.
 *
 * The xlsx package is heavy; we lazy-import it inside each helper so it
 * only joins the bundle for users who actually click an Excel button.
 */

import type { QaEnvelope, ScenarioRow } from "@/lib/types";

export async function exportSinglePromptToExcel(
  rows: QaEnvelope[],
  filenameByHash: Record<string, string>,
  filename = "single-prompt-results.xlsx",
): Promise<void> {
  const xlsx = await import("xlsx");
  const data = rows.map((r) => {
    const evidence = r.evidence?.[0];
    const docHash = r.document_hash ?? "";
    return {
      Question: r.question ?? "",
      Document: filenameByHash[docHash] ?? docHash,
      "Document hash": docHash,
      Answer: r.answer,
      "Directly answered": r.is_directly_answered === null ? "" : r.is_directly_answered ? "yes" : "no",
      Confidence: r.extraction_confidence ?? "",
      "Confidence rationale": r.confidence_rationale ?? "",
      "Evidence quote": evidence?.quote ?? "",
      "Page reference": evidence?.page_reference ?? "",
      "Inference chain": r.inference_chain ?? "",
      "Unanswered aspects": (r.unanswered_aspects ?? []).join(" · "),
      Error: extractError(r),
    };
  });
  const worksheet = xlsx.utils.json_to_sheet(data);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Results");
  xlsx.writeFile(workbook, filename);
}

export async function exportScenarioToExcel(
  rows: ScenarioRow[],
  filename = "scenario-screening.xlsx",
): Promise<void> {
  const xlsx = await import("xlsx");
  const data = rows.map((r) => ({
    Borrower: r.filename,
    "Document hash": r.document_hash,
    "Risk level": r.risk_level,
    Confidence: r.confidence ?? "",
    "Confidence rationale": r.confidence_rationale ?? "",
    "Summary rationale": r.summary_rationale,
    "Evidence count": r.evidence_quotes.length,
    "Evidence (first quote)": r.evidence_quotes[0]?.quote ?? "",
    "Evidence direction (first)": r.evidence_quotes[0]?.direction ?? "",
    "Evidence page (first)": r.evidence_quotes[0]?.page_reference ?? "",
    "Inference chain": r.inference_chain ?? "",
    "Unaddressed dimensions": (r.unaddressed_dimensions ?? []).join(" · "),
    "Recommended follow-up": r.recommended_followup ?? "",
    Error: extractScenarioError(r),
  }));
  const worksheet = xlsx.utils.json_to_sheet(data);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Scenario");
  xlsx.writeFile(workbook, filename);
}

function extractError(r: QaEnvelope): string {
  if (r._validation_error) return "validation_error";
  if (r._transport_error) return r._transport_error.message ?? "transport_error";
  if (r._unexpected_error) return r._unexpected_error.message ?? "unexpected_error";
  if (r.error) return r.error;
  return "";
}

function extractScenarioError(r: ScenarioRow): string {
  if (r._validation_error) return "validation_error";
  if (r._transport_error) return r._transport_error.message ?? "transport_error";
  if (r._unexpected_error) return r._unexpected_error.message ?? "unexpected_error";
  return "";
}
