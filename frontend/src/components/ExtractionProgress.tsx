/**
 * Inline progress card for an in-flight extraction job.
 *
 * Shows: progress bar, status message, elapsed time, optional per-document
 * row list. The cancel button calls `POST /api/jobs/<id>/cancel`.
 */

import { useEffect, useState } from "react";
import { CircleAlert, X } from "lucide-react";

import type { JobState } from "@/lib/types";

import { Button } from "./Button";
import { Spinner } from "./Spinner";

interface ExtractionProgressProps {
  jobState: JobState | null;
  startedAt: number | null;
  onCancel: () => void;
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${minutes}m ${rem.toString().padStart(2, "0")}s`;
}

export function ExtractionProgress({ jobState, startedAt, onCancel }: ExtractionProgressProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  const progress = Math.min(100, Math.max(0, jobState?.progress ?? 0));
  const isRunning =
    jobState?.state === "queued" || jobState?.state === "running" || !jobState;
  const isError = jobState?.state === "failed";
  const isCancelled = jobState?.state === "cancelled";
  const elapsed = startedAt ? formatElapsed(now - startedAt) : "0s";

  return (
    <article
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-md border border-rule bg-bg-subtle p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-15 font-medium text-ink">
          {isError ? (
            <CircleAlert size={16} className="text-error" aria-hidden="true" />
          ) : isCancelled ? (
            <X size={16} className="text-ink-muted" aria-hidden="true" />
          ) : (
            <Spinner size={14} />
          )}
          <span>
            {isError
              ? "Extraction failed"
              : isCancelled
                ? "Extraction cancelled"
                : "Running extraction"}
          </span>
        </div>
        <span className="text-12 text-ink-subtle">{elapsed}</span>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-bg-muted"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="m-0 text-13 text-ink-muted">
        {jobState?.message ?? "Submitting…"}
      </p>

      {jobState?.error ? (
        <p className="m-0 text-13 text-error">{jobState.error}</p>
      ) : null}

      {isRunning ? (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}
    </article>
  );
}
