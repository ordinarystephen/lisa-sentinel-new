/**
 * Inline tab strip — used by the upload area to switch "Upload new" vs
 * "Browse existing", and by the dev panel's mode tabs.
 */

import type { ReactNode } from "react";

import { classNames } from "@/lib/format";

export interface TabDef<T extends string> {
  value: T;
  label: ReactNode;
  badge?: ReactNode;
}

interface TabsProps<T extends string> {
  tabs: TabDef<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}

export function Tabs<T extends string>({ tabs, value, onChange, className, ariaLabel }: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={classNames("flex items-center gap-1 border-b border-rule", className)}
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={classNames(
              "relative -mb-px inline-flex items-center gap-2 px-3 py-2 text-14 transition-colors",
              "border-b-2",
              selected
                ? "border-ink text-ink"
                : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            <span>{tab.label}</span>
            {tab.badge ? <span className="text-ink-subtle">{tab.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
