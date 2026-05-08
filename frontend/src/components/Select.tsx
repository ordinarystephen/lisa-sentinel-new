/**
 * Custom dropdown — built from scratch per the spec (no native `<select>`).
 *
 * Supports keyboard navigation, click-out close, optional disabled options
 * with explanatory tooltip text, and an optional secondary detail line per
 * option.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronDown } from "lucide-react";

import { classNames } from "@/lib/format";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface SelectProps<T extends string> {
  label?: ReactNode;
  helperText?: ReactNode;
  options: SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function Select<T extends string>({
  label,
  helperText,
  options,
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: SelectProps<T>) {
  const reactId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    options.findIndex((o) => o.value === value && !o.disabled),
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(ev: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(ev.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const move = useCallback(
    (delta: number) => {
      setActiveIndex((idx) => {
        const len = options.length;
        if (len === 0) return -1;
        let next = idx;
        for (let i = 0; i < len; i += 1) {
          next = (next + delta + len) % len;
          if (!options[next].disabled) return next;
        }
        return idx;
      });
    },
    [options],
  );

  const onKeyDown = (ev: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open && (ev.key === "Enter" || ev.key === " " || ev.key === "ArrowDown")) {
      ev.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (ev.key === "ArrowDown") {
      ev.preventDefault();
      move(1);
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      move(-1);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      const opt = options[activeIndex];
      if (opt && !opt.disabled) {
        onChange(opt.value);
        setOpen(false);
      }
    }
  };

  return (
    <div ref={containerRef} className={classNames("relative w-full", className)}>
      {label ? (
        <label htmlFor={reactId} className="mb-1 block text-12 font-medium text-ink-muted">
          {label}
        </label>
      ) : null}
      <button
        ref={buttonRef}
        id={reactId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        className={classNames(
          "flex h-9 w-full items-center justify-between gap-2 rounded-sm border bg-bg px-3 text-left text-15 text-ink",
          "transition-colors",
          "focus:border-accent focus:outline-none",
          disabled
            ? "cursor-not-allowed border-rule bg-bg-subtle text-ink-subtle"
            : "border-rule hover:border-rule-strong",
        )}
      >
        <span className="truncate">
          {selected ? selected.label : <span className="text-ink-subtle">{placeholder ?? "Select"}</span>}
        </span>
        <ChevronDown size={16} className="flex-shrink-0 text-ink-subtle" aria-hidden="true" />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-labelledby={reactId}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-rule bg-bg shadow-md"
        >
          {options.map((opt, idx) => {
            const isActive = idx === activeIndex;
            const isSelected = opt.value === value;
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled || undefined}
                title={opt.disabled ? opt.disabledReason ?? "Unavailable" : opt.description}
                onMouseEnter={() => !opt.disabled && setActiveIndex(idx)}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  if (opt.disabled) return;
                  onChange(opt.value);
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                className={classNames(
                  "flex cursor-pointer items-start gap-3 px-3 py-2 text-14",
                  opt.disabled
                    ? "cursor-not-allowed text-ink-subtle"
                    : isActive
                      ? "bg-bg-muted text-ink"
                      : "text-ink",
                )}
              >
                <span className="mt-0.5 flex-shrink-0 text-ink">
                  {isSelected ? <Check size={14} aria-hidden="true" /> : <span className="inline-block w-3.5" />}
                </span>
                <span className="flex flex-col">
                  <span className="font-medium">{opt.label}</span>
                  {opt.description ? (
                    <span className="text-12 text-ink-subtle">{opt.description}</span>
                  ) : null}
                  {opt.disabled && opt.disabledReason ? (
                    <span className="text-12 text-warn">{opt.disabledReason}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {helperText ? <p className="mt-1 text-12 text-ink-subtle">{helperText}</p> : null}
    </div>
  );
}
