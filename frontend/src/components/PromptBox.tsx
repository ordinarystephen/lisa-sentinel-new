/**
 * AI-prompt-box-style input. Used by Single Prompt and Multi-Step modes
 * (Multi-Step is a chat history that ends with a sticky PromptBox).
 *
 * Behaviour:
 *  - Enter inserts a newline.
 *  - Ctrl+Enter (Cmd+Enter on Mac) submits.
 *  - Paperclip attaches a file of questions (.xlsx / .csv / .txt).
 *    File contents are split into one question per row/line.
 */

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { ArrowUp, Paperclip, X } from "lucide-react";

import { classNames } from "@/lib/format";

import { IconButton } from "./IconButton";

export interface PromptBoxHandle {
  /** Programmatic clear used by submit handlers. */
  clear: () => void;
  /** Replace the current text — used when restoring from a recent prompt. */
  setText: (text: string) => void;
}

interface PromptBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (questions: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  helperText?: ReactNode;
  /** Submit-button label; default "Send". */
  submitLabel?: string;
  /** When false, hide the paperclip; used by Scenario mode. */
  allowAttachments?: boolean;
  /** Allow caller to swap label of the helper line per mode. */
  shortcutHint?: ReactNode;
}

interface AttachedFile {
  name: string;
  questions: string[];
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function parseQuestionsFromFile(file: File): Promise<string[]> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "txt") {
    const text = await readFileAsText(file);
    return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  if (ext === "csv") {
    const text = await readFileAsText(file);
    return parseCsvQuestions(text);
  }
  if (ext === "xlsx" || ext === "xls") {
    const buffer = await file.arrayBuffer();
    const xlsx = await import("xlsx");
    const wb = xlsx.read(buffer, { type: "array" });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) return [];
    const sheet = wb.Sheets[firstSheetName];
    const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (rows.length === 0) return [];
    const candidateKeys = ["Question", "question", "Questions", "questions"];
    const sample = rows[0]!;
    const sampleKeys = Object.keys(sample);
    const key = candidateKeys.find((c) => sampleKeys.includes(c)) ?? sampleKeys[0];
    if (!key) return [];
    return rows
      .map((r) => String(r[key] ?? "").trim())
      .filter((s) => s.length > 0);
  }
  // Unknown extension — try as plain text.
  const text = await readFileAsText(file);
  return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function parseCsvQuestions(text: string): string[] {
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  // Try to detect a "Question" header in the first line; otherwise take
  // every non-empty line as a question.
  const first = lines[0]!;
  const cells = first.split(",").map((s) => stripCsvField(s));
  const lower = cells.map((c) => c.toLowerCase());
  const colIndex = lower.findIndex((c) => c === "question" || c === "questions");
  if (colIndex === -1) {
    return lines.map((l) => stripCsvField(l.split(",")[0] ?? ""));
  }
  return lines
    .slice(1)
    .map((row) => stripCsvField(row.split(",")[colIndex] ?? ""))
    .filter((s) => s.length > 0);
}

function stripCsvField(s: string): string {
  let v = s.trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replaceAll('""', '"');
  return v.trim();
}

export const PromptBox = forwardRef<PromptBoxHandle, PromptBoxProps>(function PromptBox(
  {
    value,
    onChange,
    onSubmit,
    placeholder = "Ask a question or paste multiple questions, one per line.",
    disabled,
    helperText,
    submitLabel = "Send",
    allowAttachments = true,
    shortcutHint,
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attached, setAttached] = useState<AttachedFile | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  function adjustHeight(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }

  useImperativeHandle(ref, () => ({
    clear() {
      onChange("");
      setAttached(null);
      setParseError(null);
      // why: empty text should snap back to the min height; without this
      // a previously-tall box stays tall after clear().
      if (textareaRef.current) adjustHeight(textareaRef.current);
    },
    setText(text: string) {
      onChange(text);
      // why: a freshly-restored long bookmark needs the height recomputed
      // immediately; the textarea's own change event won't fire from this
      // path. Defer one tick so the DOM has the new value.
      if (textareaRef.current) {
        const el = textareaRef.current;
        queueMicrotask(() => adjustHeight(el));
      }
    },
  }));

  function handleChange(ev: ChangeEvent<HTMLTextAreaElement>) {
    onChange(ev.target.value);
    adjustHeight(ev.target);
  }

  function collectQuestions(): string[] {
    const typed = value
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    return [...typed, ...(attached?.questions ?? [])];
  }

  function submit() {
    if (disabled) return;
    const questions = collectQuestions();
    if (questions.length === 0) return;
    onSubmit(questions);
  }

  function handleKeyDown(ev: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      submit();
    }
  }

  async function handleFile(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setParseError(null);
    try {
      const questions = await parseQuestionsFromFile(file);
      if (questions.length === 0) {
        setParseError("File parsed but no questions were found.");
        setAttached(null);
      } else {
        setAttached({ name: file.name, questions });
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      setAttached(null);
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeAttachment() {
    setAttached(null);
  }

  return (
    <div
      className={classNames(
        "flex flex-col gap-2 rounded-lg border bg-bg p-3 transition-colors",
        disabled ? "border-rule" : "border-rule focus-within:border-rule-strong",
      )}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        className={classNames(
          "min-h-[64px] max-h-[320px] w-full resize-none border-0 bg-transparent text-15 text-ink",
          "placeholder:text-ink-subtle focus:outline-none",
        )}
      />

      {attached ? (
        <div className="flex items-center justify-between rounded-md border border-rule bg-bg-subtle px-3 py-2">
          <span className="text-13 text-ink">
            <span className="font-mono text-12 text-ink-muted">{attached.name}</span>
            <span className="ml-2 text-ink-muted">
              · {attached.questions.length} question
              {attached.questions.length === 1 ? "" : "s"} loaded
            </span>
          </span>
          <IconButton aria-label="Remove attached file" onClick={removeAttachment}>
            <X size={14} />
          </IconButton>
        </div>
      ) : null}

      {parseError ? (
        <p className="text-12 text-error">Could not parse file: {parseError}</p>
      ) : null}

      <div className="flex items-center justify-between">
        <span className="text-12 text-ink-subtle">
          {shortcutHint ?? "Ctrl+Enter to send · Enter for newline"}
          {parsing ? " · parsing file…" : ""}
        </span>
        <div className="flex items-center gap-2">
          {allowAttachments ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv,.txt"
                onChange={handleFile}
                className="sr-only"
                aria-label="Attach a file of questions"
              />
              <IconButton
                aria-label="Attach a file of questions"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || parsing}
              >
                <Paperclip size={16} />
              </IconButton>
            </>
          ) : null}
          <IconButton
            aria-label={submitLabel}
            onClick={submit}
            disabled={disabled || (value.trim().length === 0 && !attached)}
            className="bg-accent text-bg hover:bg-accent-hover hover:text-bg disabled:bg-rule-strong"
          >
            <ArrowUp size={16} />
          </IconButton>
        </div>
      </div>

      {helperText ? <p className="m-0 text-12 text-ink-subtle">{helperText}</p> : null}
    </div>
  );
});
