/**
 * Thin fetch wrapper. Every path is RELATIVE so the SPA survives Domino's
 * `/proxy/<port>/` prefix and the Vite dev proxy in local dev.
 */

import type { JobState } from "./types";

const API_BASE = "api";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(message: string, status: number, detail = "") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function joinPath(path: string): string {
  // why: callers pass things like "documents/upload" or "/documents/upload";
  // strip a leading slash and prepend the relative base.
  const trimmed = path.replace(/^\/+/, "");
  return `${API_BASE}/${trimmed}`;
}

async function toApiError(res: Response): Promise<ApiError> {
  let detail = "";
  let message = `Request failed (${res.status})`;
  try {
    const cloned = res.clone();
    const body = await cloned.json();
    if (typeof body === "object" && body) {
      const candidate =
        (body as { message?: string }).message ??
        (body as { error?: string }).error;
      if (candidate) message = `${candidate} (${res.status})`;
      detail = JSON.stringify(body, null, 2);
    }
  } catch {
    try {
      detail = await res.text();
    } catch {
      detail = "";
    }
  }
  return new ApiError(message, res.status, detail);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(joinPath(path), {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(joinPath(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    body: body === undefined ? null : JSON.stringify(body),
  });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

export async function apiPostMultipart<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const res = await fetch(joinPath(path), {
    method: "POST",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    body: formData,
  });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(joinPath(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    body: body === undefined ? null : JSON.stringify(body),
  });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

// why: vitest sets `process.env.VITEST` to "true", so we can shrink the
// poll interval without forcing every test to fake-timer the polling loop.
const POLL_INTERVAL_MS =
  typeof process !== "undefined" && process.env?.VITEST === "true" ? 5 : 1000;

/**
 * Poll `GET /api/jobs/<id>/status` until the job finishes.
 *
 * Resolves with `state.result` on success. Rejects with an ApiError on
 * failure or cancellation. The optional onProgress callback fires on
 * every poll.
 */
export async function pollJob<T>(
  jobId: string,
  onProgress?: (state: JobState) => void,
): Promise<T> {
  // why: a tight `while(true)` keeps logic linear vs. recursive setTimeout.
  // The frontend doesn't need cancellation here — Stage 3 builds that.
  while (true) {
    const state = await apiGet<JobState>(`jobs/${jobId}/status`);
    onProgress?.(state);
    if (state.state === "succeeded") {
      return state.result as T;
    }
    if (state.state === "failed") {
      throw new ApiError(state.error || "Job failed", 0);
    }
    if (state.state === "cancelled") {
      throw new ApiError("Job cancelled", 0);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
