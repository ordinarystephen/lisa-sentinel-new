/**
 * Session-scoped state — recent prompts (cross-mode bookmarks), scenario
 * history (mode-specific), and the toast stack.
 *
 * Stage 3 changed the bookmark shape so a recent-prompts click can fully
 * restore a previous run without an extra fetch. Page refresh resets
 * everything; localStorage is reserved for UI preferences.
 */

import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { SessionBookmark } from "@/lib/types";

import {
  newBookmarkId,
  SessionContext,
  type ScenarioHistoryEntry,
  type SessionContextValue,
  type ToastEntry,
} from "./useSession";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [prompts, setPrompts] = useState<SessionBookmark[]>([]);
  const [scenarioHistory, setScenarioHistory] = useState<ScenarioHistoryEntry[]>([]);
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const upsertPrompt = useCallback<SessionContextValue["upsertPrompt"]>((entry) => {
    setPrompts((prev) => {
      const idx = prev.findIndex((p) => p.id === entry.id);
      if (idx === -1) return [entry, ...prev];
      const next = prev.slice();
      next.splice(idx, 1);
      return [entry, ...next];
    });
  }, []);

  const removePrompt = useCallback((id: string) => {
    setPrompts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearPrompts = useCallback(() => setPrompts([]), []);

  const recordScenarioHistory = useCallback<SessionContextValue["recordScenarioHistory"]>(
    (entry) => {
      setScenarioHistory((prev) => [entry, ...prev]);
    },
    [],
  );

  const pushToast = useCallback<SessionContextValue["pushToast"]>(
    (message, tone = "neutral") => {
      const id = newBookmarkId();
      setToasts((prev) => [...prev, { id, message, tone }]);
      // why: dismiss after 4s — long enough to read, short enough not to pile up.
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      prompts,
      upsertPrompt,
      removePrompt,
      clearPrompts,
      scenarioHistory,
      recordScenarioHistory,
      toasts,
      pushToast,
      dismissToast,
    }),
    [
      prompts,
      upsertPrompt,
      removePrompt,
      clearPrompts,
      scenarioHistory,
      recordScenarioHistory,
      toasts,
      pushToast,
      dismissToast,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
