import React, { useEffect, useMemo, useState } from "react";
import { evaluateWordGuess, scoreWordGame } from "./gameUtils";

const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export default function CafeteriaWordGame({
  puzzle,
  progress,
  streak,
  disabled,
  onSave,
  onComplete,
}) {
  const [guesses, setGuesses] = useState([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [status, setStatus] = useState("in_progress");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const savedGuesses = Array.isArray(progress?.state?.guesses)
      ? progress.state.guesses
      : [];
    setGuesses(savedGuesses);
    setStatus(progress?.status || "in_progress");
    setCurrentGuess("");
    setMessage("");
  }, [puzzle?.puzzleId, progress]);

  const letterStates = useMemo(() => {
    const states = {};
    guesses.forEach((guess) => {
      evaluateWordGuess(guess, puzzle.answer).forEach((result, index) => {
        const letter = guess[index];
        const rank = { absent: 1, present: 2, correct: 3 };
        if (!states[letter] || rank[result] > rank[states[letter]]) {
          states[letter] = result;
        }
      });
    });
    return states;
  }, [guesses, puzzle.answer]);

  async function submitGuess() {
    if (saving || disabled || status !== "in_progress") return;
    if (currentGuess.length !== 5) {
      setMessage("Enter five letters before submitting.");
      return;
    }

    const nextGuesses = [...guesses, currentGuess];
    const won = currentGuess === puzzle.answer;
    const lost = !won && nextGuesses.length >= 6;
    const nextStatus = won ? "won" : lost ? "lost" : "in_progress";
    const nextState = { guesses: nextGuesses };

    setSaving(true);
    setMessage("");
    const success = won
      ? await onComplete({
          status: nextStatus,
          state: nextState,
          attemptCount: nextGuesses.length,
          points: scoreWordGame(nextGuesses.length),
        })
      : await onSave({
          status: nextStatus,
          state: nextState,
          attemptCount: nextGuesses.length,
        });

    if (success) {
      setGuesses(nextGuesses);
      setCurrentGuess("");
      setStatus(nextStatus);
      setMessage(
        won
          ? `Great work! ${puzzle.answer} solved in ${nextGuesses.length}.`
          : lost
          ? `Today's word was ${puzzle.answer}. Try again next weekday!`
          : "Guess saved."
      );
    }
    setSaving(false);
  }

  function handleKey(key) {
    if (saving || disabled || status !== "in_progress") return;
    if (key === "ENTER") {
      submitGuess();
    } else if (key === "BACKSPACE") {
      setCurrentGuess((value) => value.slice(0, -1));
    } else if (/^[A-Z]$/.test(key)) {
      setCurrentGuess((value) => (value.length < 5 ? `${value}${key}` : value));
    }
  }

  useEffect(() => {
    function handlePhysicalKeyboard(event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
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
    const evaluation = guesses[rowIndex]
      ? evaluateWordGuess(guesses[rowIndex], puzzle.answer)
      : [];
    return Array.from({ length: 5 }, (_, columnIndex) => ({
      letter: word[columnIndex] || "",
      result: evaluation[columnIndex] || "",
    }));
  });

  return (
    <section className="daily-game-card" aria-labelledby="word-game-title">
      <div className="daily-game-heading">
        <div>
          <div className="dashboard-small-label">TODAY'S WORD</div>
          <h2 id="word-game-title">🥕 Cafeteria Word</h2>
          <p>Find the five-letter cafeteria word in six guesses.</p>
        </div>
        <div className="daily-game-streak" aria-label={`${streak} day word streak`}>
          <strong>{streak}</strong><span>day streak</span>
        </div>
      </div>

      <div className="daily-game-hint"><strong>{puzzle.category}:</strong> {puzzle.hint}</div>

      <div className="word-board" aria-label="Word guesses">
        {rows.map((row, rowIndex) => (
          <div className="word-row" key={rowIndex}>
            {row.map((tile, columnIndex) => (
              <div
                key={columnIndex}
                className={`word-tile ${tile.result ? `word-tile-${tile.result}` : ""}`}
                aria-label={tile.letter ? `${tile.letter}${tile.result ? `, ${tile.result}` : ""}` : "empty"}
              >
                {tile.letter}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="word-keyboard" aria-label="On-screen keyboard">
        {KEYBOARD_ROWS.map((row) => (
          <div className="word-keyboard-row" key={row}>
            {row.split("").map((letter) => (
              <button
                type="button"
                key={letter}
                className={letterStates[letter] ? `word-key-${letterStates[letter]}` : ""}
                onClick={() => handleKey(letter)}
                disabled={disabled || saving || status !== "in_progress"}
              >{letter}</button>
            ))}
          </div>
        ))}
        <div className="word-keyboard-row">
          <button type="button" className="word-key-wide" onClick={() => handleKey("ENTER")} disabled={disabled || saving || status !== "in_progress"}>Enter</button>
          <button type="button" className="word-key-wide" onClick={() => handleKey("BACKSPACE")} disabled={disabled || saving || status !== "in_progress"} aria-label="Delete last letter">⌫</button>
        </div>
      </div>

      <div className="daily-game-message" role="status" aria-live="polite">
        {disabled ? "Game progress needs the Supabase setup before play can begin." : message || (status === "won" ? "Completed for this school today." : status === "lost" ? `Today's word was ${puzzle.answer}.` : `${6 - guesses.length} guesses remaining`)}
      </div>
    </section>
  );
}
