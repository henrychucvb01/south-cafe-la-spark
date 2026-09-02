import React, { useEffect, useMemo, useRef, useState } from "react";
import { isValidWordGuess } from "../../data/validWordGuesses";
import GameResultDialog from "./GameResultDialog";
import { evaluateWordGuess, scoreWordGame } from "./gameUtils";

const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const REVEAL_DURATION_MS = 850;

export default function CafeteriaWordGame({ puzzle, progress, streak, disabled, onSave, onComplete }) {
  const [guesses, setGuesses] = useState([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [status, setStatus] = useState("in_progress");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [revealingRow, setRevealingRow] = useState(-1);
  const [shakeRow, setShakeRow] = useState(-1);
  const [result, setResult] = useState(null);
  const [resultOpen, setResultOpen] = useState(false);
  const revealTimerRef = useRef(null);
  const activePuzzleRef = useRef("");

  useEffect(() => {
    const savedGuesses = Array.isArray(progress?.state?.guesses) ? progress.state.guesses : [];
    const savedStatus = progress?.status || "in_progress";
    const savedAttempts = Number(progress?.attempt_count) || savedGuesses.length;
    const samePuzzle = activePuzzleRef.current === puzzle?.puzzleId;
    const sameProgress =
      savedStatus === status &&
      savedGuesses.length === guesses.length &&
      savedGuesses.every((guess, index) => guess === guesses[index]);
    if (samePuzzle && sameProgress) return;

    activePuzzleRef.current = puzzle?.puzzleId || "";
    setGuesses(savedGuesses);
    setStatus(savedStatus);
    setCurrentGuess("");
    setMessage("");
    setRevealingRow(-1);
    setShakeRow(-1);
    setResult(
      savedStatus === "won"
        ? { kind: "won", points: scoreWordGame(savedAttempts), guessCount: savedAttempts }
        : savedStatus === "lost"
        ? { kind: "lost", points: 0, guessCount: 6 }
        : null
    );
  }, [puzzle?.puzzleId, progress]);

  useEffect(() => () => window.clearTimeout(revealTimerRef.current), []);

  const letterStates = useMemo(() => {
    const states = {};
    guesses.forEach((guess) => {
      evaluateWordGuess(guess, puzzle.answer).forEach((guessResult, index) => {
        const letter = guess[index];
        const rank = { absent: 1, present: 2, correct: 3 };
        if (!states[letter] || rank[guessResult] > rank[states[letter]]) states[letter] = guessResult;
      });
    });
    return states;
  }, [guesses, puzzle.answer]);

  function rejectGuess(text) {
    setMessage(text);
    setShakeRow(guesses.length);
    window.setTimeout(() => setShakeRow(-1), 380);
  }

  async function submitGuess() {
    if (saving || disabled || status !== "in_progress") return;
    if (currentGuess.length !== 5) return rejectGuess("Enter five letters before submitting.");
    if (!isValidWordGuess(currentGuess)) {
      return rejectGuess("That word is not in the SPARK word list. Try another five-letter word.");
    }

    const nextGuesses = [...guesses, currentGuess];
    const won = currentGuess === puzzle.answer;
    const lost = !won && nextGuesses.length >= 6;
    const nextStatus = won ? "won" : lost ? "lost" : "in_progress";
    const nextState = { guesses: nextGuesses };
    const points = won ? scoreWordGame(nextGuesses.length) : 0;

    setSaving(true);
    setMessage("");
    const success = won
      ? await onComplete({ status: nextStatus, state: nextState, attemptCount: nextGuesses.length, points })
      : await onSave({ status: nextStatus, state: nextState, attemptCount: nextGuesses.length });

    if (success) {
      const submittedRow = guesses.length;
      setGuesses(nextGuesses);
      setCurrentGuess("");
      setStatus(nextStatus);
      setRevealingRow(submittedRow);
      setMessage(won ? "Revealing your SPARK result..." : lost ? "Revealing today's answer..." : "Guess saved.");
      revealTimerRef.current = window.setTimeout(() => {
        setRevealingRow(-1);
        if (won || lost) {
          setResult({ kind: won ? "won" : "lost", points, guessCount: nextGuesses.length });
          setResultOpen(true);
        }
      }, REVEAL_DURATION_MS);
    }
    setSaving(false);
  }

  function handleKey(key) {
    if (saving || disabled || status !== "in_progress" || revealingRow >= 0) return;
    if (key === "ENTER") submitGuess();
    else if (key === "BACKSPACE") {
      setCurrentGuess((value) => value.slice(0, -1));
      setMessage("");
    } else if (/^[A-Z]$/.test(key)) {
      setCurrentGuess((value) => (value.length < 5 ? `${value}${key}` : value));
      setMessage("");
    }
  }

  useEffect(() => {
    function handlePhysicalKeyboard(event) {
      if (event.ctrlKey || event.metaKey || event.altKey || resultOpen) return;
      const key = event.key.toUpperCase();
      if (/^[A-Z]$/.test(key) || key === "ENTER" || key === "BACKSPACE") {
        event.preventDefault();
        handleKey(key);
      }
    }
    window.addEventListener("keydown", handlePhysicalKeyboard);
    return () => window.removeEventListener("keydown", handlePhysicalKeyboard);
  });

  const rows = Array.from({ length: 6 }, (_, rowIndex) => {
    const word = guesses[rowIndex] || (rowIndex === guesses.length ? currentGuess : "");
    const evaluation = guesses[rowIndex] ? evaluateWordGuess(guesses[rowIndex], puzzle.answer) : [];
    return Array.from({ length: 5 }, (_, columnIndex) => ({
      letter: word[columnIndex] || "",
      result: evaluation[columnIndex] || "",
    }));
  });

  const shownStreak = result?.kind === "won" && progress?.status !== "won" ? streak + 1 : streak;
  const resultMessage = result?.kind === "lost"
    ? `The word was ${puzzle.answer}. Tomorrow brings a fresh start.`
    : result?.points === 0
    ? `${puzzle.answer} solved on guess 6. No points this round, but the school's streak stays alive!`
    : `${puzzle.answer} solved in ${result?.guessCount} ${result?.guessCount === 1 ? "guess" : "guesses"}.`;

  return (
    <section className="daily-game-card word-game-card" aria-labelledby="word-game-title">
      <div className="daily-game-heading">
        <div><div className="dashboard-small-label">TODAY'S WORD</div><h2 id="word-game-title">🥕 Cafeteria Word</h2><p>Find the five-letter cafeteria word in six guesses.</p></div>
        <div className="daily-game-streak" aria-label={`${streak} day word streak`}><strong>{streak}</strong><span>day streak</span></div>
      </div>
      <div className="daily-game-hint"><strong>{puzzle.category}:</strong> {puzzle.hint}</div>

      <div className="word-board" aria-label="Word guesses">
        {rows.map((row, rowIndex) => (
          <div className={`word-row ${shakeRow === rowIndex ? "word-row-shake" : ""}`} key={rowIndex}>
            {row.map((tile, columnIndex) => {
              const isRevealing = revealingRow === rowIndex;
              return (
                <div key={columnIndex} className={`word-tile ${tile.result ? `word-tile-${tile.result}` : ""} ${isRevealing ? "word-tile-reveal" : ""}`} style={isRevealing ? { "--tile-delay": `${columnIndex * 110}ms` } : undefined} aria-label={tile.letter ? `${tile.letter}${tile.result ? `, ${tile.result}` : ""}` : "empty"}>
                  <span>{tile.letter}</span>
                  {tile.result && <small aria-hidden="true">{tile.result === "correct" ? "✓" : tile.result === "present" ? "◆" : "×"}</small>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="word-legend" aria-label="Tile status legend">
        <span><i className="legend-correct">✓</i> Correct spot</span><span><i className="legend-present">◆</i> Different spot</span><span><i className="legend-absent">×</i> Not in word</span>
      </div>

      <div className="word-keyboard" aria-label="On-screen keyboard">
        {KEYBOARD_ROWS.map((row) => <div className="word-keyboard-row" key={row}>{row.split("").map((letter) => <button type="button" key={letter} className={letterStates[letter] ? `word-key-${letterStates[letter]}` : ""} onClick={() => handleKey(letter)} disabled={disabled || saving || status !== "in_progress" || revealingRow >= 0} aria-label={`${letter}${letterStates[letter] ? `, ${letterStates[letter]}` : ""}`}>{letter}</button>)}</div>)}
        <div className="word-keyboard-row"><button type="button" className="word-key-wide" onClick={() => handleKey("ENTER")} disabled={disabled || saving || status !== "in_progress" || revealingRow >= 0}>Enter</button><button type="button" className="word-key-wide" onClick={() => handleKey("BACKSPACE")} disabled={disabled || saving || status !== "in_progress" || revealingRow >= 0} aria-label="Delete last letter">⌫</button></div>
      </div>

      <div className="daily-game-message" role="status" aria-live="polite">{disabled ? "Game progress needs the Supabase setup before play can begin." : message || (status === "won" ? "Completed for this school today." : status === "lost" ? `Today's word was ${puzzle.answer}. The streak ended.` : `${6 - guesses.length} guesses remaining`)}</div>
      {result && !resultOpen && status !== "in_progress" && <button type="button" className="game-result-reopen" onClick={() => setResultOpen(true)}>View today's result</button>}

      <GameResultDialog open={resultOpen} eyebrow={result?.kind === "lost" ? "FRESH START TOMORROW" : "CAFETERIA WORD COMPLETE"} title={result?.kind === "lost" ? "The streak ended today" : "That’s the SPARK spirit!"} message={resultMessage} points={result?.points || 0} streakMessage={result?.kind === "lost" ? "Word streak reset to 0 days" : `${shownStreak}-day Word streak`} tone={result?.kind === "lost" ? "reset" : "success"} onClose={() => setResultOpen(false)} />
    </section>
  );
}
