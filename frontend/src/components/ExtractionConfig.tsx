/**
 * Step 2 — extraction configuration row.
 *
 * Three dropdowns + force-reextract checkbox + Run Extraction button.
 * Stage 3 wires the button via the Workspace component to
 * `POST /api/extraction/run` plus job polling.
 */

import { useEffect, useMemo } from "react";
import { Play } from "lucide-react";

import { useHealth } from "@/contexts/useHealth";

import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { Select, type SelectOption } from "./Select";
import { Spinner } from "./Spinner";
import { Tooltip } from "./Tooltip";

const CONCURRENCY_VALUES: { value: number; label: string }[] = [
  { value: 1, label: "1 (Sequential)" },
  { value: 2, label: "2" },
  { value: 4, label: "4 (Recommended)" },
  { value: 8, label: "8" },
];

interface ExtractionConfigProps {
  parserMode: string;
  onChangeParserMode: (value: string) => void;
  sectionPreset: string;
  onChangeSectionPreset: (value: string) => void;
  concurrency: number;
  onChangeConcurrency: (value: number) => void;
  forceReextract: boolean;
  onChangeForceReextract: (value: boolean) => void;
  selectedCount: number;
  isRunning: boolean;
  onRun: () => void;
}

export function ExtractionConfig({
  parserMode,
  onChangeParserMode,
  sectionPreset,
  onChangeSectionPreset,
  concurrency,
  onChangeConcurrency,
  forceReextract,
  onChangeForceReextract,
  selectedCount,
  isRunning,
  onRun,
}: ExtractionConfigProps) {
  const { health, presets, parsers, loading, error } = useHealth();

  const parserOptions: SelectOption<string>[] = useMemo(
    () =>
      parsers.map((p) => ({
        value: p.id,
        label: p.label,
        description: p.id,
        disabled: !p.available,
        disabledReason: p.reason,
      })),
    [parsers],
  );

  const presetOptions: SelectOption<string>[] = useMemo(
    () =>
      presets.map((p) => ({
        value: p.name,
        label:
          p.name === "generic"
            ? "Generic (auto-detect)"
            : p.name
                .split("_")
                .map((w) => w[0]!.toUpperCase() + w.slice(1))
                .join(" "),
        description:
          p.headers.length > 0
            ? p.headers.join(" · ")
            : p.description,
      })),
    [presets],
  );

  const concurrencyOptions: SelectOption<string>[] = CONCURRENCY_VALUES.map((o) => ({
    value: String(o.value),
    label: o.label,
  }));

  // why: when the parser list loads, snap to the first available option if
  // the current default is unavailable (e.g. local dev with no Azure DI).
  useEffect(() => {
    if (!parsers.length) return;
    const current = parsers.find((p) => p.id === parserMode);
    if (current && current.available) return;
    const firstAvailable = parsers.find((p) => p.available);
    if (firstAvailable && firstAvailable.id !== parserMode) {
      onChangeParserMode(firstAvailable.id);
    }
  }, [parsers, parserMode, onChangeParserMode]);

  return (
    <section aria-labelledby="extraction-config-heading" className="flex flex-col gap-4">
      <h2 id="extraction-config-heading" className="text-20 font-semibold text-ink">
        2. Configure extraction
      </h2>
      {error ? (
        <p className="text-13 text-error">
          Backend unreachable; controls populate from the live health endpoint. {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Select<string>
          label="Extraction method"
          options={parserOptions}
          value={parserMode}
          onChange={onChangeParserMode}
          placeholder={loading ? "Loading parsers…" : "Select parser"}
        />
        <Select<string>
          label="Section preset"
          options={presetOptions}
          value={sectionPreset}
          onChange={onChangeSectionPreset}
          placeholder={loading ? "Loading presets…" : "Select preset"}
        />
        <Select<string>
          label="Concurrency"
          options={concurrencyOptions}
          value={String(concurrency)}
          onChange={(v) => onChangeConcurrency(Number(v))}
          helperText="How many documents to process in parallel."
        />
      </div>
      <Tooltip content="Ignore cached extractions and process documents again. Use when prompts or schemas have changed.">
        <Checkbox
          label="Force re-extract"
          description="Skip cache and re-run extraction for every selected document."
          checked={forceReextract}
          onChange={(ev) => onChangeForceReextract(ev.target.checked)}
        />
      </Tooltip>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-12 text-ink-subtle">
          {health
            ? `Active parser at boot: ${health.active_parser} · ${health.doc_store.document_count} document(s) in store`
            : null}
        </p>
        <Button
          variant="primary"
          size="lg"
          iconLeft={isRunning || loading ? <Spinner size={14} /> : <Play size={14} />}
          disabled={loading || !!error || selectedCount === 0 || isRunning}
          onClick={onRun}
        >
          {isRunning ? "Running…" : "Run extraction"}
        </Button>
      </div>
    </section>
  );
}
