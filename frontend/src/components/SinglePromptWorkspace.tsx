/**
 * Single Prompt mode workspace.
 *
 * Composes a PromptBox plus the results table. On submit:
 *   1. Build the payload from current state.
 *   2. Read any active dev-panel override marker (cosmetic only — the
 *      backend already pulls the override automatically).
 *   3. POST /api/prompts/single → poll → render results.
 *   4. Push a session bookmark via SessionContext.upsertPrompt.
 */

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";

import { ApiError, apiPost, pollJob } from "@/lib/api";
import { useSession } from "@/contexts/useSession";
import { useWorkspace } from "@/contexts/useWorkspace";
import { truncate } from "@/lib/format";
import type { JobState, SinglePromptJobResult } from "@/lib/types";

import { Badge } from "./Badge";
import { ExtractionProgress } from "./ExtractionProgress";
import { PromptBox, type PromptBoxHandle } from "./PromptBox";
import { SinglePromptResults } from "./SinglePromptResults";

interface SinglePromptWorkspaceProps {
  bookmarkId: string;
  /** True when the dev panel has overridden memo_qa. */
  overrideActive: boolean;
}

export function SinglePromptWorkspace({ bookmarkId, overrideActive }: SinglePromptWorkspaceProps) {
  const {
    selectedHashes,
    parserMode,
    mode,
    updateMode,
  } = useWorkspace();
  const { upsertPrompt, pushToast } = useSession();

  const [running, setRunning] = useState(false);
  const [jobState, setJobState] = useState<JobState | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [cancelJobId, setCancelJobId] = useState<string | null>(null);
  const promptRef = useRef<PromptBoxHandle | null>(null);

  // why: when this component mounts due to a bookmark restore, the
  // workspace state already carries `singleQuestions` + `singleResults`.
  // We just need to make sure the prompt box reflects the value.
  useEffect(() => {
    promptRef.current?.setText(mode.singleQuestions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(questions: string[]) {
    if (questions.length === 0) return;
    if (selectedHashes.length === 0) {
      pushToast("Select at least one document first.", "warn");
      return;
    }
    setRunning(true);
    setJobState(null);
    setStartedAt(Date.now());
    updateMode({ singleSubmittedQuestions: questions });

    try {
      const { job_id } = await apiPost<{ job_id: string }>("prompts/single", {
        questions,
        document_hashes: selectedHashes,
        parser_mode: parserMode,
      });
      setCancelJobId(job_id);
      const result = await pollJob<SinglePromptJobResult>(job_id, (state) => setJobState(state));
      updateMode({ singleResults: result, singleSubmittedQuestions: questions });
      const summary =
        questions.length === 1
          ? truncate(questions[0]!, 80)
          : `${questions.length} questions across ${selectedHashes.length} document${
              selectedHashes.length === 1 ? "" : "s"
            }`;
      upsertPrompt({
        id: bookmarkId,
        mode: "single",
        summary,
        timestamp: new Date().toISOString(),
        payload: {
          questions,
          document_hashes: [...selectedHashes],
          parser_mode: parserMode,
        },
        results: result,
      });
      pushToast(
        `Single Prompt complete · ${result.rows.length} (question × document) pair${
          result.rows.length === 1 ? "" : "s"
        }`,
        "success",
      );
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      pushToast(`Run failed: ${msg}`, "error");
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

  const submitted = mode.singleSubmittedQuestions;
  const results = mode.singleResults;

  return (
    <section className="flex flex-col gap-4">
      {overrideActive ? (
        <p className="m-0 inline-flex items-center gap-2 text-12 text-ink-muted">
          <Pencil size={12} aria-hidden="true" />
          Using modified memo_qa prompt (dev panel override active)
        </p>
      ) : null}

      <PromptBox
        ref={promptRef}
        value={mode.singleQuestions}
        onChange={(v) => updateMode({ singleQuestions: v })}
        onSubmit={handleSubmit}
        placeholder="Ask a question or paste multiple questions, one per line. Or attach a file with questions."
        disabled={running}
      />

      {running ? (
        <ExtractionProgress jobState={jobState} startedAt={startedAt} onCancel={cancel} />
      ) : null}

      {results && submitted.length > 0 ? (
        <>
          <p className="m-0 flex items-center gap-2 text-12 text-ink-subtle">
            <Badge variant="neutral">{results.rows.length} rows</Badge>
            <span>
              {submitted.length} question{submitted.length === 1 ? "" : "s"} ·{" "}
              {selectedHashes.length} document{selectedHashes.length === 1 ? "" : "s"}
            </span>
          </p>
          <SinglePromptResults result={results} questions={submitted} />
        </>
      ) : null}
    </section>
  );
}
