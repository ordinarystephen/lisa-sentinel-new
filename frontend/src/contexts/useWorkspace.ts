/**
 * Hook + context object + ModeState for WorkspaceProvider. Pulled out of
 * the .tsx so react-refresh can hot-reload the Provider.
 */

import { createContext, useContext } from "react";

import type {
  ConversationTurn,
  DocumentMetadata,
  ExtractionJobResult,
  ScenarioJobResult,
  SinglePromptJobResult,
  WorkspaceState,
} from "@/lib/types";

export interface ModeState {
  // Single Prompt
  singleQuestions: string;
  singleAttachedFile: { name: string; questions: string[] } | null;
  singleResults: SinglePromptJobResult | null;
  singleSubmittedQuestions: string[];

  // Multi-Step
  conversation: ConversationTurn[];

  // Scenario
  scenarioText: string;
  scenarioResults: ScenarioJobResult | null;
  scenarioSubmittedText: string;
}

export const EMPTY_MODE_STATE: ModeState = {
  singleQuestions: "",
  singleAttachedFile: null,
  singleResults: null,
  singleSubmittedQuestions: [],
  conversation: [],
  scenarioText: "",
  scenarioResults: null,
  scenarioSubmittedText: "",
};

export interface WorkspaceContextValue {
  state: WorkspaceState;
  setState: (s: WorkspaceState) => void;

  // Document selection
  selectedHashes: string[];
  setSelectedHashes: (hashes: string[]) => void;
  documentsByHash: Record<string, DocumentMetadata>;
  registerDocuments: (docs: DocumentMetadata[]) => void;

  // Extraction config
  parserMode: string;
  setParserMode: (m: string) => void;
  sectionPreset: string;
  setSectionPreset: (m: string) => void;
  concurrency: number;
  setConcurrency: (n: number) => void;
  forceReextract: boolean;
  setForceReextract: (v: boolean) => void;
  extractionResult: ExtractionJobResult | null;
  setExtractionResult: (r: ExtractionJobResult | null) => void;

  // Mode-specific state
  mode: ModeState;
  updateMode: (patch: Partial<ModeState>) => void;
  resetMode: () => void;

  // why: kept here so AppShell can restore a bookmark's id while Workspace
  // and the mode components agree on which entry to upsert.
  bookmarkId: string;
  setBookmarkId: (id: string) => void;
  refreshBookmarkId: () => void;

  // Sequence helpers
  newSession: () => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
