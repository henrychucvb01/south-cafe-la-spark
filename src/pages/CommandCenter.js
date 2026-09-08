import React, { useState } from "react";
import CommandCenterLegacy from "./CommandCenterLegacy";
import SupervisorLeaderboard from "../leaderboard/SupervisorLeaderboard";
import "../leaderboard/leaderboardCommandCenter.css";

export default function CommandCenter(props) {
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  return (
    <>
      <CommandCenterLegacy
        {...props}
        leaderboardOpen={leaderboardOpen}
        onOpenLeaderboard={() => setLeaderboardOpen(true)}
      />
      {leaderboardOpen && (
        <SupervisorLeaderboard onClose={() => setLeaderboardOpen(false)} />
      )}
    </>
  );
}
