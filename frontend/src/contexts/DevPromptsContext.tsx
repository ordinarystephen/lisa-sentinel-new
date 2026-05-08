/**
 * Dev panel context — the right rail and the workspace both need to read
 * `overrides_active` so the workspace can show a "Using modified prompt"
 * marker without each component re-fetching.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError, apiGet, apiPut } from "@/lib/api";
import type { DevPromptsResponse } from "@/lib/types";

import { DevPromptsContext, type DevPromptsContextValue } from "./useDevPrompts";

export function DevPromptsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DevPromptsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiGet<DevPromptsResponse>("dev/prompts");
      setData(r);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveOverride = useCallback<DevPromptsContextValue["saveOverride"]>(
    async (mode, payload) => {
      await apiPut("dev/prompts", { mode, ...payload });
      await refresh();
    },
    [refresh],
  );

  const clearOverride = useCallback<DevPromptsContextValue["clearOverride"]>(
    async (mode) => {
      await apiPut("dev/prompts", { mode, clear: true });
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<DevPromptsContextValue>(
    () => ({ data, loading, error, refresh, saveOverride, clearOverride }),
    [data, loading, error, refresh, saveOverride, clearOverride],
  );

  return <DevPromptsContext.Provider value={value}>{children}</DevPromptsContext.Provider>;
}
