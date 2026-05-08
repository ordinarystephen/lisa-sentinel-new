/**
 * Hover tooltip. Light background, hairline border, small shadow. Pure
 * CSS positioning — appears below the trigger by default.
 */

import { useState, type ReactNode } from "react";

import { classNames } from "@/lib/format";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}

export function Tooltip({ content, children, side = "bottom", className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={classNames("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open ? (
        <span
          role="tooltip"
          className={classNames(
            "absolute z-40 whitespace-pre rounded-sm border border-rule bg-bg px-2 py-1 text-12 text-ink shadow-md",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
            "left-1/2 -translate-x-1/2",
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
