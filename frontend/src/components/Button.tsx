/**
 * Button — primary/secondary/ghost/icon variants.
 *
 * Apple-clean: dark grey on white for primary, hairline border for
 * secondary, transparent ghost. No fully-rounded shapes; max radius is
 * `rounded-md` (8px).
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { classNames } from "@/lib/format";

type Variant = "primary" | "secondary" | "ghost" | "icon";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-accent text-bg hover:bg-accent-hover disabled:bg-rule-strong disabled:text-ink-subtle",
  secondary:
    "bg-bg text-ink border border-rule hover:bg-bg-hover disabled:text-ink-subtle disabled:bg-bg-subtle",
  ghost:
    "bg-transparent text-ink-muted hover:text-ink hover:bg-bg-hover disabled:text-ink-subtle",
  icon: "bg-transparent text-ink-muted hover:text-ink hover:bg-bg-hover",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-8 px-3 text-14",
  md: "h-9 px-4 text-15",
  lg: "h-11 px-6 text-15 font-medium",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    fullWidth = false,
    iconLeft,
    iconRight,
    children,
    className,
    type,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={classNames(
        "inline-flex items-center justify-center gap-2 rounded-md transition-colors",
        "disabled:cursor-not-allowed",
        VARIANT_CLASSES[variant],
        variant === "icon" ? "h-9 w-9 rounded-md" : SIZE_CLASSES[size],
        fullWidth ? "w-full" : "",
        className,
      )}
      {...props}
    >
      {iconLeft ? <span className="flex-shrink-0">{iconLeft}</span> : null}
      {children ? <span>{children}</span> : null}
      {iconRight ? <span className="flex-shrink-0">{iconRight}</span> : null}
    </button>
  );
});
