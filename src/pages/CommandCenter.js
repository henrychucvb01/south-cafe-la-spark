import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CommandCenterLegacy from "./CommandCenterLegacy";
import SupervisorLeaderboard from "../leaderboard/SupervisorLeaderboard";

export default function CommandCenter(props) {
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [navSlot, setNavSlot] = useState(null);

  useEffect(() => {
    const nav = document.querySelector(".command-nav");
    if (!nav) return undefined;

    const slot = document.createElement("div");
    slot.className = "spark-leaderboard-nav-slot";
    const exitButton = nav.querySelector(".command-nav-exit");
    if (exitButton) {
      nav.insertBefore(slot, exitButton);
    } else {
      nav.appendChild(slot);
    }
    setNavSlot(slot);

    const closeOnOtherNav = (event) => {
      const button = event.target.closest("button");
      if (button && !button.classList.contains("spark-leaderboard-nav-button")) {
        setLeaderboardOpen(false);
      }
    };
    nav.addEventListener("click", closeOnOtherNav);

    return () => {
      nav.removeEventListener("click", closeOnOtherNav);
      if (slot.parentNode) slot.parentNode.removeChild(slot);
    };
  }, []);

  return (
    <>
      <CommandCenterLegacy {...props} />

      {navSlot &&
        createPortal(
          <button
            type="button"
            className={`command-nav-button spark-leaderboard-nav-button ${leaderboardOpen ? "active" : ""}`}
            onClick={() => setLeaderboardOpen(true)}
          >
            <span>🏆</span>
            Leaderboard
          </button>,
          navSlot
        )}

      {leaderboardOpen && (
        <SupervisorLeaderboard onClose={() => setLeaderboardOpen(false)} />
      )}
    </>
  );
}
