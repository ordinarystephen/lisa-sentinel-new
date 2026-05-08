/**
 * Right-rail dev panel — live wiring against `GET / PUT /api/dev/prompts`.
 *
 * Tab-switch with unsaved changes prompts a confirmation. Saving an
 * override invalidates the LangGraph cache server-side and the next run
 * picks up the new prompt automatically.
 */

import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";

import { ApiError } from "@/lib/api";
import { useDevPrompts } from "@/contexts/useDevPrompts";
import { useSession } from "@/contexts/useSession";
import type { PromptMode } from "@/lib/types";

import { Badge } from "./Badge";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { Spinner } from "./Spinner";
import { Tabs } from "./Tabs";
import { Textarea } from "./Textarea";

const MODES: { value: PromptMode; label: string }[] = [
  { value: "section_extraction", label: "Section Extraction" },
  { value: "memo_qa", label: "Memo Q&A" },
  { value: "scenario_screening", label: "Scenario Screening" },
];

export function DevPromptPanel() {
  const { data, loading, error, refresh, saveOverride, clearOverride } = useDevPrompts();
  const { pushToast } = useSession();

  const [activeMode, setActiveMode] = useState<PromptMode>("section_extraction");
  const [systemDraft, setSystemDraft] = useState("");
  const [userDraft, setUserDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingMode, setPendingMode] = useState<PromptMode | null>(null);

  const bundled = data?.prompts[activeMode];
  const overrideActive = data?.overrides_active[activeMode] ?? false;

  // why: when the snapshot or active mode changes, rehydrate the
  // textareas. Pending dirty state is tracked relative to that hydrate.
  useEffect(() => {
    if (!bundled) return;
    setSystemDraft(bundled.system);
    setUserDraft(bundled.user ?? "");
  }, [activeMode, bundled?.system, bundled?.user]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty =
    bundled !== undefined &&
    (systemDraft !== bundled.system || userDraft !== (bundled.user ?? ""));

  function attemptSwitchMode(next: PromptMode) {
    if (!dirty || next === activeMode) {
      setActiveMode(next);
      return;
    }
    setPendingMode(next);
  }

  function discardAndSwitch() {
    if (!pendingMode) return;
    const target = pendingMode;
    setPendingMode(null);
    setActiveMode(target);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveOverride(activeMode, {
        system: systemDraft,
        user: bundled?.user !== undefined ? userDraft : undefined,
      });
      pushToast(
        "Override saved · LangGraph cache invalidated · Next run uses new prompts",
        "success",
      );
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      pushToast(`Save failed: ${msg}`, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    try {
      await clearOverride(activeMode);
      pushToast("Reverted to bundled prompt", "neutral");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      pushToast(`Reset failed: ${msg}`, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-rule px-4 py-4">
        <h2 className="text-14 font-medium text-ink">Dev: Active Prompts</h2>
        <p className="mt-1 text-12 text-ink-subtle">
          Edit prompts and save to test changes. Affects all subsequent runs in
          this process. Resets when the server restarts unless saved as
          bundled.
        </p>
      </div>

      <div className="px-4 pt-3">
        <Tabs<PromptMode>
          ariaLabel="Prompt mode"
          tabs={MODES.map((m) => ({
            value: m.value,
            label: (
              <span className="inline-flex items-center gap-2">
                {m.label}
                {data?.overrides_active[m.value] ? (
                  <Badge variant="neutral">Modified</Badge>
                ) : null}
              </span>
            ),
          }))}
          value={activeMode}
          onChange={attemptSwitchMode}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {loading && !data ? (
          <div className="flex items-center gap-2 text-13 text-ink-muted">
            <Spinner size={14} /> Loading prompts…
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-md border border-error bg-bg p-3 text-13 text-error">
            <CircleAlert size={14} className="mt-0.5" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <span>Could not load prompts.</span>
              <span className="text-12 text-ink-muted">{error}</span>
              <Button variant="secondary" size="sm" onClick={() => void refresh()}>
                Retry
              </Button>
            </div>
          </div>
        ) : bundled ? (
          <>
            <Textarea
              label="System prompt"
              value={systemDraft}
              onChange={(ev) => setSystemDraft(ev.target.value)}
              rows={10}
              className="font-mono text-12"
            />
            <Textarea
              label="User prompt template"
              value={userDraft}
              onChange={(ev) => setUserDraft(ev.target.value)}
              rows={6}
              className="font-mono text-12"
              placeholder={
                bundled.user === null ? "(no user template for this mode)" : undefined
              }
              disabled={bundled.user === null}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={saving || !dirty}
              >
                {saving ? "Saving…" : "Save Override"}
              </Button>
              <Button
                variant="secondary"
                onClick={handleReset}
                disabled={saving || !overrideActive}
              >
                Reset to Bundled
              </Button>
              {dirty ? (
                <span className="ml-1 text-12 text-warn">Unsaved changes</span>
              ) : null}
              {overrideActive ? (
                <Badge variant="neutral">Override active</Badge>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={pendingMode !== null}
        title="Discard unsaved changes?"
        body={`The "${MODES.find((m) => m.value === activeMode)?.label}" tab has unsaved edits. Switching tabs will discard them.`}
        confirmLabel="Discard"
        onConfirm={discardAndSwitch}
        onCancel={() => setPendingMode(null)}
        destructive
      />
    </div>
  );
}
