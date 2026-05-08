/**
 * Hook + context object for LayoutProvider. Lives in its own file so the
 * sibling .tsx stays pure-component.
 */

import { createContext, useContext } from "react";

export interface LayoutContextValue {
  leftRailOpen: boolean;
  rightRailOpen: boolean;
  toggleLeftRail: () => void;
  toggleRightRail: () => void;
  setLeftRailOpen: (open: boolean) => void;
  setRightRailOpen: (open: boolean) => void;
}

export const LayoutContext = createContext<LayoutContextValue | null>(null);

export function useLayout(): LayoutContextValue {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error("useLayout must be used inside LayoutProvider");
  return ctx;
}
