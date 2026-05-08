/**
 * Scenario screening results — sortable / filterable table plus an
 * expandable detail panel per row.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Download, ExternalLink } from "lucide-react";

import { useWorkspace } from "@/contexts/useWorkspace";
import { exportScenarioToExcel } from "@/lib/excel";
import { classNames, truncate } from "@/lib/format";
import type { RiskLevel, ScenarioJobResult, ScenarioRow } from "@/lib/types";

import { Badge } from "./Badge";
import { Button } from "./Button";
import { SourceImageModal } from "./SourceImageModal";

const RISK_ORDER: Record<RiskLevel, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  "Insufficient Evidence": 3,
};

const RISK_VARIANT: Record<RiskLevel, "error" | "warn" | "success" | "neutral"> = {
  High: "error",
  Medium: "warn",
  Low: "success",
  "Insufficient Evidence": "neutral",
};

const DIRECTION_VARIANT: Record<string, "error" | "success" | "neutral"> = {
  supports_exposure: "error",
  refutes_exposure: "success",
  contextual: "neutral",
};

const DIRECTION_LABEL: Record<string, string> = {
  supports_exposure: "supports exposure",
  refutes_exposure: "refutes exposure",
  contextual: "contextual",
};

type SortKey = "risk" | "borrower" | "confidence";

interface ScenarioResultsProps {
  result: ScenarioJobResult;
  scenarioText: string;
}

export function ScenarioResults({ result, scenarioText }: ScenarioResultsProps) {
  const { documentsByHash } = useWorkspace();
  const [filter, setFilter] = useState<RiskLevel | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("risk");
  const [activeRow, setActiveRow] = useState<ScenarioRow | null>(null);
  const [activeEvidenceIdx, setActiveEvidenceIdx] = useState(0);

  const sorted = useMemo(() => {
    const filtered = result.rows.filter((r) => filter === "all" || r.risk_level === filter);
    const order = filtered.slice();
    order.sort((a, b) => {
      if (sortKey === "risk") return RISK_ORDER[a.risk_level] - RISK_ORDER[b.risk_level];
      if (sortKey === "borrower") return (a.filename || "").localeCompare(b.filename || "");
      const ord = { high: 0, medium: 1, low: 2 } as const;
      const av = a.confidence ? ord[a.confidence] : 9;
      const bv = b.confidence ? ord[b.confidence] : 9;
      return av - bv;
    });
    return order;
  }, [result.rows, filter, sortKey]);

  const counts = useMemo(() => {
    const out: Record<RiskLevel, number> = {
      High: 0,
      Medium: 0,
      Low: 0,
      "Insufficient Evidence": 0,
    };
    for (const r of result.rows) out[r.risk_level] += 1;
    return out;
  }, [result.rows]);

  async function downloadExcel() {
    await exportScenarioToExcel(result.rows);
  }

  return (
    <section aria-labelledby="scenario-results-heading" className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h3 id="scenario-results-heading" className="m-0 text-18 font-semibold text-ink">
          Scenario results
        </h3>
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Download size={14} />}
          onClick={downloadExcel}
        >
          Download Excel
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-12 uppercase tracking-wide text-ink-muted">Filter</span>
        <FilterChip
          label="All"
          active={filter === "all"}
          onClick={() => setFilter("all")}
          count={result.rows.length}
        />
        {(["High", "Medium", "Low", "Insufficient Evidence"] as RiskLevel[]).map((lvl) => (
          <FilterChip
            key={lvl}
            label={lvl}
            active={filter === lvl}
            onClick={() => setFilter(lvl)}
            count={counts[lvl]}
            variant={RISK_VARIANT[lvl]}
          />
        ))}
      </div>

      <div className="overflow-hidden rounded-md border border-rule">
        <table className="min-w-full text-13">
          <thead>
            <tr className="border-b border-rule bg-bg-subtle text-left text-12 uppercase tracking-wide text-ink-muted">
              <SortableTh label="Borrower" sortKey="borrower" current={sortKey} onSort={setSortKey} />
              <SortableTh label="Risk Level" sortKey="risk" current={sortKey} onSort={setSortKey} />
              <SortableTh
                label="Confidence"
                sortKey="confidence"
                current={sortKey}
                onSort={setSortKey}
              />
              <th className="px-4 py-2">Evidence</th>
              <th className="px-4 py-2">Summary rationale</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.document_hash} className="border-b border-rule last:border-b-0">
                <td className="px-4 py-3 text-ink">
                  {documentsByHash[row.document_hash]?.filename ?? row.filename}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={RISK_VARIANT[row.risk_level]}>{row.risk_level}</Badge>
                </td>
                <td className="px-4 py-3">
                  {row.confidence ? (
                    <span className="text-ink">{row.confidence}</span>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-12 text-ink-muted">
                  {row.evidence_quotes.length}
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {truncate(row.summary_rationale, 160)}
                </td>
                <td className="px-4 py-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setActiveRow(row);
                      setActiveEvidenceIdx(0);
                    }}
                  >
                    View detail
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeRow ? (
        <DetailPanel
          row={activeRow}
          scenarioText={scenarioText}
          onOpenEvidence={(idx) => setActiveEvidenceIdx(idx)}
        />
      ) : null}

      <SourceImageModal
        open={
          activeRow !== null &&
          activeEvidenceIdx >= 0 &&
          activeEvidenceIdx < (activeRow?.evidence_quotes?.length ?? 0)
        }
        onClose={() => {
          // close only the modal — keep the inline detail panel visible
          setActiveEvidenceIdx(-1);
        }}
        documentHash={activeRow?.document_hash ?? ""}
        documentName={
          activeRow ? documentsByHash[activeRow.document_hash]?.filename ?? activeRow.filename : ""
        }
        pageReference={activeRow?.evidence_quotes?.[activeEvidenceIdx]?.page_reference ?? null}
        quote={activeRow?.evidence_quotes?.[activeEvidenceIdx]?.quote ?? ""}
        questionSummary={truncate(scenarioText, 80)}
        confidence={activeRow?.confidence ?? null}
        confidenceRationale={activeRow?.confidence_rationale ?? null}
      />
    </section>
  );
}

interface FilterChipProps {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
  variant?: "error" | "warn" | "success" | "neutral";
}

function FilterChip({ label, active, count, onClick, variant = "neutral" }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-12 transition-colors",
        active
          ? variant === "error"
            ? "border-error text-error"
            : variant === "warn"
              ? "border-warn text-warn"
              : variant === "success"
                ? "border-success text-success"
                : "border-ink text-ink"
          : "border-rule text-ink-muted hover:text-ink",
      )}
    >
      {label}
      <span className="font-mono text-12 text-ink-subtle">{count}</span>
    </button>
  );
}

interface SortableThProps {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  onSort: (k: SortKey) => void;
}

function SortableTh({ label, sortKey, current, onSort }: SortableThProps) {
  const active = current === sortKey;
  return (
    <th className="px-4 py-2">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={classNames(
          "inline-flex items-center gap-1",
          active ? "text-ink" : "text-ink-muted hover:text-ink",
        )}
      >
        {label}
        {active ? (
          <ChevronDown size={12} />
        ) : (
          <ChevronUp size={12} className="opacity-30" />
        )}
      </button>
    </th>
  );
}

interface DetailPanelProps {
  row: ScenarioRow;
  scenarioText: string;
  onOpenEvidence: (idx: number) => void;
}

function DetailPanel({ row, onOpenEvidence }: DetailPanelProps) {
  const { documentsByHash } = useWorkspace();
  const documentName = documentsByHash[row.document_hash]?.filename ?? row.filename;
  return (
    <article className="flex flex-col gap-4 rounded-md border border-rule bg-bg-subtle p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h4 className="m-0 text-15 font-semibold text-ink">{documentName}</h4>
        <Badge variant={RISK_VARIANT[row.risk_level]}>{row.risk_level}</Badge>
        {row.confidence ? <Badge variant="neutral">confidence: {row.confidence}</Badge> : null}
      </header>
      <p className="m-0 text-14 text-ink">{row.summary_rationale}</p>

      {row.evidence_quotes.length > 0 ? (
        <section>
          <p className="m-0 mb-2 text-12 uppercase tracking-wide text-ink-muted">Evidence</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {row.evidence_quotes.map((ev, idx) => (
              <li key={idx} className="rounded-md border border-rule bg-bg p-3">
                <blockquote className="m-0 border-l-2 border-rule-strong pl-3 font-display italic text-13 text-ink">
                  “{truncate(ev.quote, 240)}”
                </blockquote>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-12 text-ink-muted">
                  <Badge variant={DIRECTION_VARIANT[ev.direction] ?? "neutral"}>
                    {DIRECTION_LABEL[ev.direction] ?? ev.direction}
                  </Badge>
                  {ev.page_reference != null ? (
                    <span className="font-mono">page {String(ev.page_reference)}</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onOpenEvidence(idx)}
                    className="ml-auto inline-flex items-center gap-1 text-ink underline-offset-2 hover:underline"
                  >
                    View source <ExternalLink size={12} />
                  </button>
                </p>
                {ev.relevance ? (
                  <p className="mt-2 m-0 text-13 text-ink-muted">{ev.relevance}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {row.inference_chain ? (
        <section>
          <p className="m-0 mb-1 text-12 uppercase tracking-wide text-ink-muted">Reasoning</p>
          <p className="m-0 text-13 text-ink">{row.inference_chain}</p>
        </section>
      ) : null}

      {row.unaddressed_dimensions.length > 0 ? (
        <section>
          <p className="m-0 mb-1 text-12 uppercase tracking-wide text-warn">
            Limitations / not addressed
          </p>
          <ul className="m-0 list-disc pl-5 text-13 text-ink-muted">
            {row.unaddressed_dimensions.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {row.recommended_followup ? (
        <section>
          <p className="m-0 mb-1 text-12 uppercase tracking-wide text-ink-muted">
            Recommended follow-up
          </p>
          <p className="m-0 text-13 text-ink">{row.recommended_followup}</p>
        </section>
      ) : null}
    </article>
  );
}
