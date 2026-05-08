/**
 * Hook + context object + helpers for SessionProvider. Pulled out of the
 * .tsx so that file stays pure-component.
 */

import { createContext, useContext } from "react";

import type { SessionBookmark, ScenarioPayload, ScenarioJobResult } from "@/lib/types";

export interface ToastEntry {
  id: string;
  message: string;
  tone: "neutral" | "success" | "warn" | "error";
}

export interface ScenarioHistoryEntry {
  id: string;
  scenario_text: string;
  timestamp: string;
  payload: ScenarioPayload;
  results: ScenarioJobResult;
}

export interface SessionContextValue {
  prompts: SessionBookmark[];
  upsertPrompt: (entry: SessionBookmark) => void;
  removePrompt: (id: string) => void;
  clearPrompts: () => void;

  scenarioHistory: ScenarioHistoryEntry[];
  recordScenarioHistory: (entry: ScenarioHistoryEntry) => void;

  toasts: ToastEntry[];
  pushToast: (message: string, tone?: ToastEntry["tone"]) => void;
  dismissToast: (id: string) => void;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

export function newBookmarkId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
