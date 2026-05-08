/**
 * Bottom-right toast stack — pulls from the SessionContext.
 */

import { useSession } from "@/contexts/useSession";
import { classNames } from "@/lib/format";

const TONE_CLASSES = {
  neutral: "border-rule",
  success: "border-success",
  warn: "border-warn",
  error: "border-error",
} as const;

export function ToastStack() {
  const { toasts, dismissToast } = useSession();
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={classNames(
            "pointer-events-auto rounded-md border bg-bg px-4 py-3 text-14 text-ink shadow-md",
            TONE_CLASSES[t.tone],
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="m-0">{t.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="text-12 text-ink-subtle hover:text-ink"
              aria-label="Dismiss notification"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
