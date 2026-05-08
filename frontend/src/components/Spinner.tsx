/**
 * Minimal loading spinner — used by buttons and the upload-progress UI.
 */

import { Loader2 } from "lucide-react";

import { classNames } from "@/lib/format";

interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

export function Spinner({ size = 16, className, label = "Loading" }: SpinnerProps) {
  return (
    <Loader2
      role="status"
      aria-label={label}
      size={size}
      className={classNames("animate-spin text-ink-muted", className)}
    />
  );
}
