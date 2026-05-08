import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { App } from "@/App";

import { installFetchMock } from "./test-helpers";

describe("Upload area", () => {
  let mock: ReturnType<typeof installFetchMock>;
  beforeEach(() => {
    mock = installFetchMock();
  });
  afterEach(() => {
    mock.restore();
  });

  it("renders the drop zone with both tabs available", async () => {
    render(<App />);
    expect(
      await screen.findByRole("button", { name: /Drop PDF files here/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Upload new" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Browse existing" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("loads the document list when switching to Browse existing", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Browse existing" }));
    await waitFor(() =>
      expect(screen.getByText("riverbend-2026q1.pdf")).toBeInTheDocument(),
    );
    expect(screen.getByText("cascadia-2026q1.pdf")).toBeInTheDocument();
  });
});
