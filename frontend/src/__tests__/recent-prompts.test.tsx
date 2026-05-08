import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";

import { installFetchMock, SINGLE_PROMPT_FIXTURE } from "./test-helpers";

async function driveToSinglePromptResults(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "Browse existing" }));
  const cb = await screen.findByRole("checkbox", { name: /riverbend-2026q1\.pdf/ });
  await user.click(cb);
  await user.click(await screen.findByRole("button", { name: /Run extraction/ }));
  await screen.findByRole("heading", { name: /Choose a mode/ }, { timeout: 4000 });
  const label = screen.getByText(/Single Prompt/i, { selector: "span" }).closest("label");
  await user.click(label!);
  await user.click(screen.getByRole("button", { name: /Continue/ }));
  const promptBox = await screen.findByPlaceholderText(/Ask a question/);
  await user.type(promptBox, "What is the senior leverage ratio?");
  await user.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText(/Q1: What is the senior leverage ratio\?/, undefined, { timeout: 4000 });
}

describe("Recent prompts + New Session", () => {
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

  it("shows the empty-state message when no prompts have been run", async () => {
    mock = installFetchMock();
    render(<App />);
    expect(
      await screen.findByText(/No prompts yet — run something to populate this list/),
    ).toBeInTheDocument();
  });

  it("New Session button at documents_selecting bypasses the confirm dialog", async () => {
    mock = installFetchMock();
    render(<App />);
    const user = userEvent.setup();
    const newSessionBtn = await screen.findByRole("button", {
      name: /New Session/,
      hidden: true,
    });
    await user.click(newSessionBtn);
    // No confirm dialog should appear.
    expect(screen.queryByText(/Start a new session\?/)).toBeNull();
  });

  it("clicking a recent-prompts entry restores its workspace state", async () => {
    mock = installFetchMock({
      extractionJob: { pollsBeforeFinish: 0, result: { results: [] } },
      singlePromptJob: { pollsBeforeFinish: 0, result: SINGLE_PROMPT_FIXTURE },
    });
    render(<App />);
    const user = userEvent.setup();
    await driveToSinglePromptResults(user);

    // Click "Change" — Stage 4 added a confirm dialog when the workspace
    // has unsaved work. Confirm to drop back to mode selection.
    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(await screen.findByRole("button", { name: "Change mode" }));
    await screen.findByRole("heading", { name: /Choose a mode/ });

    // The recent-prompts entry should still be there.
    const entries = await screen.findAllByText(/What is the senior leverage ratio/);
    // Click the entry button (the one inside RecentPrompts has a title attr).
    const restoreEntry = entries.find((el) => el.closest("button[title]"));
    expect(restoreEntry).toBeDefined();
    await user.click(restoreEntry!.closest("button[title]")!);

    // After restore, the single-prompt results should re-render.
    await screen.findByText(/Q1: What is the senior leverage ratio\?/, undefined, { timeout: 4000 });
  });

  it("New Session in the middle of work shows confirm; Cancel preserves state", async () => {
    mock = installFetchMock({
      extractionJob: { pollsBeforeFinish: 0, result: { results: [] } },
      singlePromptJob: { pollsBeforeFinish: 0, result: SINGLE_PROMPT_FIXTURE },
    });
    render(<App />);
    const user = userEvent.setup();
    await driveToSinglePromptResults(user);

    await user.click(screen.getByRole("button", { name: /New Session/, hidden: true }));
    expect(await screen.findByText(/Start a new session\?/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    // Single-prompt results still on screen.
    expect(screen.getByText(/Q1: What is the senior leverage ratio\?/)).toBeInTheDocument();
  });

  it("Confirmed New Session resets the workspace but preserves recent-prompts list", async () => {
    mock = installFetchMock({
      extractionJob: { pollsBeforeFinish: 0, result: { results: [] } },
      singlePromptJob: { pollsBeforeFinish: 0, result: SINGLE_PROMPT_FIXTURE },
    });
    render(<App />);
    const user = userEvent.setup();
    await driveToSinglePromptResults(user);

    await user.click(screen.getByRole("button", { name: /New Session/, hidden: true }));
    await user.click(screen.getByRole("button", { name: "Start new session" }));

    // Workspace is back to the documents-selecting state — no extraction config.
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /Configure extraction/ })).toBeNull();
    });

    // Recent prompts list still has the entry.
    const aside = document.querySelector("aside")!;
    expect(within(aside).getAllByText(/What is the senior leverage ratio/).length).toBeGreaterThan(0);
  });
});
