/**
 * Expandable history of scenario analyses run in this session. The user
 * can click an entry to repopulate the prompt box with the full text
 * (re-running is still explicit).
 */

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

import { useSession } from "@/contexts/useSession";
import { formatRelativeTime, truncate } from "@/lib/format";

import { Button } from "./Button";

interface ScenarioHistoryProps {
  onLoad: (text: string) => void;
}

export function ScenarioHistory({ onLoad }: ScenarioHistoryProps) {
  const { scenarioHistory } = useSession();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (scenarioHistory.length === 0) {
    return (
      <article className="rounded-md border border-dashed border-rule bg-bg-subtle px-4 py-6 text-center">
        <p className="m-0 text-13 text-ink-muted">
          No scenario analyses yet. Run your first one above.
        </p>
      </article>
    );
  }

  return (
    <article className="overflow-hidden rounded-md border border-rule">
      <header className="border-b border-rule bg-bg-subtle px-4 py-2 text-12 uppercase tracking-wide text-ink-muted">
        Previous scenario analyses
      </header>
      <ul className="m-0 list-none divide-y divide-rule p-0">
        {scenarioHistory.map((entry) => {
          const isOpen = expanded === entry.id;
          return (
            <li key={entry.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  aria-label={isOpen ? "Collapse scenario" : "Expand scenario"}
                  onClick={() => setExpanded(isOpen ? null : entry.id)}
                  className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-rule text-ink-muted hover:text-ink"
                >
                  {isOpen ? <Minus size={12} /> : <Plus size={12} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-14 text-ink">
                    {isOpen ? entry.scenario_text : truncate(entry.scenario_text, 140)}
                  </p>
                  <p className="m-0 mt-1 text-12 text-ink-subtle">
                    {formatRelativeTime(entry.timestamp)} · {entry.results.rows.length} document
                    {entry.results.rows.length === 1 ? "" : "s"} screened
                  </p>
                </div>
                {isOpen ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onLoad(entry.scenario_text)}
                  >
                    Load this scenario
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
