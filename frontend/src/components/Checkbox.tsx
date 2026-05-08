/**
 * Checkbox — accessible label/control pair.
 */

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Check } from "lucide-react";

import { classNames } from "@/lib/format";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
  description?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, id, className, checked, ...props },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? reactId;
  return (
    <label htmlFor={inputId} className={classNames("inline-flex cursor-pointer items-start gap-2", className)}>
      <span className="relative inline-flex">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          checked={checked}
          className="peer sr-only"
          {...props}
        />
        <span
          aria-hidden="true"
          className={classNames(
            "mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-sm border transition-colors",
            checked ? "border-ink bg-ink text-bg" : "border-rule-strong bg-bg",
            "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-focus-ring peer-focus-visible:outline-offset-2",
          )}
        >
          {checked ? <Check size={12} strokeWidth={3} /> : null}
        </span>
      </span>
      {label || description ? (
        <span className="flex flex-col">
          {label ? <span className="text-15 text-ink">{label}</span> : null}
          {description ? <span className="text-12 text-ink-subtle">{description}</span> : null}
        </span>
      ) : null}
    </label>
  );
});
