/**
 * Main canvas. Drives the four-step flow:
 *   1. Choose documents (UploadArea)
 *   2. Configure & run extraction
 *   3. Pick a mode
 *   4. Drive the mode-specific workspace
 *
 * State lives in WorkspaceContext so a recent-prompts click can hydrate
 * the workspace without remounting this tree.
 */

import { useState } from "react";

import { ApiError, apiPost, pollJob } from "@/lib/api";
import { useSession } from "@/contexts/useSession";
import { useDevPrompts } from "@/contexts/useDevPrompts";
import { useWorkspace } from "@/contexts/useWorkspace";
import type { ExtractionJobResult, JobState, WorkflowMode } from "@/lib/types";

import { ConfirmDialog } from "./ConfirmDialog";
import { ExtractionConfig } from "./ExtractionConfig";
import { ExtractionProgress } from "./ExtractionProgress";
import { ModeSelector } from "./ModeSelector";
import { MultiStepWorkspace } from "./MultiStepWorkspace";
import { ScenarioWorkspace } from "./ScenarioWorkspace";
import { SinglePromptWorkspace } from "./SinglePromptWorkspace";
import { UploadArea } from "./UploadArea";

const MODE_STATE: Record<WorkflowMode, "single_prompt" | "multi_step" | "scenario"> = {
  single: "single_prompt",
  "multi-step": "multi_step",
  scenario: "scenario",
};

const STATE_TO_MODE: Partial<Record<string, WorkflowMode>> = {
  single_prompt: "single",
  multi_step: "multi-step",
  scenario: "scenario",
};

export function Workspace() {
  const {
    state,
    setState,
    selectedHashes,
    setSelectedHashes,
    documentsByHash,
    registerDocuments,
    parserMode,
    setParserMode,
    sectionPreset,
    setSectionPreset,
    concurrency,
    setConcurrency,
    forceReextract,
    setForceReextract,
    extractionResult,
    setExtractionResult,
    mode,
    bookmarkId,
    refreshBookmarkId,
    resetMode,
  } = useWorkspace();
  const { pushToast } = useSession();
  const { data: devPrompts } = useDevPrompts();

  const [extracting, setExtracting] = useState(false);
  const [jobState, setJobState] = useState<JobState | null>(null);
  const [extractionStartedAt, setExtractionStartedAt] = useState<number | null>(null);
  const [cancelJobId, setCancelJobId] = useState<string | null>(null);
  const [confirmChange, setConfirmChange] = useState(false);

  const memoQaOverride = devPrompts?.overrides_active.memo_qa ?? false;
  const scenarioOverride = devPrompts?.overrides_active.scenario_screening ?? false;

  const activeMode: WorkflowMode | null = STATE_TO_MODE[state] ?? null;
  const showExtractionConfig = selectedHashes.length > 0 && activeMode === null;
  const showModeSelector =
    state === "mode_selecting" || activeMode !== null;

  async function runExtraction() {
    if (selectedHashes.length === 0) {
      pushToast("Select at least one document first.", "warn");
      return;
    }
    setExtracting(true);
    setJobState(null);
    setExtractionStartedAt(Date.now());
    setState("extracting");

    try {
      const { job_id } = await apiPost<{ job_id: string }>("extraction/run", {
        document_hashes: selectedHashes,
        parser_mode: parserMode,
        section_preset: sectionPreset,
        concurrency,
        force_reextract: forceReextract,
      });
      setCancelJobId(job_id);
      const result = await pollJob<ExtractionJobResult>(job_id, (s) => setJobState(s));
      setExtractionResult(result);
      setState("mode_selecting");

      const sectionTotal = result.results.reduce((acc, r) => acc + r.sections_extracted, 0);
      pushToast(
        `Extraction complete · ${result.results.length} document${
          result.results.length === 1 ? "" : "s"
        }, ${sectionTotal} section${sectionTotal === 1 ? "" : "s"}`,
        "success",
      );
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      pushToast(`Extraction failed: ${msg}`, "error");
      // why: drop back to documents_selected so the user can retry from
      // the same config row. The transient `extraction_configured` state
      // was removed in Stage 4 — it was only ever the failure-retry state.
      setState("documents_selected");
    } finally {
      setExtracting(false);
      setCancelJobId(null);
    }
  }

  async function cancelExtraction() {
    if (!cancelJobId) return;
    try {
      await apiPost(`jobs/${cancelJobId}/cancel`, null);
      pushToast("Cancellation requested", "neutral");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      pushToast(`Cancel failed: ${msg}`, "warn");
    }
  }

  function handleSelectionChange(hashes: string[]) {
    setSelectedHashes(hashes);
    // why: dropping back to zero docs after a mode is locked would leave
    // results dangling. Reset everything below the selection in that case.
    if (hashes.length === 0 && (extractionResult || activeMode)) {
      setExtractionResult(null);
      resetMode();
      refreshBookmarkId();
    }
  }

  function handlePickMode(mode: WorkflowMode) {
    refreshBookmarkId();
    setState(MODE_STATE[mode]);
  }

  function modeHasUnsavedWork(): boolean {
    if (state === "single_prompt") {
      return mode.singleQuestions.trim().length > 0 || mode.singleResults !== null;
    }
    if (state === "multi_step") {
      return mode.conversation.length > 0;
    }
    if (state === "scenario") {
      return mode.scenarioText.trim().length > 0 || mode.scenarioResults !== null;
    }
    return false;
  }

  function handleChangeMode() {
    if (modeHasUnsavedWork()) {
      setConfirmChange(true);
      return;
    }
    confirmChangeMode();
  }

  function confirmChangeMode() {
    resetMode();
    refreshBookmarkId();
    setState("mode_selecting");
    setConfirmChange(false);
  }

  function activeModeLabel(): string {
    if (state === "single_prompt") return "Single Prompt";
    if (state === "multi_step") return "Multi-Step";
    if (state === "scenario") return "Scenario";
    return "current";
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-canvas flex-col gap-12 px-6 py-12 lg:px-12">
        <header>
          <h1 className="text-32 font-semibold text-ink">Workspace</h1>
          <p className="mt-2 text-15 text-ink-muted">
            Upload PDFs or pick from the library, configure extraction, then
            choose a mode.
          </p>
        </header>

        <UploadArea
          selectedHashes={selectedHashes}
          onChangeSelection={handleSelectionChange}
          documentsByHash={documentsByHash}
          registerDocuments={registerDocuments}
        />

        {showExtractionConfig ? (
          <ExtractionConfig
            parserMode={parserMode}
            onChangeParserMode={setParserMode}
            sectionPreset={sectionPreset}
            onChangeSectionPreset={setSectionPreset}
            concurrency={concurrency}
            onChangeConcurrency={setConcurrency}
            forceReextract={forceReextract}
            onChangeForceReextract={setForceReextract}
            selectedCount={selectedHashes.length}
            isRunning={extracting}
            onRun={runExtraction}
          />
        ) : null}

        {extracting || (jobState && jobState.state !== "succeeded" && state === "extracting") ? (
          <ExtractionProgress
            jobState={jobState}
            startedAt={extractionStartedAt}
            onCancel={cancelExtraction}
          />
        ) : null}

        {showModeSelector ? (
          <ModeSelector
            activeMode={activeMode}
            onSelectMode={handlePickMode}
            onChangeMode={handleChangeMode}
            documentCount={extractionResult?.results.length ?? selectedHashes.length}
          />
        ) : null}

        {state === "single_prompt" ? (
          <SinglePromptWorkspace
            bookmarkId={bookmarkId}
            overrideActive={memoQaOverride}
          />
        ) : null}

        {state === "multi_step" ? (
          <MultiStepWorkspace
            bookmarkId={bookmarkId}
            overrideActive={memoQaOverride}
          />
        ) : null}

        {state === "scenario" ? (
          <ScenarioWorkspace
            bookmarkId={bookmarkId}
            overrideActive={scenarioOverride}
          />
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmChange}
        title="Change mode?"
        body={`Your current ${activeModeLabel()} workspace will be cleared. (Recent prompts will preserve this run.)`}
        confirmLabel="Change mode"
        cancelLabel="Stay"
        onConfirm={confirmChangeMode}
        onCancel={() => setConfirmChange(false)}
      />
    </main>
  );
}
