import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { App } from "@/App";

import { installFetchMock } from "./test-helpers";

describe("App", () => {
  let mock: ReturnType<typeof installFetchMock>;
  beforeEach(() => {
    mock = installFetchMock();
  });
  afterEach(() => {
    mock.restore();
  });

  it("renders the masthead and workspace", async () => {
    render(<App />);
    expect(screen.getByText("Lisa-Sentinel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Workspace" })).toBeInTheDocument();
    expect(await screen.findByText("ready")).toBeInTheDocument();
  });
});
