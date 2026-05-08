/**
 * Right-side rail — wrapper that handles open/closed state.
 */

import type { ReactNode } from "react";

import { classNames } from "@/lib/format";

interface RightRailProps {
  open: boolean;
  children: ReactNode;
}

export function RightRail({ open, children }: RightRailProps) {
  return (
    <aside
      aria-hidden={!open}
      className={classNames(
        "flex flex-shrink-0 overflow-hidden border-l border-rule bg-bg-subtle transition-[width] duration-150",
        open ? "w-[360px]" : "w-0",
      )}
    >
      <div className={classNames("h-full w-[360px]", open ? "" : "pointer-events-none")}>
        {children}
      </div>
    </aside>
  );
}
