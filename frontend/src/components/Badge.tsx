/**
 * Status badge — thin border, no fill. Used for status indicators in
 * the recent-prompts list, file-status column, etc.
 */

import type { ReactNode } from "react";

import { classNames } from "@/lib/format";

type Variant = "neutral" | "success" | "warn" | "error";

interface BadgeProps {
  children: ReactNode;
  variant?: Variant;
  className?: string;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  neutral: "border-rule text-ink-muted",
  success: "border-success text-success",
  warn: "border-warn text-warn",
  error: "border-error text-error",
};

export function Badge({ children, variant = "neutral", className }: BadgeProps) {
  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-12 font-medium",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
