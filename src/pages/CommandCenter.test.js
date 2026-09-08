import React, { act } from "react";
import { createRoot } from "react-dom/client";
import CommandCenter from "./CommandCenter";

jest.mock("./CommandCenterLegacy", () => function MockCommandCenterLegacy(props) {
  return (
    <button
      type="button"
      data-testid="open-leaderboard"
      data-active={String(props.leaderboardOpen)}
      onClick={props.onOpenLeaderboard}
    >
      Leaderboard
    </button>
  );
});

jest.mock("../leaderboard/SupervisorLeaderboard", () => function MockSupervisorLeaderboard({ onClose }) {
  return (
    <div data-testid="leaderboard">
      <button type="button" data-testid="close-leaderboard" onClick={onClose}>Close</button>
    </div>
  );
});

describe("CommandCenter leaderboard entry lifecycle", () => {
  let container;
  let root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<CommandCenter />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  function click(testId) {
    act(() => {
      container.querySelector(`[data-testid="${testId}"]`).dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
  }

  test("opens on first entry and mounts again on repeated entries", () => {
    expect(container.querySelector('[data-testid="leaderboard"]')).toBeNull();

    click("open-leaderboard");
    expect(container.querySelector('[data-testid="leaderboard"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="open-leaderboard"]').dataset.active).toBe("true");

    click("close-leaderboard");
    expect(container.querySelector('[data-testid="leaderboard"]')).toBeNull();

    click("open-leaderboard");
    expect(container.querySelector('[data-testid="leaderboard"]')).not.toBeNull();
  });
});
