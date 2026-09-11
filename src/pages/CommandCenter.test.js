import React, { act } from "react";
import { createRoot } from "react-dom/client";
import CommandCenter from "./CommandCenter";

jest.mock("./CommandCenterLegacy", () => function MockCommandCenterLegacy() {
  return <div data-testid="command-center">Command Center</div>;
});

describe("CommandCenter", () => {
  test("renders the integrated command center", () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => root.render(<CommandCenter />));
    expect(container.querySelector('[data-testid="command-center"]')).not.toBeNull();

    act(() => root.unmount());
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });
});
