import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "@/App";

import { installFetchMock } from "./test-helpers";

async function selectFirstDocument() {
  render(<App />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Browse existing" }));
  const checkbox = await screen.findByRole("checkbox", { name: /riverbend-2026q1\.pdf/ });
  await user.click(checkbox);
  return user;
}

describe("Run Extraction", () => {
  let mock: ReturnType<typeof installFetchMock>;
  afterEach(() => {
    mock?.restore();
  });

  it("enables Run button only after a document is selected", async () => {
    mock = installFetchMock();
    await selectFirstDocument();
    const runButton = await screen.findByRole("button", { name: /Run extraction/ });
    expect(runButton).toBeEnabled();
  });

  it("sends a payload with parser_mode, section_preset, concurrency and force_reextract=false", async () => {
    mock = installFetchMock({
      extractionJob: {
        pollsBeforeFinish: 0,
        result: { results: [{ document_hash: "a".repeat(64), filename: "riverbend-2026q1.pdf", status: "succeeded", sections_extracted: 4 }] },
      },
    });
    const user = await selectFirstDocument();
    await user.click(screen.getByRole("button", { name: /Run extraction/ }));

    await waitFor(() => {
      const call = mock.calls.find((c) => c.url.endsWith("api/extraction/run") && c.method === "POST");
      expect(call).toBeDefined();
      const body = call!.body as Record<string, unknown>;
      expect(body.parser_mode).toBe("docintel-official");
      expect(body.section_preset).toBe("generic");
      expect(body.concurrency).toBe(4);
      expect(body.force_reextract).toBe(false);
      expect(body.document_hashes).toHaveLength(1);
    });
  });

  it("forwards force_reextract=true when the checkbox is ticked", async () => {
    mock = installFetchMock({
      extractionJob: { pollsBeforeFinish: 0, result: { results: [] } },
    });
    const user = await selectFirstDocument();
    await user.click(screen.getByRole("checkbox", { name: /Force re-extract/ }));
    await user.click(screen.getByRole("button", { name: /Run extraction/ }));

    await waitFor(() => {
      const call = mock.calls.find((c) => c.url.endsWith("api/extraction/run"));
      expect((call!.body as Record<string, unknown>).force_reextract).toBe(true);
    });
  });

  it("transitions to mode selection on success", async () => {
    mock = installFetchMock({
      extractionJob: {
        pollsBeforeFinish: 1,
        result: { results: [{ document_hash: "a".repeat(64), filename: "riverbend-2026q1.pdf", status: "succeeded", sections_extracted: 4 }] },
      },
    });
    const user = await selectFirstDocument();
    await user.click(screen.getByRole("button", { name: /Run extraction/ }));

    expect(
      await screen.findByRole("heading", { name: /Choose a mode/ }, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it("shows an error toast and stays on the config when the job fails", async () => {
    mock = installFetchMock({
      extractionJob: { pollsBeforeFinish: 0, failWith: "transient backend error" },
    });
    const user = await selectFirstDocument();
    await user.click(screen.getByRole("button", { name: /Run extraction/ }));

    expect(
      await screen.findByText(/Extraction failed: transient backend error/, undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
    // Still on extraction config; mode selection NOT shown.
    expect(screen.queryByRole("heading", { name: /Choose a mode/ })).not.toBeInTheDocument();
  });

  it("calls the cancel endpoint when the cancel button is clicked", async () => {
    mock = installFetchMock({
      // Multiple polls so the cancel button is visible long enough to click.
      extractionJob: { pollsBeforeFinish: 5, result: { results: [] } },
    });
    const user = await selectFirstDocument();
    await user.click(screen.getByRole("button", { name: /Run extraction/ }));

    const cancelBtn = await screen.findByRole("button", { name: "Cancel" }, { timeout: 4000 });
    await user.click(cancelBtn);

    await waitFor(() => {
      expect(
        mock.calls.find((c) => c.url.includes("/cancel") && c.method === "POST"),
      ).toBeDefined();
    });
  });
});
