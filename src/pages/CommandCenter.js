import React, { useEffect, useRef, useState } from "react";
import CommandCenterLegacy from "./CommandCenterLegacy";
import SupervisorLeaderboard from "../leaderboard/SupervisorLeaderboard";
import "../leaderboard/leaderboardCommandCenter.css";

export default function CommandCenter(props) {
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const leaderboardButtonRef = useRef(null);

  useEffect(() => {
    let nav = null;
    let button = null;
    let observer = null;

    const handleLeaderboardClick = () => {
      setLeaderboardOpen(true);
    };

    const handleNavClick = (event) => {
      const clickedButton = event.target.closest("button");
      if (
        clickedButton &&
        !clickedButton.classList.contains("spark-leaderboard-native-button")
      ) {
        setLeaderboardOpen(false);
      }
    };

    const installLeaderboardButton = () => {
      nav = document.querySelector(".command-nav");
      if (!nav) return false;

      const existing = nav.querySelector(".spark-leaderboard-native-button");
      if (existing) {
        button = existing;
        leaderboardButtonRef.current = existing;
        existing.addEventListener("click", handleLeaderboardClick);
        nav.addEventListener("click", handleNavClick);
        return true;
      }

      button = document.createElement("button");
      button.type = "button";
      button.className = "command-nav-button spark-leaderboard-native-button";
      button.innerHTML = "<span>🏆</span> Leaderboard";
      button.addEventListener("click", handleLeaderboardClick);

      const navButtons = Array.from(nav.querySelectorAll("button.command-nav-button"));
      const sparkPointsButton = navButtons.find((item) =>
        item.textContent.includes("SPARK Points")
      );
      const locationButton = navButtons.find((item) =>
        item.textContent.includes("Location Directory")
      );
      const exitButton = nav.querySelector(".command-nav-exit");

      if (sparkPointsButton && locationButton) {
        nav.insertBefore(button, locationButton);
      } else if (exitButton) {
        nav.insertBefore(button, exitButton);
      } else {
        nav.appendChild(button);
      }

      leaderboardButtonRef.current = button;
      nav.addEventListener("click", handleNavClick);
      return true;
    };

    if (!installLeaderboardButton()) {
      observer = new MutationObserver(() => {
        if (installLeaderboardButton()) {
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      if (observer) observer.disconnect();
      if (nav) nav.removeEventListener("click", handleNavClick);
      if (button) {
        button.removeEventListener("click", handleLeaderboardClick);
        if (button.parentNode) button.parentNode.removeChild(button);
      }
      leaderboardButtonRef.current = null;
    };
  }, []);

  useEffect(() => {
    const button = leaderboardButtonRef.current;
    if (!button) return;
    button.classList.toggle("active", leaderboardOpen);
  }, [leaderboardOpen]);

  return (
    <>
      <CommandCenterLegacy {...props} />
      {leaderboardOpen && (
        <SupervisorLeaderboard onClose={() => setLeaderboardOpen(false)} />
      )}
    </>
  );
}
