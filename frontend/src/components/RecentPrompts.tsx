/**
 * Left-rail content — "New Session" button + scrollable list of session
 * bookmarks. Each click restores the workspace to the captured state.
 */

import { Plus, Trash2 } from "lucide-react";

import { useSession } from "@/contexts/useSession";
import { formatRelativeTime, truncate } from "@/lib/format";

import { Badge } from "./Badge";
import { Button } from "./Button";
import { IconButton } from "./IconButton";

const MODE_LABELS = {
  single: "single",
  "multi-step": "multi",
  scenario: "scenario",
} as const;

interface RecentPromptsProps {
  onNewSession: () => void;
  onSelect: (id: string) => void;
}

export function RecentPrompts({ onNewSession, onSelect }: RecentPromptsProps) {
  const { prompts, removePrompt } = useSession();
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-4">
        <Button
          variant="primary"
          fullWidth
          iconLeft={<Plus size={14} />}
          onClick={onNewSession}
        >
          New Session
        </Button>
      </div>
      <div className="px-4 pb-2 pt-6">
        <h2 className="text-12 font-medium uppercase tracking-wide text-ink-subtle">
          Recent Prompts
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {prompts.length === 0 ? (
          <p className="px-2 text-13 text-ink-subtle">
            No prompts yet — run something to populate this list.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {prompts.map((p) => (
              <li key={p.id} className="group">
                <div className="relative flex items-stretch">
                  <button
                    type="button"
                    onClick={() => onSelect(p.id)}
                    className="flex w-full flex-col items-start gap-1 rounded-md px-2 py-2 pr-9 text-left transition-colors hover:bg-bg-hover"
                    title={p.summary}
                  >
                    <span className="text-14 text-ink">{truncate(p.summary, 60)}</span>
                    <span className="flex items-center gap-2 text-12 text-ink-subtle">
                      <Badge variant="neutral">{MODE_LABELS[p.mode]}</Badge>
                      <span>{formatRelativeTime(p.timestamp)}</span>
                    </span>
                  </button>
                  <IconButton
                    aria-label={`Remove "${truncate(p.summary, 40)}"`}
                    onClick={() => removePrompt(p.id)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
