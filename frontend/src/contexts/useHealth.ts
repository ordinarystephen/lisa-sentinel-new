/**
 * Hook + context object for HealthProvider. Lives in its own file so the
 * sibling .tsx stays pure-component (react-refresh can hot-reload it).
 */

import { createContext, useContext } from "react";

import type { ExtractionPresetsResponse, HealthResponse, ParserOption } from "@/lib/types";

export interface HealthContextValue {
  health: HealthResponse | null;
  presets: ExtractionPresetsResponse["presets"];
  parsers: ParserOption[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const HealthContext = createContext<HealthContextValue | null>(null);

export function useHealth(): HealthContextValue {
  const ctx = useContext(HealthContext);
  if (!ctx) throw new Error("useHealth must be used inside HealthProvider");
  return ctx;
}
