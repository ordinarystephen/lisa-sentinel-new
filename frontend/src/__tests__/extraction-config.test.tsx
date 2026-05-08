import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { App } from "@/App";

import { installFetchMock } from "./test-helpers";

describe("Extraction config", () => {
  let mock: ReturnType<typeof installFetchMock>;
  beforeEach(() => {
    mock = installFetchMock();
  });
  afterEach(() => {
    mock.restore();
  });

  it("appears with three populated dropdowns once a document is selected", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Browse existing" }));
    const checkbox = await screen.findByRole("checkbox", {
      name: /riverbend-2026q1\.pdf/,
    });
    await user.click(checkbox);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "2. Configure extraction" }),
      ).toBeInTheDocument(),
    );

    expect(screen.getByText("Extraction method")).toBeInTheDocument();
    expect(screen.getByText("Section preset")).toBeInTheDocument();
    expect(screen.getByText("Concurrency")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run extraction/ })).toBeEnabled();
  });

  it("mode selection is gated behind extraction — not visible after only a doc selection", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Browse existing" }));
    const checkbox = await screen.findByRole("checkbox", {
      name: /riverbend-2026q1\.pdf/,
    });
    await user.click(checkbox);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "2. Configure extraction" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("heading", { name: "3. Choose a mode" }),
    ).not.toBeInTheDocument();
  });
});
