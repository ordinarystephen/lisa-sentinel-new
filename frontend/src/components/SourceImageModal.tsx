/**
 * Page-image preview modal — fetches a rendered PNG from
 * `GET /api/documents/<hash>/pages/<n>` so the user can verify a quote
 * against its source.
 */

import { useEffect, useState, type ReactNode } from "react";

import { Badge } from "./Badge";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";

interface SourceImageModalProps {
  open: boolean;
  onClose: () => void;
  documentHash: string;
  documentName: string;
  pageReference: number | string | null;
  quote: string;
  questionSummary?: ReactNode;
  confidence?: "high" | "medium" | "low" | null;
  confidenceRationale?: string | null;
  ambiguityNotes?: string | null;
}

function pageNumberOf(ref: number | string | null): number | null {
  if (ref === null || ref === undefined) return null;
  if (typeof ref === "number") return ref;
  // accept "8" or "8-9" — pick the first integer
  const m = String(ref).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

export function SourceImageModal({
  open,
  onClose,
  documentHash,
  documentName,
  pageReference,
  quote,
  questionSummary,
  confidence,
  confidenceRationale,
  ambiguityNotes,
}: SourceImageModalProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setImageUrl(null);
      setError(null);
      return;
    }
    const page = pageNumberOf(pageReference);
    if (!page) {
      setImageUrl(null);
      setError(null);
      return;
    }
    let revoked: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `api/documents/${encodeURIComponent(documentHash)}/pages/${page}`,
          { credentials: "same-origin" },
        );
        if (!res.ok) {
          throw new Error(`Could not load page image (HTTP ${res.status})`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        revoked = url;
        if (!cancelled) setImageUrl(url);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [open, documentHash, pageReference]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={questionSummary ? `Evidence: ${questionSummary}` : "Evidence"}
      widthClass="max-w-4xl"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-12 text-ink-muted">
          <span className="font-mono">{documentName}</span>
          {pageReference != null ? (
            <span className="font-mono">page {String(pageReference)}</span>
          ) : null}
          {confidence ? <Badge variant="neutral">confidence: {confidence}</Badge> : null}
        </div>

        <blockquote className="border-l-2 border-rule-strong px-4 py-2 font-display italic text-15 text-ink">
          “{quote}”
        </blockquote>

        <div className="rounded-md border border-rule bg-bg-subtle p-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-14 text-ink-muted">
              <Spinner /> Loading page…
            </div>
          ) : error ? (
            <p className="m-0 px-4 py-8 text-center text-14 text-error">
              {error}
              {pageReference != null ? (
                <span className="mt-2 block text-ink-muted text-12">
                  Page reference: {String(pageReference)}
                </span>
              ) : null}
            </p>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={`Page ${pageReference} of ${documentName}`}
              className="mx-auto block max-h-[70vh] w-auto"
            />
          ) : (
            <p className="m-0 px-4 py-8 text-center text-14 text-ink-muted">
              No page reference available for this evidence.
            </p>
          )}
        </div>

        {confidenceRationale ? (
          <p className="m-0 text-13 text-ink-muted">
            <span className="font-medium text-ink">Confidence rationale:</span>{" "}
            {confidenceRationale}
          </p>
        ) : null}
        {ambiguityNotes ? (
          <p className="m-0 text-13 text-ink-muted">
            <span className="font-medium text-ink">Caveats:</span> {ambiguityNotes}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
