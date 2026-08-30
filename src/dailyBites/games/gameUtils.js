const PACIFIC_TIME_ZONE = "America/Los_Angeles";

export function getPacificDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function previousWeekdayString(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() - 1);

  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDailyGameDate(date = new Date()) {
  let dateString = getPacificDateString(date);
  const day = new Date(`${dateString}T12:00:00`).getDay();

  if (day === 6 || day === 0) {
    dateString = previousWeekdayString(dateString);
  }

  return dateString;
}

export function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededShuffle(items, seedText) {
  const result = [...items];
  let value = hashString(seedText);

  function nextRandom() {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function selectDailyPuzzle(puzzles, gameType, dateString) {
  if (!puzzles.length) return null;
  const target = new Date(`${dateString}T12:00:00`);
  const rotationStart = new Date("2020-01-06T12:00:00");
  let weekdayNumber = 0;
  const cursor = new Date(rotationStart);

  while (cursor < target) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() >= 1 && cursor.getDay() <= 5) weekdayNumber += 1;
  }

  const gameOffset = hashString(gameType) % puzzles.length;
  const index = (weekdayNumber + gameOffset) % puzzles.length;
  const puzzle = puzzles[index];
  return { ...puzzle, puzzleId: `${gameType}-${dateString}-${puzzle.id}` };
}

export function scoreWordGame(guessCount) {
  return Math.max(0, 6 - guessCount);
}

export function scoreSparkSort(chancesRemaining) {
  return Math.max(0, Math.min(5, chancesRemaining));
}

export function evaluateWordGuess(guess, answer) {
  const result = Array(5).fill("absent");
  const remaining = {};

  for (let index = 0; index < 5; index += 1) {
    if (guess[index] === answer[index]) {
      result[index] = "correct";
    } else {
      remaining[answer[index]] = (remaining[answer[index]] || 0) + 1;
    }
  }

  for (let index = 0; index < 5; index += 1) {
    if (result[index] === "correct") continue;
    const letter = guess[index];
    if (remaining[letter] > 0) {
      result[index] = "present";
      remaining[letter] -= 1;
    }
  }

  return result;
}

export function calculateGameStreak(rows, gameType, activeDate) {
  const byDate = new Map(
    rows
      .filter((row) => row.game_type === gameType)
      .map((row) => [row.service_date, row.status])
  );

  if (byDate.get(activeDate) === "lost") return 0;

  let expected = byDate.get(activeDate) === "won"
    ? activeDate
    : previousWeekdayString(activeDate);
  let streak = 0;

  while (streak < 366 && byDate.get(expected) === "won") {
    streak += 1;
    expected = previousWeekdayString(expected);
  }

  return streak;
}
