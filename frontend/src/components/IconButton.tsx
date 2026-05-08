/**
 * Square icon-only button. Always carries an `aria-label` per the
 * accessibility baseline.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { classNames } from "@/lib/format";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  children: ReactNode;
}

export function IconButton({ children, className, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      className={classNames(
        "inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted",
        "transition-colors hover:bg-bg-hover hover:text-ink",
        "disabled:cursor-not-allowed disabled:text-ink-subtle disabled:hover:bg-transparent",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
