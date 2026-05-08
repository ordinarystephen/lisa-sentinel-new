/**
 * Multi-line input. The `autoResize` variant grows with content (up to
 * `maxHeight`) — used by the AI prompt box later.
 */

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import { classNames } from "@/lib/format";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: string;
  autoResize?: boolean;
  maxHeight?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    helperText,
    error,
    autoResize = false,
    maxHeight = 320,
    id,
    className,
    rows,
    value,
    onChange,
    ...props
  },
  forwardedRef,
) {
  const reactId = useId();
  const taId = id ?? reactId;
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement);

  useEffect(() => {
    if (!autoResize) return;
    const el = innerRef.current;
    if (!el) return;
    // why: reset to "auto" before measuring so shrinking works after
    // deletion, then clamp to maxHeight.
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [autoResize, maxHeight, value]);

  const helperId = helperText || error ? `${taId}-helper` : undefined;

  return (
    <div className="flex w-full flex-col gap-1">
      {label ? (
        <label htmlFor={taId} className="text-12 font-medium text-ink-muted">
          {label}
        </label>
      ) : null}
      <textarea
        ref={innerRef}
        id={taId}
        rows={rows ?? (autoResize ? 1 : 4)}
        value={value}
        onChange={onChange}
        aria-describedby={helperId}
        aria-invalid={error ? true : undefined}
        className={classNames(
          "rounded-sm border bg-bg px-3 py-2 text-15 text-ink resize-y",
          "placeholder:text-ink-subtle",
          "focus:border-accent focus:outline-none",
          autoResize ? "overflow-y-auto resize-none" : "",
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
