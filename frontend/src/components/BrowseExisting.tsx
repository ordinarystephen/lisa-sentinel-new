/**
 * Browse-existing tab content — shows every document currently in the
 * doc store, lets the user check which ones to add to the working set.
 */

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { apiGet, ApiError } from "@/lib/api";
import type { DocumentMetadata, ListDocumentsResponse } from "@/lib/types";
import { formatBytes, formatRelativeTime } from "@/lib/format";

import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { Input } from "./Input";
import { Spinner } from "./Spinner";

interface BrowseExistingProps {
  selectedHashes: string[];
  onChangeSelection: (hashes: string[]) => void;
}

export function BrowseExisting({ selectedHashes, onChangeSelection }: BrowseExistingProps) {
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const r = await apiGet<ListDocumentsResponse>("documents");
        if (!cancelled) setDocuments(r.documents ?? []);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof ApiError ? err.message : String(err);
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => d.filename.toLowerCase().includes(q) || d.hash.includes(q));
  }, [documents, filter]);

  const allSelected = filtered.length > 0 && filtered.every((d) => selectedHashes.includes(d.hash));

  function toggle(hash: string) {
    if (selectedHashes.includes(hash)) {
      onChangeSelection(selectedHashes.filter((h) => h !== hash));
    } else {
      onChangeSelection([...selectedHashes, hash]);
    }
  }

  function selectAllVisible() {
    const next = new Set(selectedHashes);
    for (const d of filtered) next.add(d.hash);
    onChangeSelection(Array.from(next));
  }

  function clearAll() {
    onChangeSelection([]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Input
            placeholder="Filter by filename or hash…"
            value={filter}
            onChange={(ev) => setFilter(ev.target.value)}
            aria-label="Filter stored documents"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={selectAllVisible} disabled={!filtered.length}>
          Select visible
        </Button>
        <Button variant="ghost" size="sm" onClick={clearAll} disabled={!selectedHashes.length}>
          Clear
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-14 text-ink-muted">
          <Spinner /> Loading documents…
        </div>
      ) : error ? (
        <div className="rounded-md border border-error bg-bg px-4 py-3 text-14 text-error">
          <p className="m-0">Could not load stored documents.</p>
          <p className="mt-1 text-12">{error}</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-md border border-dashed border-rule px-4 py-6 text-center">
          <p className="m-0 text-14 text-ink-muted">No documents stored yet.</p>
          <p className="mt-1 text-12 text-ink-subtle">
            Upload PDFs from the "Upload new" tab to populate the library.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-rule">
          <div className="flex items-center gap-3 border-b border-rule bg-bg-subtle px-4 py-2 text-12 uppercase tracking-wide text-ink-muted">
            <span className="w-6 flex-shrink-0">
              <Checkbox
                aria-label="Select all visible"
                checked={allSelected}
                onChange={() => (allSelected ? clearAll() : selectAllVisible())}
              />
            </span>
            <span className="flex-1">Filename</span>
            <span className="w-24 text-right">Pages</span>
            <span className="w-32 text-right">Size</span>
            <span className="w-32 text-right">Uploaded</span>
            <span className="hidden w-24 truncate font-mono text-12 text-ink-subtle md:inline">
              <Search size={12} className="inline" aria-hidden="true" /> hash
            </span>
          </div>
          <ul className="divide-y divide-rule">
            {filtered.map((d) => {
              const checked = selectedHashes.includes(d.hash);
              return (
                <li
                  key={d.hash}
                  className="flex items-center gap-3 px-4 py-3 text-14 transition-colors hover:bg-bg-hover"
                >
                  <span className="w-6 flex-shrink-0">
                    <Checkbox
                      aria-label={`Select ${d.filename}`}
                      checked={checked}
                      onChange={() => toggle(d.hash)}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink">{d.filename}</span>
                  <span className="w-24 text-right text-ink-muted">{d.page_count}</span>
                  <span className="w-32 text-right text-ink-muted">{formatBytes(d.size_bytes)}</span>
                  <span className="w-32 text-right text-ink-muted">
                    {formatRelativeTime(d.upload_timestamp)}
                  </span>
                  <span className="hidden w-24 truncate font-mono text-12 text-ink-subtle md:inline">
                    {d.hash.slice(0, 10)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
