/**
 * Centred drag-and-drop area with file-input fallback.
 *
 * Idle: dashed `--color-rule` border. Drag-over: solid `--color-accent`
 * border + tinted background. Click anywhere on the zone opens the file
 * picker.
 */

import { useRef, useState, type DragEvent } from "react";
import { CloudUpload } from "lucide-react";

import { classNames } from "@/lib/format";

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  liveStatus?: string;
}

export function DropZone({
  onFiles,
  accept = "application/pdf",
  multiple = true,
  disabled,
  liveStatus,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDragOver(ev: DragEvent<HTMLDivElement>) {
    if (disabled) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(ev: DragEvent<HTMLDivElement>) {
    if (disabled) return;
    ev.preventDefault();
    setDragOver(false);
    const files = Array.from(ev.dataTransfer.files).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (files.length) onFiles(files);
  }

  function handleClick() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function handleKeyDown(ev: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      handleClick();
    }
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label="Drop PDF files here or click to browse"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={classNames(
        "flex h-80 flex-col items-center justify-center rounded-lg px-6 text-center transition-colors",
        "cursor-pointer focus:outline-none",
        disabled
          ? "cursor-not-allowed border border-dashed border-rule bg-bg text-ink-subtle"
          : dragOver
            ? "border-2 border-solid border-accent bg-bg-subtle"
            : "border border-dashed border-rule bg-bg hover:border-rule-strong",
      )}
    >
      <CloudUpload size={28} className="text-ink-muted" aria-hidden="true" />
      <p className="mt-3 text-16 font-medium text-ink">Drop PDF files here</p>
      <p className="mt-1 text-13 text-ink-muted">or click to browse · .pdf only</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(ev) => {
          const files = ev.target.files ? Array.from(ev.target.files) : [];
          if (files.length) onFiles(files);
          ev.target.value = "";
        }}
      />
      <p className="sr-only" aria-live="polite">
        {liveStatus}
      </p>
    </div>
  );
}
