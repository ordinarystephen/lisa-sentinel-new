import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "@/App";

import { installFetchMock } from "./test-helpers";

async function openDevPanel() {
  render(<App />);
  const user = userEvent.setup();
  // Toggle the right rail open.
  await user.click(screen.getByRole("button", { name: /Show dev panel/ }));
  return user;
}

describe("Dev Prompt Panel", () => {
  let mock: ReturnType<typeof installFetchMock>;
  afterEach(() => {
    mock?.restore();
  });

  it("loads dev prompts on mount and populates the system textarea", async () => {
    mock = installFetchMock();
    await openDevPanel();
    await waitFor(() => {
      const get = mock.calls.find((c) => c.url.endsWith("api/dev/prompts") && c.method === "GET");
      expect(get).toBeDefined();
    });
    const systemTextarea = await screen.findByLabelText(/System prompt/);
    expect((systemTextarea as HTMLTextAreaElement).value).toMatch(/extraction agent/);
  });

  it("switching tabs loads that mode's prompts", async () => {
    mock = installFetchMock();
    const user = await openDevPanel();
    await screen.findByLabelText(/System prompt/);
    await user.click(screen.getByRole("tab", { name: /Memo Q&A/ }));
    await waitFor(() => {
      const sys = screen.getByLabelText(/System prompt/) as HTMLTextAreaElement;
      expect(sys.value).toMatch(/memo-QA agent/);
    });
  });

  it("editing a textarea sets the dirty state and enables Save", async () => {
    mock = installFetchMock();
    const user = await openDevPanel();
    const sys = (await screen.findByLabelText(/System prompt/)) as HTMLTextAreaElement;
    const save = screen.getByRole("button", { name: /Save Override/ });
    expect(save).toBeDisabled();
    await user.type(sys, " // edit");
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    expect(save).toBeEnabled();
  });

  it("saving an override calls PUT and shows the success toast", async () => {
    mock = installFetchMock();
    const user = await openDevPanel();
    const sys = (await screen.findByLabelText(/System prompt/)) as HTMLTextAreaElement;
    await user.type(sys, " // edit");
    await user.click(screen.getByRole("button", { name: /Save Override/ }));

    await waitFor(() => {
      const put = mock.calls.find((c) => c.url.endsWith("api/dev/prompts") && c.method === "PUT");
      expect(put).toBeDefined();
      const body = put!.body as Record<string, unknown>;
      expect(body.mode).toBe("section_extraction");
      expect(typeof body.system).toBe("string");
    });
    expect(
      await screen.findByText(/Override saved · LangGraph cache invalidated/, undefined, {
        timeout: 4000,
      }),
    ).toBeInTheDocument();
  });

  it("Reset to Bundled is disabled until an override exists, then clears it", async () => {
    mock = installFetchMock();
    const user = await openDevPanel();
    const sys = (await screen.findByLabelText(/System prompt/)) as HTMLTextAreaElement;
    const reset = screen.getByRole("button", { name: /Reset to Bundled/ });
    expect(reset).toBeDisabled();

    await user.type(sys, " // edit");
    await user.click(screen.getByRole("button", { name: /Save Override/ }));
    await screen.findByText(/Override saved/, undefined, { timeout: 4000 });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Reset to Bundled/ })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: /Reset to Bundled/ }));
    await waitFor(() => {
      const put = mock.calls.filter((c) => c.url.endsWith("api/dev/prompts") && c.method === "PUT");
      const lastBody = put[put.length - 1]!.body as Record<string, unknown>;
      expect(lastBody.clear).toBe(true);
    });
    expect(
      await screen.findByText(/Reverted to bundled prompt/, undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it("after save, the tab shows a Modified badge", async () => {
    mock = installFetchMock();
    const user = await openDevPanel();
    const sys = (await screen.findByLabelText(/System prompt/)) as HTMLTextAreaElement;
    await user.type(sys, " // edit");
    await user.click(screen.getByRole("button", { name: /Save Override/ }));
    const tab = await screen.findByRole("tab", { name: /Section Extraction/ });
    await waitFor(() => {
      expect(within(tab).getByText("Modified")).toBeInTheDocument();
    });
  });

  it("switching tabs while dirty opens a confirm dialog; Cancel preserves the edit", async () => {
    mock = installFetchMock();
    const user = await openDevPanel();
    const sys = (await screen.findByLabelText(/System prompt/)) as HTMLTextAreaElement;
    await user.type(sys, " // edit");
    await user.click(screen.getByRole("tab", { name: /Memo Q&A/ }));
    expect(await screen.findByText(/Discard unsaved changes\?/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    // Dialog gone, draft preserved.
    expect(screen.queryByText(/Discard unsaved changes\?/)).toBeNull();
    expect((screen.getByLabelText(/System prompt/) as HTMLTextAreaElement).value).toMatch(/edit/);
  });

  it("Discard in confirm dialog actually switches tabs and resets drafts", async () => {
    mock = installFetchMock();
    const user = await openDevPanel();
    const sys = (await screen.findByLabelText(/System prompt/)) as HTMLTextAreaElement;
    await user.type(sys, " // edit");
    await user.click(screen.getByRole("tab", { name: /Memo Q&A/ }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => {
      const newSys = screen.getByLabelText(/System prompt/) as HTMLTextAreaElement;
      expect(newSys.value).toMatch(/memo-QA agent/);
      expect(newSys.value).not.toMatch(/edit/);
    });
  });
});
