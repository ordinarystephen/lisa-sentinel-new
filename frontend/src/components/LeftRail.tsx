/**
 * Left-side rail — wrapper that handles open/closed state. Stage 2 only
 * embeds the RecentPrompts panel; future content (saved scenarios, etc.)
 * gets added here.
 */

import type { ReactNode } from "react";

import { classNames } from "@/lib/format";

interface LeftRailProps {
  open: boolean;
  children: ReactNode;
}

export function LeftRail({ open, children }: LeftRailProps) {
  return (
    <aside
      aria-hidden={!open}
      className={classNames(
        "flex flex-shrink-0 overflow-hidden border-r border-rule bg-bg-subtle transition-[width] duration-150",
        open ? "w-[280px]" : "w-0",
      )}
    >
      <div className={classNames("h-full w-[280px]", open ? "" : "pointer-events-none")}>
        {children}
      </div>
    </aside>
  );
}
