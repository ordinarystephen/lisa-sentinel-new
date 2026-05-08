/**
 * Multi-Step (conversational) workspace.
 *
 * Stack of turns with a sticky PromptBox at the bottom. Each user submit
 * appends a placeholder assistant turn while the synchronous
 * `POST /api/prompts/multi-step` request is in flight, then replaces it
 * with the real envelope.
 */

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Pencil } from "lucide-react";

import { ApiError, apiPost } from "@/lib/api";
import { useSession } from "@/contexts/useSession";
import { useWorkspace } from "@/contexts/useWorkspace";
import { truncate } from "@/lib/format";
import type {
  ConversationTurn,
  EvidenceQuote,
  MultiStepResponse,
} from "@/lib/types";

import { Badge } from "./Badge";
import { PromptBox } from "./PromptBox";
import { SourceImageModal } from "./SourceImageModal";
import { Spinner } from "./Spinner";

interface MultiStepWorkspaceProps {
  bookmarkId: string;
  overrideActive: boolean;
}

interface ActiveEvidence {
  documentHash: string;
  documentName: string;
  pageReference: number | string | null;
  quote: string;
  questionSummary: string;
  confidence: "high" | "medium" | "low" | null;
  rationale: string | null;
}

export function MultiStepWorkspace({ bookmarkId, overrideActive }: MultiStepWorkspaceProps) {
  const { selectedHashes, parserMode, mode, updateMode, documentsByHash } = useWorkspace();
  const { upsertPrompt, pushToast } = useSession();

  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState("");
  const [activeEvidence, setActiveEvidence] = useState<ActiveEvidence | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickAtBottomRef = useRef(true);

  // why: auto-scroll to bottom when the conversation grows AND the user
  // is already at the bottom; otherwise leave their reading position alone.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickAtBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [mode.conversation.length]);

  function handleScroll(ev: React.UIEvent<HTMLDivElement>) {
    const el = ev.currentTarget;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickAtBottomRef.current = distance < 24;
  }

  async function handleSubmit(questions: string[]) {
    if (questions.length === 0) return;
    if (selectedHashes.length === 0) {
      pushToast("Select at least one document first.", "warn");
      return;
    }
    const userContent = questions.join("\n");
    const userTurn: ConversationTurn = { role: "user", content: userContent };
    const placeholder: ConversationTurn = {
      role: "assistant",
      content: "",
      pending: true,
    };
    const conversationWithUser = [...mode.conversation, userTurn];
    const renderConversation = [...conversationWithUser, placeholder];
    updateMode({ conversation: renderConversation });
    setDraft("");
    setPending(true);

    try {
      const res = await apiPost<MultiStepResponse>("prompts/multi-step", {
        conversation: conversationWithUser,
        document_hashes: selectedHashes,
        parser_mode: parserMode,
      });
      const assistantTurn: ConversationTurn = {
        role: "assistant",
        content: res.response.answer ?? "",
        envelope: res.response,
      };
      const finalConversation = [...conversationWithUser, assistantTurn];
      updateMode({ conversation: finalConversation });

      // why: bookmark uses first user message as the headline, last user
      // message as a hover-detail tail.
      const firstUser = finalConversation.find((t) => t.role === "user")?.content ?? userContent;
      const summary =
        finalConversation.length > 2
          ? `${truncate(firstUser, 50)} … ${truncate(userContent, 30)}`
          : truncate(firstUser, 80);
      upsertPrompt({
        id: bookmarkId,
        mode: "multi-step",
        summary,
        timestamp: new Date().toISOString(),
        payload: {
          document_hashes: [...selectedHashes],
          parser_mode: parserMode,
          conversation: finalConversation,
        },
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      const errorTurn: ConversationTurn = {
        role: "assistant",
        content: "",
        errorMessage: msg,
      };
      updateMode({ conversation: [...conversationWithUser, errorTurn] });
      pushToast(`Turn failed: ${msg}`, "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex h-full flex-col gap-3">
      {overrideActive ? (
        <p className="m-0 inline-flex items-center gap-2 text-12 text-ink-muted">
          <Pencil size={12} aria-hidden="true" />
          Using modified memo_qa prompt (dev panel override active)
        </p>
      ) : null}

      <p className="m-0 text-12 text-ink-subtle">
        {selectedHashes.length} document{selectedHashes.length === 1 ? "" : "s"} in scope
      </p>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-[420px] flex-1 overflow-y-auto rounded-md border border-rule bg-bg p-4"
      >
        {mode.conversation.length === 0 ? (
          <p className="m-0 py-8 text-center text-13 text-ink-subtle">
            Start a conversation. The first turn establishes context; each
            subsequent turn builds on the conversation history.
          </p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-4 p-0">
            {mode.conversation.map((turn, idx) => {
              // why: multi-step envelopes don't carry document_hash or
              // question — recover them via the retrieved-chunks index
              // and the most recent user turn before this assistant turn.
              const precedingUser =
                turn.role === "assistant"
                  ? [...mode.conversation.slice(0, idx)]
                      .reverse()
                      .find((t) => t.role === "user")?.content ?? ""
                  : "";
              return (
                <li key={idx}>
                  <Turn
                    turn={turn}
                    precedingUser={precedingUser}
                    documentName={(env, ev) => {
                      const docHash = resolveEvidenceDocHash(env, ev);
                      return (
                        documentsByHash[docHash]?.filename ??
                        ev?.chunk_id ??
                        docHash ??
                        ""
                      );
                    }}
                    resolveDocHash={resolveEvidenceDocHash}
                    onOpenEvidence={(payload) => setActiveEvidence(payload)}
                  />
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="sticky bottom-0 bg-bg pt-2">
        <PromptBox
          value={draft}
          onChange={setDraft}
          onSubmit={handleSubmit}
          placeholder={
            pending
              ? "Waiting for the previous turn to complete…"
              : mode.conversation.length === 0
                ? "Open the conversation. Subsequent turns build on this one."
                : "Continue the conversation. Ctrl+Enter to send."
          }
          disabled={pending}
        />
      </div>

      <SourceImageModal
        open={activeEvidence !== null}
        onClose={() => setActiveEvidence(null)}
        documentHash={activeEvidence?.documentHash ?? ""}
        documentName={activeEvidence?.documentName ?? ""}
        pageReference={activeEvidence?.pageReference ?? null}
        quote={activeEvidence?.quote ?? ""}
        questionSummary={activeEvidence?.questionSummary ?? ""}
        confidence={activeEvidence?.confidence ?? null}
        confidenceRationale={activeEvidence?.rationale ?? null}
      />
    </section>
  );
}


function resolveEvidenceDocHash(
  env: ConversationTurn["envelope"],
  ev: EvidenceQuote | null,
): string {
  if (!env) return "";
  if (ev?.chunk_id) {
    const match = env.retrieved_chunks?.find((c) => c.id === ev.chunk_id);
    if (match?.metadata?.doc_hash) return match.metadata.doc_hash;
  }
  return env.document_hash ?? "";
}

interface TurnProps {
  turn: ConversationTurn;
  precedingUser: string;
  documentName: (env: ConversationTurn["envelope"], ev: EvidenceQuote | null) => string;
  resolveDocHash: (
    env: ConversationTurn["envelope"],
    ev: EvidenceQuote | null,
  ) => string;
  onOpenEvidence: (payload: ActiveEvidence) => void;
}

function Turn({ turn, precedingUser, documentName, resolveDocHash, onOpenEvidence }: TurnProps) {
  if (turn.role === "user") {
    return (
      <div className="rounded-md border border-rule bg-bg-subtle px-4 py-3">
        <p className="m-0 mb-1 text-12 uppercase tracking-wide text-ink-subtle">You</p>
        <p className="m-0 whitespace-pre-wrap text-15 text-ink">{turn.content}</p>
      </div>
    );
  }

  if (turn.pending) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-rule bg-bg px-4 py-3 text-13 text-ink-muted">
        <Spinner size={14} /> Lisa-Sentinel is thinking…
      </div>
    );
  }

  if (turn.errorMessage) {
    return (
      <div className="rounded-md border border-error bg-bg px-4 py-3">
        <p className="m-0 mb-1 text-12 uppercase tracking-wide text-error">Lisa-Sentinel</p>
        <p className="m-0 text-13 text-error">Turn failed: {turn.errorMessage}</p>
      </div>
    );
  }

  const env = turn.envelope;
  const evidence = env?.evidence ?? [];
  return (
    <article className="rounded-md border border-rule bg-bg px-4 py-3">
      <p className="m-0 mb-2 text-12 uppercase tracking-wide text-ink-subtle">Lisa-Sentinel</p>
      {env?.answer_html ? (
        <div
          className="answer-body text-15 text-ink"
          // why: backend rendered Markdown to HTML server-side and escapes
          // raw HTML on the source side, so innerHTML is safe.
          dangerouslySetInnerHTML={{ __html: env.answer_html }}
        />
      ) : (
        <p className="m-0 whitespace-pre-wrap text-15 text-ink">{turn.content}</p>
      )}

      {evidence.length > 0 ? (
        <details className="mt-3 border-t border-rule pt-3">
          <summary className="cursor-pointer text-13 text-ink-muted">
            Show evidence ({evidence.length} quote{evidence.length === 1 ? "" : "s"})
          </summary>
          <ul className="mt-2 flex list-none flex-col gap-2 p-0">
            {evidence.map((ev, idx) => (
              <li key={idx} className="rounded-md border border-rule bg-bg-subtle p-3">
                <blockquote className="m-0 border-l-2 border-rule-strong pl-3 font-display italic text-13 text-ink">
                  “{truncate(ev.quote, 220)}”
                </blockquote>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-12 text-ink-muted">
                  <span className="font-mono">{documentName(env, ev)}</span>
                  {ev.page_reference != null ? (
                    <span className="font-mono">page {String(ev.page_reference)}</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      env
                        ? onOpenEvidence({
                            documentHash: resolveDocHash(env, ev),
                            documentName: documentName(env, ev),
                            pageReference: ev.page_reference,
                            quote: ev.quote,
                            questionSummary: truncate(env.question ?? precedingUser, 80),
                            confidence: env.extraction_confidence,
                            rationale: env.confidence_rationale,
                          })
                        : undefined
                    }
                    className="ml-auto inline-flex items-center gap-1 text-ink underline-offset-2 hover:underline"
                  >
                    View source <ExternalLink size={12} />
                  </button>
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <footer className="mt-3 flex flex-wrap items-center gap-2 text-12 text-ink-muted">
        {env?.extraction_confidence ? (
          <Badge
            variant={
              env.extraction_confidence === "high"
                ? "success"
                : env.extraction_confidence === "medium"
                  ? "warn"
                  : "neutral"
            }
          >
            confidence: {env.extraction_confidence}
          </Badge>
        ) : null}
        {env?.confidence_rationale ? <span>{env.confidence_rationale}</span> : null}
      </footer>

      {env?.unanswered_aspects && env.unanswered_aspects.length > 0 ? (
        <div className="mt-3 border-t border-rule pt-3">
          <p className="m-0 mb-1 text-12 uppercase tracking-wide text-warn">Limitations</p>
          <ul className="m-0 list-disc pl-5 text-13 text-ink-muted">
            {env.unanswered_aspects.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

