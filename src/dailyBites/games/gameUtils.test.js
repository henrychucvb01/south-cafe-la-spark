import {
  calculateGameStreak,
  evaluateWordGuess,
  getDailyGameDate,
  scoreSparkSort,
  scoreWordGame,
  selectDailyPuzzle,
} from "./gameUtils";
import { SPARK_SORT_PUZZLES, WORD_GAME_PUZZLES } from "../../data/dailyBitesGames";
import { isValidWordGuess, VALID_WORD_GUESSES } from "../../data/validWordGuesses";

describe("Daily Bites game utilities", () => {
  test("word scoring follows the approved six-guess schedule", () => {
    expect([1, 2, 3, 4, 5, 6].map(scoreWordGame)).toEqual([5, 4, 3, 2, 1, 0]);
  });

  test("SPARK Sort scoring matches chances remaining", () => {
    expect([5, 4, 3, 2, 1, 0].map(scoreSparkSort)).toEqual([5, 4, 3, 2, 1, 0]);
  });

  test("Saturday and Sunday retain Friday's puzzle", () => {
    expect(getDailyGameDate(new Date("2026-08-29T19:00:00Z"))).toBe("2026-08-28");
    expect(getDailyGameDate(new Date("2026-08-30T19:00:00Z"))).toBe("2026-08-28");
  });

  test("daily selection is deterministic", () => {
    const puzzles = [{ id: "one" }, { id: "two" }, { id: "three" }];
    expect(selectDailyPuzzle(puzzles, "word", "2026-08-28")).toEqual(
      selectDailyPuzzle(puzzles, "word", "2026-08-28")
    );
    expect(selectDailyPuzzle(puzzles, "word", "2026-08-31").id).not.toBe(
      selectDailyPuzzle(puzzles, "word", "2026-09-01").id
    );
  });

  test("word evaluation handles repeated letters", () => {
    expect(evaluateWordGuess("APPLE", "PLATE")).toEqual([
      "present",
      "present",
      "absent",
      "present",
      "correct",
    ]);
  });

  test("game streaks skip weekends and reset on a loss", () => {
    const wins = [
      { game_type: "word", service_date: "2026-08-28", status: "won" },
      { game_type: "word", service_date: "2026-08-27", status: "won" },
      { game_type: "word", service_date: "2026-08-26", status: "won" },
    ];
    expect(calculateGameStreak(wins, "word", "2026-08-31")).toBe(3);
    expect(
      calculateGameStreak(
        [...wins, { game_type: "word", service_date: "2026-08-31", status: "lost" }],
        "word",
        "2026-08-31"
      )
    ).toBe(0);
  });

  test("reviewed word content has unique five-letter answers", () => {
    const answers = WORD_GAME_PUZZLES.map((puzzle) => puzzle.answer);
    expect(answers.every((answer) => /^[A-Z]{5}$/.test(answer))).toBe(true);
    expect(new Set(answers).size).toBe(answers.length);
    expect(answers.every(isValidWordGuess)).toBe(true);
  });

  test("word validation accepts common words and rejects arbitrary strings", () => {
    expect(VALID_WORD_GUESSES.size).toBeGreaterThan(300);
    expect(isValidWordGuess("crane")).toBe(true);
    expect(isValidWordGuess("salad")).toBe(true);
    expect(isValidWordGuess("qzxjk")).toBe(false);
    expect(isValidWordGuess("abcd")).toBe(false);
  });

  test("every SPARK Sort puzzle contains four distinct groups of four", () => {
    SPARK_SORT_PUZZLES.forEach((puzzle) => {
      expect(puzzle.groups).toHaveLength(4);
      expect(puzzle.groups.every((group) => group.items.length === 4)).toBe(true);
      const items = puzzle.groups.flatMap((group) => group.items);
      expect(new Set(items).size).toBe(16);
    });
  });
});
