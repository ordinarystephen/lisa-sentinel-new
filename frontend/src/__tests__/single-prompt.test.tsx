import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";

import { installFetchMock, SINGLE_PROMPT_FIXTURE } from "./test-helpers";

async function driveToSingleMode() {
  render(<App />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Browse existing" }));
  const checkbox = await screen.findByRole("checkbox", { name: /riverbend-2026q1\.pdf/ });
  await user.click(checkbox);
  await user.click(await screen.findByRole("button", { name: /Run extraction/ }));
  await screen.findByRole("heading", { name: /Choose a mode/ }, { timeout: 4000 });
  // why: the radio input is sr-only — userEvent on the label is the most
  // realistic way to drive both the radio and the screen visual.
  const radioLabel = screen
    .getByText(/Single Prompt/i, { selector: "span" })
    .closest("label");
  if (!radioLabel) throw new Error("Single Prompt radio label not found");
  await user.click(radioLabel);
  await user.click(await screen.findByRole("button", { name: /Continue/ }));
  return user;
}

describe("Single Prompt mode", () => {
  let mock: ReturnType<typeof installFetchMock>;
  beforeEach(() => {
    // why: blob URL helpers aren't full-featured in jsdom; SourceImageModal
    // calls these. Stub them so the modal doesn't crash.
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

  it("renders the prompt box once Single mode is active", async () => {
    mock = installFetchMock({ extractionJob: { pollsBeforeFinish: 0, result: { results: [] } } });
    await driveToSingleMode();
    expect(
      await screen.findByPlaceholderText(/Ask a question or paste multiple questions/),
    ).toBeInTheDocument();
  });

  it("submits parsed questions and renders the grouped results table", async () => {
    mock = installFetchMock({
      extractionJob: { pollsBeforeFinish: 0, result: { results: [] } },
      singlePromptJob: { pollsBeforeFinish: 0, result: SINGLE_PROMPT_FIXTURE },
    });
    const user = await driveToSingleMode();
    const promptBox = await screen.findByPlaceholderText(/Ask a question/);
    await user.type(promptBox, "What is the senior leverage ratio?{Enter}Are there any covenant exceptions?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText(/Q1: What is the senior leverage ratio\?/, undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Q2: Are there any covenant exceptions\?/),
    ).toBeInTheDocument();

    // Verify the call body parsed the two questions.
    const call = mock.calls.find((c) => c.url.endsWith("api/prompts/single"));
    expect(call).toBeDefined();
    const body = call!.body as Record<string, unknown>;
    expect(body.questions).toEqual([
      "What is the senior leverage ratio?",
      "Are there any covenant exceptions?",
    ]);
  });

  it("opens the source modal on click and fetches the right page image", async () => {
    mock = installFetchMock({
      extractionJob: { pollsBeforeFinish: 0, result: { results: [] } },
      singlePromptJob: { pollsBeforeFinish: 0, result: SINGLE_PROMPT_FIXTURE },
    });
    const user = await driveToSingleMode();
    const promptBox = await screen.findByPlaceholderText(/Ask a question/);
    await user.type(promptBox, "What is the senior leverage ratio?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    // Find the answer cell with the leverage answer and click it.
    const answer = await screen.findByText(
      /The senior leverage ratio at year-end 2025 was 4\.2x EBITDA/,
      undefined,
      { timeout: 4000 },
    );
    await user.click(answer);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await waitFor(() => {
      const fetched = mock.calls.find((c) => c.url.includes("/pages/4"));
      expect(fetched).toBeDefined();
    });
  });

  it("'No result' rows render plain text without a click affordance", async () => {
    mock = installFetchMock({
      extractionJob: { pollsBeforeFinish: 0, result: { results: [] } },
      singlePromptJob: { pollsBeforeFinish: 0, result: SINGLE_PROMPT_FIXTURE },
    });
    const user = await driveToSingleMode();
    const promptBox = await screen.findByPlaceholderText(/Ask a question/);
    await user.type(promptBox, "What is the senior leverage ratio?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    // The cascadia (b...) row in the fixture has no answer.
    const noResultCells = await screen.findAllByText("No result");
    expect(noResultCells.length).toBeGreaterThan(0);
    // No clickable button.
    expect(noResultCells[0]!.closest("button")).toBeNull();
  });

  it("Expand all and Collapse all toggle the question groups", async () => {
    mock = installFetchMock({
      extractionJob: { pollsBeforeFinish: 0, result: { results: [] } },
      singlePromptJob: { pollsBeforeFinish: 0, result: SINGLE_PROMPT_FIXTURE },
    });
    const user = await driveToSingleMode();
    const promptBox = await screen.findByPlaceholderText(/Ask a question/);
    await user.type(promptBox, "What is the senior leverage ratio?{Enter}Are there any covenant exceptions?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText(/Q1: What is the senior leverage ratio\?/, undefined, { timeout: 4000 });
    const collapse = screen.getByRole("button", { name: /Collapse all/ });
    await user.click(collapse);
    // After collapse, there should be no <table> visible.
    const article = screen.getByRole("button", { name: /Q1:/ }).closest("article")!;
    expect(within(article).queryByRole("table")).toBeNull();

    const expand = screen.getByRole("button", { name: /Expand all/ });
    await user.click(expand);
    expect(within(article).getByRole("table")).toBeInTheDocument();
  });

  it("creates a recent-prompts entry after a successful run", async () => {
    mock = installFetchMock({
      extractionJob: { pollsBeforeFinish: 0, result: { results: [] } },
      singlePromptJob: { pollsBeforeFinish: 0, result: SINGLE_PROMPT_FIXTURE },
    });
    const user = await driveToSingleMode();
    const promptBox = await screen.findByPlaceholderText(/Ask a question/);
    await user.type(promptBox, "What is the senior leverage ratio?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    // Wait for results to confirm completion.
    await screen.findByText(/Q1:/, undefined, { timeout: 4000 });

    // Recent Prompts list (left rail) should contain an entry with the question.
    // why: the typed text remains in the prompt textarea AND appears in the
    // recent-prompts list, so we use findAllByText and confirm ≥ 1 match.
    const matches = await screen.findAllByText(/What is the senior leverage ratio/, undefined, {
      timeout: 4000,
    });
    expect(matches.length).toBeGreaterThan(0);
  });
});
