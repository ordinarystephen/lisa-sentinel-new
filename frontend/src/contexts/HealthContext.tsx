/**
 * Loads `/api/health` once on mount and exposes the result to the tree.
 *
 * Stage 2 uses this for the parser dropdown and to display connection
 * status in the masthead. Stage 3 may extend with re-fetch semantics; for
 * now a single load on mount is enough.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { apiGet, ApiError } from "@/lib/api";
import type { ExtractionPresetsResponse, HealthResponse, ParserOption } from "@/lib/types";

import { HealthContext, type HealthContextValue } from "./useHealth";

const PARSER_LABELS: Record<string, string> = {
  "docintel-official": "Document Intelligence (Standard)",
  "docintel-risklab": "Document Intelligence (Risklab)",
  pypdf: "PyPDF (Local)",
  "ocr-fallback": "OCR Fallback",
};

function parserOptionsFromHealth(health: HealthResponse | null): ParserOption[] {
  if (!health) return [];
  const out: ParserOption[] = [];
  for (const [id, status] of Object.entries(health.parsers)) {
    if (id === "available_presets") continue;
    if (Array.isArray(status)) continue;
    const available = status === "available";
    out.push({
      id,
      label: PARSER_LABELS[id] ?? id,
      available,
      reason: available ? undefined : status,
    });
  }
  // why: preserve a stable order regardless of dict iteration in the JSON.
  const order = ["docintel-official", "docintel-risklab", "pypdf", "ocr-fallback"];
  out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return out;
}

export function HealthProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [presets, setPresets] = useState<ExtractionPresetsResponse["presets"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [h, p] = await Promise.all([
        apiGet<HealthResponse>("health"),
        apiGet<ExtractionPresetsResponse>("extraction/presets"),
      ]);
      setHealth(h);
      setPresets(p.presets ?? []);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const value = useMemo<HealthContextValue>(
    () => ({
      health,
      presets,
      parsers: parserOptionsFromHealth(health),
      loading,
      error,
      refresh: load,
    }),
    [health, presets, loading, error],
  );

  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}
