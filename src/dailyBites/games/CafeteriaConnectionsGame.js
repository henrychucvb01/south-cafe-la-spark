import React, { useEffect, useMemo, useState } from "react";
import { scoreSparkSort, seededShuffle } from "./gameUtils";

export default function CafeteriaConnectionsGame({
  puzzle,
  progress,
  streak,
  disabled,
  onSave,
  onComplete,
}) {
  const [selected, setSelected] = useState([]);
  const [solvedGroupIds, setSolvedGroupIds] = useState([]);
  const [mistakes, setMistakes] = useState(0);
  const [status, setStatus] = useState("in_progress");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const groups = useMemo(
    () => puzzle.groups.map((group, index) => ({ ...group, id: `${puzzle.id}-group-${index}` })),
    [puzzle]
  );
  const shuffledItems = useMemo(
    () => seededShuffle(groups.flatMap((group) => group.items), puzzle.puzzleId),
    [groups, puzzle.puzzleId]
  );

  useEffect(() => {
    setSolvedGroupIds(Array.isArray(progress?.state?.solvedGroupIds) ? progress.state.solvedGroupIds : []);
    setMistakes(Number(progress?.state?.mistakes) || 0);
    setStatus(progress?.status || "in_progress");
    setSelected([]);
    setMessage("");
  }, [puzzle?.puzzleId, progress]);

  const solvedItemSet = new Set(
    groups.filter((group) => solvedGroupIds.includes(group.id)).flatMap((group) => group.items)
  );
  const remainingItems = shuffledItems.filter((item) => !solvedItemSet.has(item));
  const chancesRemaining = Math.max(0, 5 - mistakes);

  function toggleItem(item) {
    if (disabled || saving || status !== "in_progress") return;
    setSelected((current) => {
      if (current.includes(item)) return current.filter((value) => value !== item);
      return current.length < 4 ? [...current, item] : current;
    });
  }

  async function submitGroup() {
    if (selected.length !== 4 || disabled || saving || status !== "in_progress") return;
    const selectedSet = new Set(selected);
    const match = groups.find(
      (group) => !solvedGroupIds.includes(group.id) && group.items.every((item) => selectedSet.has(item))
    );

    setSaving(true);
    if (match) {
      const nextSolved = [...solvedGroupIds, match.id];
      const won = nextSolved.length === 4;
      const nextState = { solvedGroupIds: nextSolved, mistakes };
      const success = won
        ? await onComplete({
            status: "won",
            state: nextState,
            attemptCount: mistakes,
            points: scoreSparkSort(chancesRemaining),
          })
        : await onSave({ status: "in_progress", state: nextState, attemptCount: mistakes });
      if (success) {
        setSolvedGroupIds(nextSolved);
        setSelected([]);
        setStatus(won ? "won" : "in_progress");
        setMessage(won ? `SPARK Sort complete with ${chancesRemaining} chances remaining!` : `Correct: ${match.category}`);
      }
    } else {
      const nextMistakes = mistakes + 1;
      const lost = nextMistakes >= 5;
      const oneAway = groups.some((group) => {
        if (solvedGroupIds.includes(group.id)) return false;
        return group.items.filter((item) => selectedSet.has(item)).length === 3;
      });
      const nextState = { solvedGroupIds, mistakes: nextMistakes };
      const success = await onSave({
        status: lost ? "lost" : "in_progress",
        state: nextState,
        attemptCount: nextMistakes,
      });
      if (success) {
        setMistakes(nextMistakes);
        setSelected([]);
        setStatus(lost ? "lost" : "in_progress");
        setMessage(lost ? "No chances remain. The groups are revealed below." : oneAway ? "One away! Three selections belong together." : "Not a group. Try another combination.");
      }
    }
    setSaving(false);
  }

  const displayedSolvedGroups = status === "lost" ? groups : groups.filter((group) => solvedGroupIds.includes(group.id));

  return (
    <section className="daily-game-card spark-sort-card" aria-labelledby="spark-sort-title">
      <div className="daily-game-heading">
        <div>
          <div className="dashboard-small-label">TODAY'S GROUPING GAME</div>
          <h2 id="spark-sort-title">✨ SPARK Sort</h2>
          <p>Find four groups of four cafeteria-connected items.</p>
        </div>
        <div className="daily-game-streak" aria-label={`${streak} day SPARK Sort streak`}>
          <strong>{streak}</strong><span>day streak</span>
        </div>
      </div>

      <div className="spark-sort-chances" aria-label={`${chancesRemaining} chances remaining`}>
        Chances remaining: {Array.from({ length: 5 }, (_, index) => <span key={index} className={index < chancesRemaining ? "active" : ""}>●</span>)}
      </div>

      {displayedSolvedGroups.map((group) => (
        <div className="spark-sort-solved" key={group.id}>
          <strong>{group.category}</strong>
          <span>{group.items.join(", ")}</span>
        </div>
      ))}

      {status !== "lost" && (
        <div className="spark-sort-grid" aria-label="Items to group">
          {remainingItems.map((item) => (
            <button
              type="button"
              key={item}
              className={selected.includes(item) ? "selected" : ""}
              aria-pressed={selected.includes(item)}
              onClick={() => toggleItem(item)}
              disabled={disabled || saving || status !== "in_progress"}
            >{item}</button>
          ))}
        </div>
      )}

      {status === "in_progress" && (
        <div className="spark-sort-actions">
          <button type="button" onClick={() => setSelected([])} disabled={!selected.length || saving}>Clear</button>
          <button type="button" className="finish-line-submit finish-line-ready" onClick={submitGroup} disabled={selected.length !== 4 || saving || disabled}>{saving ? "Checking..." : "Submit Group"}</button>
        </div>
      )}

      <div className="daily-game-message" role="status" aria-live="polite">
        {disabled ? "Game progress needs the Supabase setup before play can begin." : message || (status === "won" ? "Completed for this school today." : status === "lost" ? "Today's puzzle is complete. Try again next weekday!" : "Select four items that share a connection.")}
      </div>
    </section>
  );
}
