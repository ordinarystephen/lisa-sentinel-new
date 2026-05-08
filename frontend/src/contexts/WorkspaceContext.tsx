/**
 * Stage 3 workspace state machine.
 *
 * Tracks the user's progression from "no documents" through extraction
 * into one of three mode-specific workspaces. Mode-specific state lives
 * here too so a recent-prompts click can hydrate the workspace with one
 * setter call.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";

import { newBookmarkId } from "@/contexts/useSession";
import type {
  DocumentMetadata,
  ExtractionJobResult,
  WorkspaceState,
} from "@/lib/types";

import {
  EMPTY_MODE_STATE,
  WorkspaceContext,
  type ModeState,
  type WorkspaceContextValue,
} from "./useWorkspace";

const DEFAULT_PARSER = "docintel-official";
const DEFAULT_PRESET = "generic";
const DEFAULT_CONCURRENCY = 4;

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>("documents_selecting");
  const [selectedHashes, setSelectedHashesRaw] = useState<string[]>([]);
  const [documentsByHash, setDocumentsByHash] = useState<Record<string, DocumentMetadata>>({});
  const [parserMode, setParserMode] = useState(DEFAULT_PARSER);
  const [sectionPreset, setSectionPreset] = useState(DEFAULT_PRESET);
  const [concurrency, setConcurrency] = useState(DEFAULT_CONCURRENCY);
  const [forceReextract, setForceReextract] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionJobResult | null>(null);
  const [mode, setMode] = useState<ModeState>(EMPTY_MODE_STATE);
  const [bookmarkId, setBookmarkId] = useState<string>(() => newBookmarkId());

  const setSelectedHashes = useCallback(
    (hashes: string[]) => {
      setSelectedHashesRaw(hashes);
      setState((current) => {
        if (hashes.length === 0) return "documents_selecting";
        if (current === "documents_selecting") return "documents_selected";
        return current;
      });
    },
    [],
  );

  const registerDocuments = useCallback((docs: DocumentMetadata[]) => {
    setDocumentsByHash((prev) => {
      const next = { ...prev };
      for (const d of docs) next[d.hash] = d;
      return next;
    });
  }, []);

  const updateMode = useCallback((patch: Partial<ModeState>) => {
    setMode((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetMode = useCallback(() => {
    setMode(EMPTY_MODE_STATE);
  }, []);

  const refreshBookmarkId = useCallback(() => {
    setBookmarkId(newBookmarkId());
  }, []);

  const newSession = useCallback(() => {
    setSelectedHashesRaw([]);
    setExtractionResult(null);
    setForceReextract(false);
    setParserMode(DEFAULT_PARSER);
    setSectionPreset(DEFAULT_PRESET);
    setConcurrency(DEFAULT_CONCURRENCY);
    setMode(EMPTY_MODE_STATE);
    setState("documents_selecting");
    setBookmarkId(newBookmarkId());
    // why: documentsByHash holds metadata for every doc the user has touched
    // this session — Browse-existing fetches its own list, so we can leave
    // this populated. Clearing it would force a needless refetch.
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      state,
      setState,
      selectedHashes,
      setSelectedHashes,
      documentsByHash,
      registerDocuments,
      parserMode,
      setParserMode,
      sectionPreset,
      setSectionPreset,
      concurrency,
      setConcurrency,
      forceReextract,
      setForceReextract,
      extractionResult,
      setExtractionResult,
      mode,
      updateMode,
      resetMode,
      bookmarkId,
      setBookmarkId,
      refreshBookmarkId,
      newSession,
    }),
    [
      state,
      selectedHashes,
      setSelectedHashes,
      documentsByHash,
      registerDocuments,
      parserMode,
      sectionPreset,
      concurrency,
      forceReextract,
      extractionResult,
      mode,
      updateMode,
      resetMode,
      bookmarkId,
      refreshBookmarkId,
      newSession,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
