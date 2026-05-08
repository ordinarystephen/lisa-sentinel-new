/**
 * Mode selection — three-card radio group plus a Continue button. After a
 * mode has been picked the selector collapses to a small pill with a
 * "Change" link that brings the full panel back.
 */

import { useState } from "react";
import { ArrowRight, MessageSquare, MessagesSquare, ShieldAlert } from "lucide-react";

import { Button } from "./Button";
import { RadioGroup, type RadioOption } from "./RadioGroup";
import type { WorkflowMode } from "@/lib/types";

interface ModeSelectorProps {
  /**
   * Either the mode the workspace is currently locked into (collapsed
   * pill) or `null` when the user is still picking.
   */
  activeMode: WorkflowMode | null;
  onSelectMode: (mode: WorkflowMode) => void;
  onChangeMode: () => void;
  documentCount: number;
}

const MODE_OPTIONS: RadioOption<WorkflowMode>[] = [
  {
    value: "single",
    title: "Single Prompt",
    description:
      "Ask one or more questions across the selected documents. Get a structured answer per document × question with evidence.",
    icon: <MessageSquare size={18} aria-hidden="true" />,
  },
  {
    value: "multi-step",
    title: "Multi-Step",
    description:
      "Have a conversation with the documents. Each turn builds on the previous, useful for deep-dive analysis of a specific topic.",
    icon: <MessagesSquare size={18} aria-hidden="true" />,
  },
  {
    value: "scenario",
    title: "Scenario Analysis",
    description:
      "Evaluate documents against a hypothetical scenario. Get risk assessments with confidence and evidence per counterparty.",
    icon: <ShieldAlert size={18} aria-hidden="true" />,
  },
];

const MODE_LABELS: Record<WorkflowMode, string> = {
  single: "Single Prompt",
  "multi-step": "Multi-Step",
  scenario: "Scenario Analysis",
};

export function ModeSelector({
  activeMode,
  onSelectMode,
  onChangeMode,
  documentCount,
}: ModeSelectorProps) {
  // why: the radio visually defaults to "single", so the Continue button
  // should match — if the user accepts the default, one click is enough.
  const [pending, setPending] = useState<WorkflowMode | null>("single");

  if (activeMode) {
    return (
      <section aria-labelledby="mode-pill" className="flex flex-col gap-2">
        <p
          id="mode-pill"
          className="m-0 inline-flex items-center gap-3 rounded-md border border-rule bg-bg-subtle px-3 py-2 text-13"
        >
          <span className="text-ink-subtle uppercase tracking-wide text-12">Mode</span>
          <span className="font-medium text-ink">{MODE_LABELS[activeMode]}</span>
          <button
            type="button"
            onClick={onChangeMode}
            className="ml-auto text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Change
          </button>
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="mode-selector-heading" className="flex flex-col gap-4">
      <header>
        <h2 id="mode-selector-heading" className="text-20 font-semibold text-ink">
          3. Choose a mode
        </h2>
        <p className="mt-1 text-13 text-ink-muted">
          Extraction completed for {documentCount} document{documentCount === 1 ? "" : "s"}.
          Pick how you want to interrogate the evidence.
        </p>
      </header>
      <RadioGroup<WorkflowMode>
        options={MODE_OPTIONS}
        value={(pending ?? "single") as WorkflowMode}
        onChange={(v) => setPending(v)}
        layout="row"
      />
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="lg"
          iconRight={<ArrowRight size={14} />}
          disabled={!pending}
          onClick={() => pending && onSelectMode(pending)}
        >
          Continue
        </Button>
      </div>
    </section>
  );
}
