import React, { useEffect, useMemo, useRef, useState } from "react";
import GameResultDialog from "./GameResultDialog";
import { scoreSparkSort, seededShuffle } from "./gameUtils";

const DIFFICULTY_LABELS = ["Warm-up", "Tasty", "Tricky", "Chef's challenge"];

export default function CafeteriaConnectionsGame({ puzzle, progress, streak, disabled, onSave, onComplete }) {
  const [selected, setSelected] = useState([]);
  const [solvedGroupIds, setSolvedGroupIds] = useState([]);
  const [mistakes, setMistakes] = useState(0);
  const [status, setStatus] = useState("in_progress");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [newlySolvedGroupId, setNewlySolvedGroupId] = useState("");
  const [feedbackAnimation, setFeedbackAnimation] = useState("");
  const [result, setResult] = useState(null);
  const [resultOpen, setResultOpen] = useState(false);
  const resultTimerRef = useRef(null);
  const activePuzzleRef = useRef("");

  const groups = useMemo(
    () => puzzle.groups.map((group, index) => ({ ...group, id: `${puzzle.id}-group-${index}`, difficultyIndex: index })),
    [puzzle]
  );
  const shuffledItems = useMemo(
    () => seededShuffle(groups.flatMap((group) => group.items), puzzle.puzzleId),
    [groups, puzzle.puzzleId]
  );

  useEffect(() => {
    const savedSolved = Array.isArray(progress?.state?.solvedGroupIds) ? progress.state.solvedGroupIds : [];
    const savedMistakes = Number(progress?.state?.mistakes) || 0;
    const savedStatus = progress?.status || "in_progress";
    const samePuzzle = activePuzzleRef.current === puzzle?.puzzleId;
    const sameProgress =
      savedStatus === status &&
      savedMistakes === mistakes &&
      savedSolved.length === solvedGroupIds.length &&
      savedSolved.every((groupId) => solvedGroupIds.includes(groupId));
    if (samePuzzle && sameProgress) return;

    activePuzzleRef.current = puzzle?.puzzleId || "";
    setSolvedGroupIds(savedSolved);
    setMistakes(savedMistakes);
    setStatus(savedStatus);
    setSelected([]);
    setMessage("");
    setNewlySolvedGroupId("");
    setResult(
      savedStatus === "won"
        ? { points: scoreSparkSort(Math.max(0, 5 - savedMistakes)) }
        : null
    );
  }, [puzzle?.puzzleId, progress]);

  useEffect(() => () => window.clearTimeout(resultTimerRef.current), []);

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

  function animateFeedback(className) {
    setFeedbackAnimation("");
    window.requestAnimationFrame(() => {
      setFeedbackAnimation(className);
      window.setTimeout(() => setFeedbackAnimation(""), 430);
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
      const points = scoreSparkSort(chancesRemaining);
      const success = won
        ? await onComplete({ status: "won", state: nextState, attemptCount: mistakes, points })
        : await onSave({ status: "in_progress", state: nextState, attemptCount: mistakes });
      if (success) {
        setSolvedGroupIds(nextSolved);
        setSelected([]);
        setStatus(won ? "won" : "in_progress");
        setNewlySolvedGroupId(match.id);
        setMessage(won ? "All four groups found!" : `Correct: ${match.category}`);
        if (won) {
          setResult({ points });
          resultTimerRef.current = window.setTimeout(() => setResultOpen(true), 520);
        } else {
          window.setTimeout(() => setNewlySolvedGroupId(""), 650);
        }
      }
    } else {
      const nextMistakes = mistakes + 1;
      const lost = nextMistakes >= 5;
      const oneAway = groups.some((group) => {
        if (solvedGroupIds.includes(group.id)) return false;
        return group.items.filter((item) => selectedSet.has(item)).length === 3;
      });
      const nextState = { solvedGroupIds, mistakes: nextMistakes };
      const success = await onSave({ status: lost ? "lost" : "in_progress", state: nextState, attemptCount: nextMistakes });
      if (success) {
        setMistakes(nextMistakes);
        setSelected([]);
        setStatus(lost ? "lost" : "in_progress");
        setMessage(lost ? "No chances remain. The groups are revealed from easiest to hardest." : oneAway ? "One away! Three selections belong together." : "Not a group. Try another combination.");
        animateFeedback(oneAway ? "spark-sort-one-away" : "spark-sort-incorrect");
      }
    }
    setSaving(false);
  }

  const displayedSolvedGroups = groups.filter(
    (group) => status === "lost" || solvedGroupIds.includes(group.id)
  );
  const shownStreak = progress?.status === "won" ? streak : streak + 1;

  return (
    <section className="daily-game-card spark-sort-card" aria-labelledby="spark-sort-title">
      <div className="daily-game-heading">
        <div><div className="dashboard-small-label">TODAY'S GROUPING GAME</div><h2 id="spark-sort-title">✨ SPARK Sort</h2><p>Find four groups of four cafeteria-connected items.</p></div>
        <div className="daily-game-streak" aria-label={`${streak} day SPARK Sort streak`}><strong>{streak}</strong><span>day streak</span></div>
      </div>

      <div className="spark-sort-chances" aria-label={`${chancesRemaining} chances remaining`}>Chances remaining: {Array.from({ length: 5 }, (_, index) => <span key={index} className={index < chancesRemaining ? "active" : ""} aria-hidden="true">●</span>)}</div>

      <div className="spark-sort-solved-list" aria-live="polite">
        {displayedSolvedGroups.map((group) => (
          <div className={`spark-sort-solved spark-sort-group-${group.difficultyIndex} ${newlySolvedGroupId === group.id ? "spark-sort-group-reveal" : ""}`} key={group.id}>
            <small>Group {group.difficultyIndex + 1} · {DIFFICULTY_LABELS[group.difficultyIndex]}</small>
            <strong>{group.category}</strong>
            <span>{group.items.join(" · ")}</span>
          </div>
        ))}
      </div>

      {status !== "lost" && (
        <div className={`spark-sort-grid ${feedbackAnimation}`} aria-label="Items to group">
          {remainingItems.map((item) => <button type="button" key={item} className={selected.includes(item) ? "selected" : ""} aria-pressed={selected.includes(item)} onClick={() => toggleItem(item)} disabled={disabled || saving || status !== "in_progress"}>{item}</button>)}
        </div>
      )}

      {status === "in_progress" && (
        <div className="spark-sort-actions"><button type="button" onClick={() => setSelected([])} disabled={!selected.length || saving}>Clear</button><button type="button" className="finish-line-submit finish-line-ready" onClick={submitGroup} disabled={selected.length !== 4 || saving || disabled}>{saving ? "Checking..." : "Submit Group"}</button></div>
      )}

      <div className="daily-game-message" role="status" aria-live="polite">{disabled ? "Game progress needs the Supabase setup before play can begin." : message || (status === "won" ? "Completed for this school today." : status === "lost" ? "Today's puzzle is complete. Try again next weekday!" : "Select four items that share a connection.")}</div>
      {result && !resultOpen && status === "won" && <button type="button" className="game-result-reopen" onClick={() => setResultOpen(true)}>View today's result</button>}

      <GameResultDialog open={resultOpen} eyebrow="SPARK SORT COMPLETE" title="Four groups. One bright finish!" message={`Puzzle completed with ${chancesRemaining} ${chancesRemaining === 1 ? "chance" : "chances"} remaining.`} points={result?.points || 0} streakMessage={`${shownStreak}-day SPARK Sort streak`} onClose={() => setResultOpen(false)} />
    </section>
  );
}
