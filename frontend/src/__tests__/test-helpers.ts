import { vi } from "vitest";

import type {
  DevPromptsResponse,
  ExtractionPresetsResponse,
  HealthResponse,
  ListDocumentsResponse,
  MultiStepResponse,
  ScenarioJobResult,
  SinglePromptJobResult,
} from "@/lib/types";

import devPromptsFixture from "./fixtures/dev_prompts_state.json";
import documentsFixture from "./fixtures/documents_list.json";
import multiStepFixture from "./fixtures/multi_step_response.json";
import scenarioFixture from "./fixtures/scenario_result.json";
import singlePromptFixture from "./fixtures/single_prompt_result.json";

// ---------------------------------------------------------------------------
// Static fixtures
// ---------------------------------------------------------------------------

export const HEALTH_FIXTURE: HealthResponse = {
  service: "lisa-sentinel",
  version: "0.2.0",
  status: "ok",
  doc_store: {
    path: "/tmp/doc_store",
    exists: true,
    writable: true,
    document_count: 0,
  },
  page_rendering: "available",
  parsers: {
    "docintel-official": "available",
    "docintel-risklab": "available",
    pypdf: "available",
    "ocr-fallback": "available",
    available_presets: ["generic", "quarterly_review", "annual_review"],
  },
  active_parser: "docintel-official",
  env_present: ["AZURE_OPENAI_DEPLOYMENT", "OPENAI_API_VERSION", "AZURE_DOCINTEL_ENDPOINT"],
  env_missing: [],
  azure: {
    credential_chain: "DefaultAzureCredential",
    doc_intel_endpoint: "https://127.0.0.1:8443",
    openai_endpoint: "<set>",
  },
};

export const PRESETS_FIXTURE: ExtractionPresetsResponse = {
  presets: [
    { name: "generic", headers: [], description: "Auto-detect." },
    {
      name: "quarterly_review",
      headers: ["Borrower Overview", "Transaction Summary", "Financial Highlights"],
      description: "Bank quarterly template.",
    },
    {
      name: "annual_review",
      headers: ["Executive Summary", "Borrower Profile"],
      description: "Bank annual template.",
    },
  ],
};

export const DOCUMENTS_FIXTURE: ListDocumentsResponse =
  documentsFixture as ListDocumentsResponse;

export const SINGLE_PROMPT_FIXTURE: SinglePromptJobResult =
  singlePromptFixture as SinglePromptJobResult;

export const MULTI_STEP_FIXTURE: MultiStepResponse =
  multiStepFixture as MultiStepResponse;

export const SCENARIO_FIXTURE: ScenarioJobResult =
  scenarioFixture as ScenarioJobResult;

export const DEV_PROMPTS_FIXTURE: DevPromptsResponse =
  devPromptsFixture as DevPromptsResponse;

// ---------------------------------------------------------------------------
// Mock fetch with configurable handlers per endpoint.
// ---------------------------------------------------------------------------

export interface JobScript {
  /** Number of poll cycles before transitioning to terminal state. */
  pollsBeforeFinish?: number;
  /** Result payload when transitioning to "succeeded". */
  result?: unknown;
  /** Force the job to fail with this error after pollsBeforeFinish polls. */
  failWith?: string;
  /** Custom progress sequence (one entry per poll). Defaults to 25/75/100. */
  progress?: number[];
}

interface JobState {
  id: string;
  pollsLeft: number;
  totalPolls: number;
  script: JobScript;
}

interface FetchMockOptions {
  /** Override health response for one test. */
  health?: HealthResponse;
  /** Override documents list. */
  documents?: ListDocumentsResponse;
  /** Default extraction job script. */
  extractionJob?: JobScript;
  /** Default single-prompt job script. */
  singlePromptJob?: JobScript;
  /** Default scenario job script. */
  scenarioJob?: JobScript;
  /** Multi-step synchronous response (defaults to fixture). */
  multiStepResponse?: MultiStepResponse;
  /** Dev prompts state — mutated when PUT is called. */
  devPromptsState?: DevPromptsResponse;
  /** Page-image bytes returned by `GET /api/documents/<hash>/pages/<n>`. */
  pageImageBytes?: Uint8Array;
}

export interface FetchMock {
  restore: () => void;
  /** All fetch calls, oldest first. */
  calls: { url: string; method: string; body: unknown }[];
  /** Current dev-prompts state (mutated by PUT). */
  devPromptsState: DevPromptsResponse;
  /** Force-progress an in-flight job (rarely needed; tests usually let it run). */
  advanceJob: (jobId: string) => void;
}

const DEFAULT_PROGRESS = [25, 75, 100];

/**
 * Install a fetch mock. Returns a handle so tests can inspect call history,
 * mutate dev-prompts state, etc., and restore the original fetch on teardown.
 */
export function installFetchMock(opts: FetchMockOptions = {}): FetchMock {
  const original = globalThis.fetch;
  const calls: FetchMock["calls"] = [];
  const jobs = new Map<string, JobState>();
  const devPromptsState: DevPromptsResponse = JSON.parse(
    JSON.stringify(opts.devPromptsState ?? DEV_PROMPTS_FIXTURE),
  );

  const handle: FetchMock = {
    restore() {
      globalThis.fetch = original;
    },
    calls,
    devPromptsState,
    advanceJob(jobId) {
      const job = jobs.get(jobId);
      if (job) job.pollsLeft = 0;
    },
  };

  function startJob(script: JobScript): string {
    const id = `job-${Math.random().toString(36).slice(2, 10)}`;
    const totalPolls = Math.max(0, script.pollsBeforeFinish ?? 2);
    jobs.set(id, { id, pollsLeft: totalPolls, totalPolls, script });
    return id;
  }

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const bodyText = init?.body && typeof init.body === "string" ? init.body : null;
    const parsedBody = bodyText
      ? safeParseJson(bodyText)
      : init?.body instanceof FormData
        ? "<FormData>"
        : null;
    calls.push({ url, method, body: parsedBody });

    // Static endpoints
    if (url.endsWith("api/health")) {
      return jsonResponse(opts.health ?? HEALTH_FIXTURE);
    }
    if (url.endsWith("api/extraction/presets")) {
      return jsonResponse(PRESETS_FIXTURE);
    }
    if (url.endsWith("api/documents")) {
      return jsonResponse(opts.documents ?? DOCUMENTS_FIXTURE);
    }

    // Page image
    const pageMatch = url.match(/api\/documents\/([^/]+)\/pages\/(\d+)$/);
    if (pageMatch) {
      const bytes = opts.pageImageBytes ?? new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      const blob = new Blob([bytes as BlobPart], { type: "image/png" });
      return new Response(blob, { status: 200, headers: { "Content-Type": "image/png" } });
    }

    // Dev prompts
    if (url.endsWith("api/dev/prompts") && method === "GET") {
      return jsonResponse(devPromptsState);
    }
    if (url.endsWith("api/dev/prompts") && method === "PUT") {
      const body = parsedBody as
        | { mode: keyof DevPromptsResponse["overrides_active"]; system?: string; user?: string; clear?: boolean }
        | null;
      if (body && body.mode) {
        if (body.clear) {
          devPromptsState.overrides_active[body.mode] = false;
          // Bundled prompts unchanged.
        } else {
          devPromptsState.overrides_active[body.mode] = true;
          if (body.system !== undefined)
            devPromptsState.prompts[body.mode].system = body.system;
          if (body.user !== undefined)
            devPromptsState.prompts[body.mode].user = body.user;
        }
      }
      return jsonResponse({ ok: true });
    }

    // Job-driven endpoints
    if (url.endsWith("api/extraction/run") && method === "POST") {
      const id = startJob(opts.extractionJob ?? { result: { results: [] } });
      return jsonResponse({ job_id: id });
    }
    if (url.endsWith("api/prompts/single") && method === "POST") {
      const id = startJob(opts.singlePromptJob ?? { result: SINGLE_PROMPT_FIXTURE });
      return jsonResponse({ job_id: id });
    }
    if (url.endsWith("api/prompts/scenario") && method === "POST") {
      const id = startJob(opts.scenarioJob ?? { result: SCENARIO_FIXTURE });
      return jsonResponse({ job_id: id });
    }

    if (url.endsWith("api/prompts/multi-step") && method === "POST") {
      return jsonResponse(opts.multiStepResponse ?? MULTI_STEP_FIXTURE);
    }

    // Job status / cancel
    const statusMatch = url.match(/api\/jobs\/([^/]+)\/status$/);
    if (statusMatch && method === "GET") {
      const jobId = statusMatch[1]!;
      const job = jobs.get(jobId);
      if (!job) {
        return jsonResponse({ error: "not_found", job_id: jobId }, 404);
      }
      const doneIndex = job.totalPolls - job.pollsLeft;
      const progressSeq = job.script.progress ?? DEFAULT_PROGRESS;
      const progress = progressSeq[Math.min(doneIndex, progressSeq.length - 1)] ?? 0;
      if (job.pollsLeft > 0) {
        job.pollsLeft -= 1;
        return jsonResponse({
          job_id: jobId,
          state: doneIndex === 0 ? "queued" : "running",
          progress,
          message: `step ${doneIndex + 1}/${job.totalPolls + 1}`,
          result: null,
          error: null,
          started_at: 0,
          finished_at: null,
        });
      }
      // Terminal poll
      if (job.script.failWith) {
        return jsonResponse({
          job_id: jobId,
          state: "failed",
          progress,
          message: "failed",
          result: null,
          error: job.script.failWith,
          started_at: 0,
          finished_at: 1,
        });
      }
      return jsonResponse({
        job_id: jobId,
        state: "succeeded",
        progress: 100,
        message: "complete",
        result: job.script.result ?? null,
        error: null,
        started_at: 0,
        finished_at: 1,
      });
    }

    const cancelMatch = url.match(/api\/jobs\/([^/]+)\/cancel$/);
    if (cancelMatch && method === "POST") {
      const jobId = cancelMatch[1]!;
      const job = jobs.get(jobId);
      if (job) job.pollsLeft = 0;
      return jsonResponse({ cancelled: true, job_id: jobId });
    }

    // Upload (multipart) — return one document for the file.
    if (url.endsWith("api/documents/upload") && method === "POST") {
      const synthetic = {
        documents: [
          {
            hash: "0".repeat(64),
            filename: "uploaded.pdf",
            size_bytes: 1000,
            upload_timestamp: new Date().toISOString(),
            page_count: 4,
            pages_rendered: true,
          },
        ],
        cached: [],
      };
      return jsonResponse(synthetic);
    }

    return jsonResponse({ error: "not_mocked", url, method }, 404);
  }) as typeof fetch;

  return handle;
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Some tests need to wait for the polling helper in `lib/api.ts` to finish.
 * It polls every 1000ms by default; in tests we accept that latency unless
 * we patch it. Vitest `vi.useFakeTimers` lets you advance instantly, but
 * many of our flows use multiple awaits + microtasks between polls, which
 * makes fake-timer juggling fragile. Real timers + small `pollsBeforeFinish`
 * is the cleaner default; default is 2 polls = ~2 s per job.
 */
export const POLL_INTERVAL_NOTE = "Default scripts use 2 polls. Don't fake timers unless you have to.";
