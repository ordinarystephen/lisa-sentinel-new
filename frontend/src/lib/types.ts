/**
 * Shared types matching the Stage 1 backend contract.
 *
 * Source of truth: `app/services/schemas.py` and the route handlers under
 * `app/routes/`. Keep these aligned — TypeScript will catch the drift on
 * compile, but the names should match the Python field names verbatim.
 */

export interface DocumentMetadata {
  hash: string;
  filename: string;
  size_bytes: number;
  upload_timestamp: string;
  page_count: number;
  pages_rendered: boolean;
  cached?: boolean;
  available_extractions?: string[];
}

export interface UploadResponse {
  documents: DocumentMetadata[];
  cached: string[];
}

export interface ListDocumentsResponse {
  documents: DocumentMetadata[];
}

export interface SectionPresetDescription {
  name: string;
  headers: string[];
  description: string;
}

export interface ExtractionPresetsResponse {
  presets: SectionPresetDescription[];
}

export interface HealthResponse {
  service: string;
  version: string;
  status: string;
  doc_store: {
    path: string;
    exists: boolean;
    writable: boolean;
    document_count: number;
  };
  page_rendering: "available" | "unavailable";
  parsers: Record<string, string | string[]> & {
    available_presets?: string[];
  };
  active_parser: string;
  env_present: string[];
  env_missing: string[];
  azure: {
    credential_chain: string;
    doc_intel_endpoint: string;
    openai_endpoint: string;
  };
}

export type JobStateName =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface JobState {
  job_id: string;
  state: JobStateName;
  progress?: number;
  message?: string;
  result?: unknown;
  error?: string | null;
  started_at?: number;
  finished_at?: number | null;
}

export type WorkflowMode = "single" | "multi-step" | "scenario";

export interface ParserOption {
  id: string;
  label: string;
  available: boolean;
  reason?: string;
}

export interface ConcurrencyOption {
  value: number;
  label: string;
}

// ---------------------------------------------------------------------------
// Extraction job result.
// ---------------------------------------------------------------------------

export interface ExtractionRow {
  document_hash: string;
  filename?: string;
  status: "succeeded" | "cached" | "failed";
  sections_extracted: number;
  error?: string;
}

export interface ExtractionJobResult {
  results: ExtractionRow[];
}

// ---------------------------------------------------------------------------
// Q&A response (Single Prompt rows + Multi-Step turns).
// ---------------------------------------------------------------------------

export interface EvidenceQuote {
  quote: string;
  page_reference: number | string | null;
  chunk_id?: string | null;
  relevance: string;
}

export interface RetrievedChunk {
  id: string;
  text: string;
  metadata: {
    doc_hash: string;
    index?: number;
    parser_mode?: string;
    [k: string]: unknown;
  };
}

export interface QaEnvelope {
  // why: single-prompt envelopes carry document_hash + question (set by
  // _envelope_skeleton). Multi-step envelopes do not — they're emitted by
  // _invoke_qa across multiple docs in scope. Both code paths still
  // populate retrieved_chunks, so the multi-step UI looks doc_hash up
  // there. Keep these optional so the type matches both shapes.
  document_hash?: string;
  question?: string;
  answer: string;
  answer_html: string;
  evidence: EvidenceQuote[];
  retrieved_chunks?: RetrievedChunk[];
  is_directly_answered: boolean | null;
  inference_chain: string | null;
  unanswered_aspects: string[];
  extraction_confidence: "high" | "medium" | "low" | null;
  confidence_rationale: string | null;
  error?: string;
  _validation_error?: { attempted_schema?: string; raw_response?: string; validation_errors?: unknown[] };
  _transport_error?: { type?: string; message?: string };
  _unexpected_error?: { type?: string; message?: string };
}

export interface SinglePromptJobResult {
  rows: QaEnvelope[];
}

export interface MultiStepResponse {
  response: QaEnvelope;
}

// ---------------------------------------------------------------------------
// Scenario screening.
// ---------------------------------------------------------------------------

export type RiskLevel = "High" | "Medium" | "Low" | "Insufficient Evidence";
export type EvidenceDirection = "supports_exposure" | "refutes_exposure" | "contextual";

export interface ScenarioEvidence extends EvidenceQuote {
  direction: EvidenceDirection;
}

export interface ScenarioRow {
  document_hash: string;
  filename: string;
  risk_level: RiskLevel;
  confidence: "high" | "medium" | "low" | null;
  confidence_rationale: string | null;
  summary_rationale: string;
  evidence_quotes: ScenarioEvidence[];
  retrieved_chunks?: unknown[];
  inference_chain: string | null;
  unaddressed_dimensions: string[];
  recommended_followup: string | null;
  _validation_error?: unknown;
  _transport_error?: { type?: string; message?: string };
  _unexpected_error?: { type?: string; message?: string };
}

export interface ScenarioJobResult {
  rows: ScenarioRow[];
}

// ---------------------------------------------------------------------------
// Dev prompt panel.
// ---------------------------------------------------------------------------

export type PromptMode = "section_extraction" | "memo_qa" | "scenario_screening";

export interface PromptPair {
  system: string;
  user: string | null;
}

export interface DevPromptsResponse {
  modes: PromptMode[];
  prompts: Record<PromptMode, PromptPair>;
  overrides_active: Record<PromptMode, boolean>;
}

// ---------------------------------------------------------------------------
// Recent prompts / session bookmarks.
// ---------------------------------------------------------------------------

export interface SinglePromptPayload {
  questions: string[];
  document_hashes: string[];
  parser_mode: string;
}

export interface ScenarioPayload {
  scenario_text: string;
  document_hashes: string[];
  parser_mode: string;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  envelope?: QaEnvelope;
  pending?: boolean;
  errorMessage?: string;
}

export interface MultiStepPayload {
  document_hashes: string[];
  parser_mode: string;
  conversation: ConversationTurn[];
}

export type SessionBookmark =
  | {
      id: string;
      mode: "single";
      summary: string;
      timestamp: string;
      payload: SinglePromptPayload;
      results: SinglePromptJobResult;
    }
  | {
      id: string;
      mode: "multi-step";
      summary: string;
      timestamp: string;
      payload: MultiStepPayload;
    }
  | {
      id: string;
      mode: "scenario";
      summary: string;
      timestamp: string;
      payload: ScenarioPayload;
      results: ScenarioJobResult;
    };

export type SessionPromptEntry = SessionBookmark;

// ---------------------------------------------------------------------------
// Workspace state machine.
// ---------------------------------------------------------------------------

export type WorkspaceState =
  | "documents_selecting"
  | "documents_selected"
  | "extracting"
  | "mode_selecting"
  | "single_prompt"
  | "multi_step"
  | "scenario";
