/**
 * Hook + context object for DevPromptsProvider. Pulled out of the .tsx so
 * react-refresh can hot-reload the Provider without complaining about a
 * mixed-export module.
 */

import { createContext, useContext } from "react";

import type { DevPromptsResponse, PromptMode } from "@/lib/types";

export interface DevPromptsContextValue {
  data: DevPromptsResponse | null;
  loading: boolean;
  error: string | null;
  /** Pull a fresh snapshot from `GET /api/dev/prompts`. */
  refresh: () => Promise<void>;
  /** Save an override for one mode. Returns the fresh snapshot on success. */
  saveOverride: (
    mode: PromptMode,
    payload: { system?: string; user?: string },
  ) => Promise<void>;
  /** Clear an override. */
  clearOverride: (mode: PromptMode) => Promise<void>;
}

export const DevPromptsContext = createContext<DevPromptsContextValue | null>(null);

export function useDevPrompts(): DevPromptsContextValue {
  const ctx = useContext(DevPromptsContext);
  if (!ctx) throw new Error("useDevPrompts must be used inside DevPromptsProvider");
  return ctx;
}
