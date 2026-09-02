export function getLosAngelesDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function isWeekdayDate(dateString) {
  const day = new Date(`${dateString}T12:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

export function seededQuestionOrder(questions, seed) {
  function score(id) {
    let hash = 2166136261;
    const input = `${seed}:${id}`;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  return [...questions].sort((a, b) => score(a.id) - score(b.id));
}
