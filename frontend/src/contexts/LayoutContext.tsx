/**
 * Rail open/closed state, persisted to localStorage so user preference
 * survives refresh. localStorage usage is bounded to UI preferences only.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { LayoutContext, type LayoutContextValue } from "./useLayout";

const STORAGE_KEY = "lisa.layout.v1";

interface PersistedLayout {
  leftRailOpen: boolean;
  rightRailOpen: boolean;
}

function readPersisted(): PersistedLayout | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedLayout;
    return parsed;
  } catch {
    return null;
  }
}

function writePersisted(value: PersistedLayout) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota / privacy-mode failures — preference is a nicety.
  }
}

function defaultLayout(): PersistedLayout {
  if (typeof window === "undefined") {
    return { leftRailOpen: true, rightRailOpen: false };
  }
  const wide = window.matchMedia("(min-width: 1024px)").matches;
  return { leftRailOpen: wide, rightRailOpen: false };
}

export function LayoutProvider({ children }: { children: ReactNode }) {
  const initial = readPersisted() ?? defaultLayout();
  const [leftRailOpen, setLeftRailOpen] = useState(initial.leftRailOpen);
  const [rightRailOpen, setRightRailOpen] = useState(initial.rightRailOpen);

  useEffect(() => {
    writePersisted({ leftRailOpen, rightRailOpen });
  }, [leftRailOpen, rightRailOpen]);

  const toggleLeftRail = useCallback(() => setLeftRailOpen((v) => !v), []);
  const toggleRightRail = useCallback(() => setRightRailOpen((v) => !v), []);

  const value = useMemo<LayoutContextValue>(
    () => ({
      leftRailOpen,
      rightRailOpen,
      toggleLeftRail,
      toggleRightRail,
      setLeftRailOpen,
      setRightRailOpen,
    }),
    [leftRailOpen, rightRailOpen, toggleLeftRail, toggleRightRail],
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}
