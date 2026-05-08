/**
 * Single Prompt mode results — grouped by question, one nested table per
 * question with a row per (document × question) pair.
 *
 * Click on any answer cell with a result opens the SourceImageModal with
 * the first piece of evidence.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";

import { useWorkspace } from "@/contexts/useWorkspace";
import { exportSinglePromptToExcel } from "@/lib/excel";
import { classNames, truncate } from "@/lib/format";
import type { QaEnvelope, SinglePromptJobResult } from "@/lib/types";

import { Badge } from "./Badge";
import { Button } from "./Button";
import { SourceImageModal } from "./SourceImageModal";

interface SinglePromptResultsProps {
  result: SinglePromptJobResult;
  questions: string[];
}

export function SinglePromptResults({ result, questions }: SinglePromptResultsProps) {
  const { documentsByHash } = useWorkspace();
  const [openQuestions, setOpenQuestions] = useState<Set<string>>(() => new Set(questions));
  const [activeRow, setActiveRow] = useState<QaEnvelope | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, QaEnvelope[]>();
    for (const q of questions) map.set(q, []);
    for (const row of result.rows) {
      const key = row.question ?? "";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  }, [questions, result.rows]);

  function toggleQuestion(q: string) {
    setOpenQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(q)) next.delete(q);
      else next.add(q);
      return next;
    });
  }

  function expandAll() {
    setOpenQuestions(new Set(questions));
  }

  function collapseAll() {
    setOpenQuestions(new Set());
  }

  async function downloadExcel() {
    const filenameByHash: Record<string, string> = {};
    for (const [hash, doc] of Object.entries(documentsByHash)) filenameByHash[hash] = doc.filename;
    await exportSinglePromptToExcel(result.rows, filenameByHash);
  }

  return (
    <section aria-labelledby="single-results-heading" className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h3 id="single-results-heading" className="m-0 text-18 font-semibold text-ink">
          Results
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={expandAll}>
            Expand all
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAll}>
            Collapse all
          </Button>
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Download size={14} />}
            onClick={downloadExcel}
          >
            Download Excel
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        {questions.map((question, idx) => {
          const rows = grouped.get(question) ?? [];
          const open = openQuestions.has(question);
          return (
            <article
              key={`${idx}::${question}`}
              className="overflow-hidden rounded-md border border-rule"
            >
              <button
                type="button"
                onClick={() => toggleQuestion(question)}
                aria-expanded={open}
                className={classNames(
                  "flex w-full items-start gap-2 border-b bg-bg-subtle px-4 py-3 text-left text-15",
                  open ? "border-rule" : "border-transparent",
                )}
              >
                <span className="mt-0.5 flex-shrink-0 text-ink-muted">
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <span className="font-medium text-ink">
                  Q{idx + 1}: {question}
                </span>
                <span className="ml-auto text-12 text-ink-subtle">
                  {rows.length} document{rows.length === 1 ? "" : "s"}
                </span>
              </button>
              {open ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-13">
                    <thead>
                      <tr className="border-b border-rule bg-bg text-left text-12 uppercase tracking-wide text-ink-muted">
                        <th className="px-4 py-2">Document</th>
                        <th className="px-4 py-2">Answer</th>
                        <th className="px-4 py-2">Confidence</th>
                        <th className="px-4 py-2">Page</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, rIdx) => (
                        <ResultRow
                          key={`${row.document_hash ?? ""}::${rIdx}`}
                          row={row}
                          documentName={
                            documentsByHash[row.document_hash ?? ""]?.filename ??
                            row.document_hash ??
                            ""
                          }
                          onOpen={() => setActiveRow(row)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <SourceImageModal
        open={activeRow !== null}
        onClose={() => setActiveRow(null)}
        documentHash={activeRow?.document_hash ?? ""}
        documentName={
          activeRow
            ? documentsByHash[activeRow.document_hash ?? ""]?.filename ??
              activeRow.document_hash ??
              ""
            : ""
        }
        pageReference={activeRow?.evidence?.[0]?.page_reference ?? null}
        quote={activeRow?.evidence?.[0]?.quote ?? activeRow?.answer ?? ""}
        questionSummary={truncate(activeRow?.question ?? "", 80)}
        confidence={activeRow?.extraction_confidence ?? null}
        confidenceRationale={activeRow?.confidence_rationale ?? null}
      />
    </section>
  );
}

interface ResultRowProps {
  row: QaEnvelope;
  documentName: string;
  onOpen: () => void;
}

function ResultRow({ row, documentName, onOpen }: ResultRowProps) {
  const hasError =
    row._validation_error || row._transport_error || row._unexpected_error || row.error;
  const noResult = !row.answer && !hasError;
  const evidence = row.evidence?.[0];
  const canOpen = Boolean(evidence) || Boolean(row.answer);

  return (
    <tr className="border-b border-rule last:border-b-0">
      <td className="px-4 py-3 font-mono text-12 text-ink">{documentName}</td>
      <td className="px-4 py-3">
        {hasError ? (
          <span className="text-error">{row.error ?? "Response failed validation"}</span>
        ) : noResult ? (
          <span className="text-ink-subtle">No result</span>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            disabled={!canOpen}
            className="text-left text-ink underline-offset-2 hover:underline"
          >
            {truncate(row.answer, 240)}
          </button>
        )}
      </td>
      <td className="px-4 py-3">
        {row.extraction_confidence ? (
          <Badge
            variant={
              row.extraction_confidence === "high"
                ? "success"
                : row.extraction_confidence === "medium"
                  ? "warn"
                  : "neutral"
            }
          >
            {row.extraction_confidence}
          </Badge>
        ) : (
          <span className="text-ink-subtle">—</span>
        )}
      </td>
      <td className="px-4 py-3 font-mono text-12 text-ink-muted">
        {evidence?.page_reference != null ? String(evidence.page_reference) : "—"}
      </td>
    </tr>
  );
}
