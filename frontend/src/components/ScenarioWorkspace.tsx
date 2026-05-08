/**
 * Scenario Analysis workspace — scenario textarea + history list +
 * results table.
 */

import { useEffect, useRef, useState } from "react";
import { Pencil, Play } from "lucide-react";

import { ApiError, apiPost, pollJob } from "@/lib/api";
import { newBookmarkId, useSession } from "@/contexts/useSession";
import { useWorkspace } from "@/contexts/useWorkspace";
import { truncate } from "@/lib/format";
import type { JobState, ScenarioJobResult } from "@/lib/types";

import { Button } from "./Button";
import { ExtractionProgress } from "./ExtractionProgress";
import { PromptBox, type PromptBoxHandle } from "./PromptBox";
import { ScenarioHistory } from "./ScenarioHistory";
import { ScenarioResults } from "./ScenarioResults";
import { Spinner } from "./Spinner";

interface ScenarioWorkspaceProps {
  bookmarkId: string;
  overrideActive: boolean;
}

export function ScenarioWorkspace({ bookmarkId, overrideActive }: ScenarioWorkspaceProps) {
  const { selectedHashes, parserMode, mode, updateMode } = useWorkspace();
  const { upsertPrompt, recordScenarioHistory, pushToast } = useSession();

  const [running, setRunning] = useState(false);
  const [jobState, setJobState] = useState<JobState | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [cancelJobId, setCancelJobId] = useState<string | null>(null);
  const promptRef = useRef<PromptBoxHandle | null>(null);

  useEffect(() => {
    promptRef.current?.setText(mode.scenarioText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    const text = mode.scenarioText.trim();
    if (!text) {
      pushToast("Describe the scenario before running.", "warn");
      return;
    }
    if (selectedHashes.length === 0) {
      pushToast("Select at least one document first.", "warn");
      return;
    }
    setRunning(true);
    setJobState(null);
    setStartedAt(Date.now());

    try {
      const { job_id } = await apiPost<{ job_id: string }>("prompts/scenario", {
        scenario_text: text,
        document_hashes: selectedHashes,
        parser_mode: parserMode,
      });
      setCancelJobId(job_id);
      const result = await pollJob<ScenarioJobResult>(job_id, (state) => setJobState(state));
      updateMode({ scenarioResults: result, scenarioSubmittedText: text });
      const summary = truncate(text, 60);
      const timestamp = new Date().toISOString();
      upsertPrompt({
        id: bookmarkId,
        mode: "scenario",
        summary,
        timestamp,
        payload: {
          scenario_text: text,
          document_hashes: [...selectedHashes],
          parser_mode: parserMode,
        },
        results: result,
      });
      recordScenarioHistory({
        id: newBookmarkId(),
        scenario_text: text,
        timestamp,
        payload: {
          scenario_text: text,
          document_hashes: [...selectedHashes],
          parser_mode: parserMode,
        },
        results: result,
      });
      pushToast(
        `Scenario complete · ${result.rows.length} document${
          result.rows.length === 1 ? "" : "s"
        } screened`,
        "success",
      );
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      pushToast(`Scenario failed: ${msg}`, "error");
    } finally {
      setRunning(false);
      setCancelJobId(null);
    }
  }

  async function cancel() {
    if (!cancelJobId) return;
    try {
      await apiPost(`jobs/${cancelJobId}/cancel`, null);
      pushToast("Cancellation requested", "neutral");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      pushToast(`Cancel failed: ${msg}`, "warn");
    }
  }

  function handleHistoryLoad(text: string) {
    updateMode({ scenarioText: text });
    promptRef.current?.setText(text);
  }

  return (
    <section className="flex flex-col gap-4">
      {overrideActive ? (
        <p className="m-0 inline-flex items-center gap-2 text-12 text-ink-muted">
          <Pencil size={12} aria-hidden="true" />
          Using modified scenario_screening prompt (dev panel override active)
        </p>
      ) : null}

      <PromptBox
        ref={promptRef}
        value={mode.scenarioText}
        onChange={(v) => updateMode({ scenarioText: v })}
        onSubmit={() => run()}
        placeholder="Describe the scenario to evaluate. e.g. SOFR +200bps over 12 months — which counterparties face elevated covenant risk?"
        allowAttachments={false}
        disabled={running}
        shortcutHint="Ctrl+Enter or click Run scenario to submit"
      />

      <div className="flex justify-end">
        <Button
          variant="primary"
          size="lg"
          iconLeft={running ? <Spinner size={14} /> : <Play size={14} />}
          disabled={running || mode.scenarioText.trim().length === 0 || selectedHashes.length === 0}
          onClick={() => run()}
        >
          {running ? "Running…" : "Run scenario"}
        </Button>
      </div>

      {running ? (
        <ExtractionProgress jobState={jobState} startedAt={startedAt} onCancel={cancel} />
      ) : null}

      <ScenarioHistory onLoad={handleHistoryLoad} />

      {mode.scenarioResults && mode.scenarioSubmittedText ? (
        <ScenarioResults
          result={mode.scenarioResults}
          scenarioText={mode.scenarioSubmittedText}
        />
      ) : null}
    </section>
  );
}
