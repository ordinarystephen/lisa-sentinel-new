/**
 * Composes the masthead + left rail + main + right rail and owns the
 * session-level wiring (new-session confirmation, recent-prompt
 * restoration).
 */

import { useState } from "react";

import { useLayout } from "@/contexts/useLayout";
import { useSession } from "@/contexts/useSession";
import { useWorkspace } from "@/contexts/useWorkspace";
import type { WorkflowMode, WorkspaceState } from "@/lib/types";

import { ConfirmDialog } from "./ConfirmDialog";
import { DevPromptPanel } from "./DevPromptPanel";
import { LeftRail } from "./LeftRail";
import { Masthead } from "./Masthead";
import { RecentPrompts } from "./RecentPrompts";
import { RightRail } from "./RightRail";
import { ToastStack } from "./ToastStack";
import { Workspace } from "./Workspace";

const MODE_TO_STATE: Record<WorkflowMode, WorkspaceState> = {
  single: "single_prompt",
  "multi-step": "multi_step",
  scenario: "scenario",
};

export function AppShell() {
  const { leftRailOpen, rightRailOpen } = useLayout();
  const { prompts, pushToast } = useSession();
  const {
    state,
    setState,
    setSelectedHashes,
    setParserMode,
    updateMode,
    resetMode,
    setBookmarkId,
    newSession,
  } = useWorkspace();

  const [confirmNewSession, setConfirmNewSession] = useState(false);

  const hasWorkspaceState = state !== "documents_selecting";

  function requestNewSession() {
    if (hasWorkspaceState) {
      setConfirmNewSession(true);
    } else {
      newSession();
    }
  }

  function confirmNewSessionNow() {
    newSession();
    setConfirmNewSession(false);
    pushToast("New session started", "neutral");
  }

  function handleSelectBookmark(id: string) {
    const bookmark = prompts.find((p) => p.id === id);
    if (!bookmark) return;

    // why: clear mode-specific state before applying the bookmark so a
    // restored single-prompt run doesn't inherit a stale conversation
    // from a previous multi-step bookmark and vice versa.
    resetMode();
    setSelectedHashes([...bookmark.payload.document_hashes]);
    setParserMode(bookmark.payload.parser_mode);
    setBookmarkId(bookmark.id);

    if (bookmark.mode === "single") {
      updateMode({
        singleQuestions: bookmark.payload.questions.join("\n"),
        singleSubmittedQuestions: bookmark.payload.questions,
        singleResults: bookmark.results,
        singleAttachedFile: null,
      });
    } else if (bookmark.mode === "multi-step") {
      updateMode({ conversation: bookmark.payload.conversation });
    } else {
      updateMode({
        scenarioText: bookmark.payload.scenario_text,
        scenarioSubmittedText: bookmark.payload.scenario_text,
        scenarioResults: bookmark.results,
      });
    }

    setState(MODE_TO_STATE[bookmark.mode]);
    pushToast(`Restored ${bookmark.mode === "multi-step" ? "multi-step" : bookmark.mode} prompt`, "neutral");
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-bg text-ink">
      <Masthead />
      <div className="flex min-h-0 flex-1">
        <LeftRail open={leftRailOpen}>
          <RecentPrompts
            onNewSession={requestNewSession}
            onSelect={handleSelectBookmark}
          />
        </LeftRail>
        <Workspace />
        <RightRail open={rightRailOpen}>
          <DevPromptPanel />
        </RightRail>
      </div>
      <ToastStack />
      <ConfirmDialog
        open={confirmNewSession}
        title="Start a new session?"
        body="Current selections, mode, and results will be cleared. Recent prompts are preserved."
        confirmLabel="Start new session"
        cancelLabel="Cancel"
        onConfirm={confirmNewSessionNow}
        onCancel={() => setConfirmNewSession(false)}
      />
    </div>
  );
}
