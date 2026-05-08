/**
 * Single-line text input with optional label / helper / error.
 */

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

import { classNames } from "@/lib/format";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: string;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helperText, error, fullWidth = true, id, className, ...props },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const helperId = helperText || error ? `${inputId}-helper` : undefined;

  return (
    <div className={classNames("flex flex-col gap-1", fullWidth ? "w-full" : "")}>
      {label ? (
        <label htmlFor={inputId} className="text-12 font-medium text-ink-muted">
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        aria-describedby={helperId}
        aria-invalid={error ? true : undefined}
        className={classNames(
          "h-9 rounded-sm border bg-bg px-3 text-15 text-ink",
          "placeholder:text-ink-subtle",
          "focus:border-accent focus:outline-none",
          error ? "border-error" : "border-rule",
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={helperId} className="text-12 text-error">
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-12 text-ink-subtle">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});
