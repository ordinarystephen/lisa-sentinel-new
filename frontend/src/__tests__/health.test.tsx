import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";

import { installFetchMock } from "./test-helpers";

describe("Health context", () => {
  let mock: ReturnType<typeof installFetchMock>;
  beforeEach(() => {
    mock = installFetchMock();
  });
  afterEach(() => {
    mock.restore();
  });

  it("loads health on mount and shows the ready badge", async () => {
    render(<App />);
    expect(await screen.findByText("ready")).toBeInTheDocument();
  });

  it("shows a backend-unreachable badge when health fails", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "down" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
    ) as typeof fetch;
    render(<App />);
    expect(await screen.findByText("backend unreachable")).toBeInTheDocument();
    globalThis.fetch = original;
  });
});
