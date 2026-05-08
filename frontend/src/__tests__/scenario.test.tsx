import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";

import { installFetchMock, SCENARIO_FIXTURE } from "./test-helpers";

async function driveToScenario() {
  render(<App />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Browse existing" }));
  const cb = await screen.findByRole("checkbox", { name: /riverbend-2026q1\.pdf/ });
  await user.click(cb);
  await user.click(await screen.findByRole("button", { name: /Run extraction/ }));
  await screen.findByRole("heading", { name: /Choose a mode/ }, { timeout: 4000 });
  const label = screen.getByText(/Scenario Analysis/i, { selector: "span" }).closest("label");
  if (!label) throw new Error("Scenario label missing");
  await user.click(label);
  await user.click(screen.getByRole("button", { name: /Continue/ }));
  return user;
}

describe("Scenario mode", () => {
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

  it("submits scenario_text and document_hashes", async () => {
    mock = installFetchMock({
      extractionJob: { pollsBeforeFinish: 0, result: { results: [] } },
      scenarioJob: { pollsBeforeFinish: 0, result: SCENARIO_FIXTURE },
    });
    const user = await driveToScenario();
    const promptBox = await screen.findByPlaceholderText(/Describe the scenario/);
    await user.type(promptBox, "SOFR +200bps stress test");
    await user.click(screen.getByRole("button", { name: /Run scenario/ }));

    await waitFor(() => {
      const call = mock.calls.find((c) => c.url.endsWith("api/prompts/scenario"));
      expect(call).toBeDefined();
      const body = call!.body as Record<string, unknown>;
      expect(body.scenario_text).toBe("SOFR +200bps stress test");
      expect((body.document_hashes as string[]).length).toBe(1);
    });
  });

  it("renders rows with risk-level badges", async () => {
    mock = installFetchMock({
      extractionJob: { pollsBeforeFinish: 0, result: { results: [] } },
      scenarioJob: { pollsBeforeFinish: 0, result: SCENARIO_FIXTURE },
    });
    const user = await driveToScenario();
    await user.type(
      await screen.findByPlaceholderText(/Describe the scenario/),
      "SOFR +200bps stress test",
    );
    await user.click(screen.getByRole("button", { name: /Run scenario/ }));

    await screen.findByRole("heading", { name: /Scenario results/ }, { timeout: 4000 });
    expect(screen.getAllByText(/^High$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Medium$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Low$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Insufficient Evidence/).length).toBeGreaterThan(0);
  });

  it("filter chip narrows the visible rows", async () => {
    mock = installFetchMock({
      extractionJob: { pollsBeforeFinish: 0, result: { results: [] } },
      scenarioJob: { pollsBeforeFinish: 0, result: SCENARIO_FIXTURE },
    });
    const user = await driveToScenario();
    await user.type(
      await screen.findByPlaceholderText(/Describe the scenario/),
      "SOFR +200bps stress test",
    );
    await user.click(screen.getByRole("button", { name: /Run scenario/ }));
    await screen.findByRole("heading", { name: /Scenario results/ }, { timeout: 4000 });

    // Click the High filter chip — only the high-risk row should remain.
    const chip = screen.getByRole("button", { name: /^High 1$/ });
    await user.click(chip);

    const table = screen.getByRole("table");
    expect(within(table).getByText(/riverbend-2026q1\.pdf/)).toBeInTheDocument();
    expect(within(table).queryByText(/cascadia-2026q1\.pdf/)).toBeNull();
  });

  it("View detail expands the inline detail panel with evidence + reasoning", async () => {
    mock = installFetchMock({
      extractionJob: { pollsBeforeFinish: 0, result: { results: [] } },
      scenarioJob: { pollsBeforeFinish: 0, result: SCENARIO_FIXTURE },
    });
    const user = await driveToScenario();
    await user.type(
      await screen.findByPlaceholderText(/Describe the scenario/),
      "SOFR +200bps stress test",
    );
    await user.click(screen.getByRole("button", { name: /Run scenario/ }));
    await screen.findByRole("heading", { name: /Scenario results/ }, { timeout: 4000 });

    const detailButtons = screen.getAllByRole("button", { name: "View detail" });
    await user.click(detailButtons[0]!);
    // why: the Evidence label appears both in the column header and the
    // detail-panel label, so allow any match. Reasoning / Limitations /
    // Recommended follow-up are unique to the detail panel.
    expect((await screen.findAllByText(/^Evidence$/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/^Reasoning$/)).toBeInTheDocument();
    expect(screen.getByText(/Limitations \/ not addressed/)).toBeInTheDocument();
    expect(screen.getByText(/Recommended follow-up/)).toBeInTheDocument();
  });

  it("populates scenario history and creates a recent-prompts entry", async () => {
    mock = installFetchMock({
      extractionJob: { pollsBeforeFinish: 0, result: { results: [] } },
      scenarioJob: { pollsBeforeFinish: 0, result: SCENARIO_FIXTURE },
    });
    const user = await driveToScenario();
    await user.type(
      await screen.findByPlaceholderText(/Describe the scenario/),
      "SOFR +200bps stress test",
    );
    await user.click(screen.getByRole("button", { name: /Run scenario/ }));
    await screen.findByRole("heading", { name: /Scenario results/ }, { timeout: 4000 });

    // Scenario history menu has the entry.
    expect(screen.getByText(/Previous scenario analyses/)).toBeInTheDocument();
    // Recent prompts has the scenario summary text (truncated to 60 chars).
    const recentMatches = await screen.findAllByText(/SOFR \+200bps stress test/);
    expect(recentMatches.length).toBeGreaterThan(0);
  });

  it("Load this scenario rehydrates the prompt box", async () => {
    mock = installFetchMock({
      extractionJob: { pollsBeforeFinish: 0, result: { results: [] } },
      scenarioJob: { pollsBeforeFinish: 0, result: SCENARIO_FIXTURE },
    });
    const user = await driveToScenario();
    const promptBox = await screen.findByPlaceholderText(/Describe the scenario/);
    await user.type(promptBox, "SOFR +200bps stress test");
    await user.click(screen.getByRole("button", { name: /Run scenario/ }));
    await screen.findByRole("heading", { name: /Scenario results/ }, { timeout: 4000 });

    // Clear the textarea, then expand the history entry and load.
    await user.clear(promptBox);
    expect((promptBox as HTMLTextAreaElement).value).toBe("");

    await user.click(screen.getByRole("button", { name: /Expand scenario/ }));
    await user.click(screen.getByRole("button", { name: /Load this scenario/ }));
    await waitFor(() =>
      expect((promptBox as HTMLTextAreaElement).value).toBe("SOFR +200bps stress test"),
    );
  });
});
