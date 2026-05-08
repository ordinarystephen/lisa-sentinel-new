/**
 * Modal dialog. Stage 2 ships the shell; Stage 3 uses it for the page
 * source-image preview.
 */

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

import { classNames } from "@/lib/format";
import { IconButton } from "./IconButton";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  widthClass?: string;
}

export function Modal({ open, onClose, title, children, widthClass = "max-w-2xl" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Dismiss dialog"
        className="absolute inset-0 bg-ink/30"
        onClick={onClose}
      />
      <div
        className={classNames(
          "relative z-10 mx-4 w-full max-h-[85vh] overflow-auto rounded-md border border-rule bg-bg shadow-md",
          widthClass,
        )}
      >
        <header className="flex items-center justify-between border-b border-rule px-5 py-3">
          <div className="text-16 font-medium text-ink">{title}</div>
          <IconButton aria-label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </header>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
