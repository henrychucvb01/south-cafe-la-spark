import { getLosAngelesDate, isWeekdayDate, seededQuestionOrder } from "./arTrainingUtils";

const QUESTIONS = Array.from({ length: 500 }, (_, index) => ({ id: `ar-test-${index + 1}` }));

test("uses America/Los_Angeles for the training date", () => {
  expect(getLosAngelesDate(new Date("2026-08-31T06:30:00Z"))).toBe("2026-08-30");
  expect(getLosAngelesDate(new Date("2026-08-31T08:30:00Z"))).toBe("2026-08-31");
});

test("identifies weekdays without school-calendar exclusions", () => {
  expect(isWeekdayDate("2026-08-31")).toBe(true);
  expect(isWeekdayDate("2026-08-30")).toBe(false);
});

test("question order is randomized deterministically for a seed", () => {
  const first = seededQuestionOrder(QUESTIONS, "seed-a").map((item) => item.id);
  const repeated = seededQuestionOrder(QUESTIONS, "seed-a").map((item) => item.id);
  const different = seededQuestionOrder(QUESTIONS, "seed-b").map((item) => item.id);
  expect(first).toEqual(repeated);
  expect(first).not.toEqual(different);
});

test("randomization cycles through a complete 500-question bank", () => {
  const ordered = seededQuestionOrder(QUESTIONS, "cycle-1");
  expect(ordered).toHaveLength(500);
  expect(new Set(ordered.map((item) => item.id)).size).toBe(500);
  expect(ordered.slice(0, 50)).toHaveLength(50);
});
