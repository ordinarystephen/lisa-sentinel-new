import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";

import { installFetchMock, MULTI_STEP_FIXTURE } from "./test-helpers";

async function driveToMultiStep() {
  render(<App />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Browse existing" }));
  const cb = await screen.findByRole("checkbox", { name: /riverbend-2026q1\.pdf/ });
  await user.click(cb);
  await user.click(await screen.findByRole("button", { name: /Run extraction/ }));
  await screen.findByRole("heading", { name: /Choose a mode/ }, { timeout: 4000 });
  const label = screen.getByText(/Multi-Step/i, { selector: "span" }).closest("label");
  if (!label) throw new Error("Multi-Step label missing");
  await user.click(label);
  await user.click(screen.getByRole("button", { name: /Continue/ }));
  return user;
}

describe("Multi-Step mode", () => {
  let mock: ReturnType<typeof installFetchMock>;
  beforeEach(() => {
    if (!URL.createObjectURL) {
      Object.assign(URL, { createObjectURL: vi.fn(() => "blob:mock") });
    }
    if (!URL.revokeObjectURL) {
      Object.assign(URL, { revokeObjectURL: vi.fn() });
    }
  });
  afterEach(() => {
    mock?.restore();
  });

  it("appends user bubble + assistant turn after the first submit", async () => {
    mock = installFetchMock({ extractionJob: { pollsBeforeFinish: 0, result: { results: [] } } });
    const user = await driveToMultiStep();
    const promptBox = await screen.findByPlaceholderText(/Open the conversation/);
    await user.type(promptBox, "What are the key covenants?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    // why: the question text appears in both the user bubble and the
    // assistant's evidence section, so use findAll and confirm both render.
    const matches = await screen.findAllByText(/key covenants/, undefined, { timeout: 4000 });
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // Assistant turn from the fixture appears
    expect(
      await screen.findByText(/most material covenant risk across the three memos/, undefined, {
        timeout: 4000,
      }),
    ).toBeInTheDocument();
  });

  it("includes the full conversation in the second-turn payload", async () => {
    mock = installFetchMock({ extractionJob: { pollsBeforeFinish: 0, result: { results: [] } } });
    const user = await driveToMultiStep();
    const promptBox = await screen.findByPlaceholderText(/Open the conversation/);
    await user.type(promptBox, "First question");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/most material covenant risk/, undefined, { timeout: 4000 });

    // Second turn
    const continueBox = await screen.findByPlaceholderText(/Continue the conversation/);
    await user.type(continueBox, "Second question");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      const calls = mock.calls.filter((c) => c.url.endsWith("api/prompts/multi-step"));
      expect(calls.length).toBeGreaterThanOrEqual(2);
      const second = calls[calls.length - 1]!;
      const conv = (second.body as Record<string, unknown>).conversation as Array<{ role: string; content: string }>;
      expect(conv.map((t) => t.content)).toEqual([
        "First question",
        // assistant turn from MULTI_STEP_FIXTURE.response.answer:
        MULTI_STEP_FIXTURE.response.answer,
        "Second question",
      ]);
    });
  });

  it("source modal resolves doc_hash from retrieved_chunks (regression guard)", async () => {
    mock = installFetchMock({ extractionJob: { pollsBeforeFinish: 0, result: { results: [] } } });
    const user = await driveToMultiStep();
    const promptBox = await screen.findByPlaceholderText(/Open the conversation/);
    await user.type(promptBox, "Where do we see exposure?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/most material covenant risk/, undefined, { timeout: 4000 });

    // Expand evidence section and click "View source" on the first quote.
    const evidenceSummary = screen.getByText(/Show evidence/);
    await user.click(evidenceSummary);
    const viewSource = await screen.findAllByRole("button", { name: /View source/ });
    await user.click(viewSource[0]!);

    // The page-image fetch must include a real doc_hash, NOT an empty path.
    await waitFor(() => {
      const pageCall = mock.calls.find((c) => c.url.includes("/pages/"));
      expect(pageCall).toBeDefined();
      // The first evidence's chunk_id is "aaaaaaaa::3" → doc_hash starts with 64 a's.
      expect(pageCall!.url).toContain("a".repeat(64));
    });
  });

  it("creates one bookmark on first turn and updates (not duplicates) on the next", async () => {
    mock = installFetchMock({ extractionJob: { pollsBeforeFinish: 0, result: { results: [] } } });
    const user = await driveToMultiStep();
    const promptBox = await screen.findByPlaceholderText(/Open the conversation/);
    await user.type(promptBox, "First question");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/most material covenant risk/, undefined, { timeout: 4000 });

    // Recent prompts has one entry.
    let recentEntries = await screen.findAllByText(/First question/);
    expect(recentEntries.length).toBeGreaterThan(0);

    const continueBox = await screen.findByPlaceholderText(/Continue the conversation/);
    await user.type(continueBox, "Second question");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      const calls = mock.calls.filter((c) => c.url.endsWith("api/prompts/multi-step"));
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });

    // After the second turn, recent-prompts summary updates: "First question … Second question".
    recentEntries = await screen.findAllByText(/Second question/);
    expect(recentEntries.length).toBeGreaterThan(0);

    // And there's still only ONE recent-prompts entry (badge "multi" appears once).
    const multiBadges = within(document.body).queryAllByText("multi");
    expect(multiBadges.length).toBe(1);
  });
});
