/**
 * Card-style radio group. Each option is a clickable card with a title
 * and an optional short description / icon.
 */

import { useId, type ReactNode } from "react";

import { classNames } from "@/lib/format";

export interface RadioOption<T extends string> {
  value: T;
  title: string;
  description?: string;
  icon?: ReactNode;
}

interface RadioGroupProps<T extends string> {
  legend?: ReactNode;
  options: RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  layout?: "row" | "column";
  className?: string;
}

export function RadioGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
  layout = "row",
  className,
}: RadioGroupProps<T>) {
  const groupId = useId();
  return (
    <fieldset className={classNames("border-0 p-0 m-0", className)}>
      {legend ? (
        <legend className="mb-2 block text-12 font-medium uppercase tracking-wide text-ink-muted">
          {legend}
        </legend>
      ) : null}
      <div
        className={classNames(
          "grid gap-3",
          layout === "row" ? "sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1",
        )}
        role="radiogroup"
        aria-labelledby={legend ? `${groupId}-legend` : undefined}
      >
        {options.map((opt) => {
          const id = `${groupId}-${opt.value}`;
          const isSelected = opt.value === value;
          return (
            <label
              key={opt.value}
              htmlFor={id}
              className={classNames(
                "flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors",
                isSelected
                  ? "border-ink bg-bg-subtle"
                  : "border-rule bg-bg hover:border-rule-strong",
              )}
            >
              <input
                id={id}
                type="radio"
                value={opt.value}
                checked={isSelected}
                onChange={() => onChange(opt.value)}
                className="sr-only"
                aria-describedby={opt.description ? `${id}-desc` : undefined}
              />
              <span
                aria-hidden="true"
                className={classNames(
                  "mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border",
                  isSelected ? "border-ink" : "border-rule-strong",
                )}
              >
                {isSelected ? <span className="h-2 w-2 rounded-full bg-ink" /> : null}
              </span>
              <span className="flex flex-1 flex-col">
                <span className="flex items-center gap-2 text-15 font-medium text-ink">
                  {opt.icon ? <span className="text-ink-muted">{opt.icon}</span> : null}
                  {opt.title}
                </span>
                {opt.description ? (
                  <span id={`${id}-desc`} className="mt-1 text-13 text-ink-muted">
                    {opt.description}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
