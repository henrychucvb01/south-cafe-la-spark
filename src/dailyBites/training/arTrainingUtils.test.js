import { AR_TRAINING_QUESTIONS } from "../../data/arTrainingQuestions";
import { getLosAngelesDate, isWeekdayDate, seededQuestionOrder } from "./arTrainingUtils";

test("uses America/Los_Angeles for the training date", () => {
  expect(getLosAngelesDate(new Date("2026-08-31T06:30:00Z"))).toBe("2026-08-30");
  expect(getLosAngelesDate(new Date("2026-08-31T08:30:00Z"))).toBe("2026-08-31");
});

test("identifies weekdays without school-calendar exclusions", () => {
  expect(isWeekdayDate("2026-08-31")).toBe(true);
  expect(isWeekdayDate("2026-08-30")).toBe(false);
});

test("question order is randomized deterministically for a seed", () => {
  const first = seededQuestionOrder(AR_TRAINING_QUESTIONS, "seed-a").map((item) => item.id);
  const repeated = seededQuestionOrder(AR_TRAINING_QUESTIONS, "seed-a").map((item) => item.id);
  const different = seededQuestionOrder(AR_TRAINING_QUESTIONS, "seed-b").map((item) => item.id);
  expect(first).toEqual(repeated);
  expect(first).not.toEqual(different);
});

test("every AR question has a valid answer and approved provenance", () => {
  expect(AR_TRAINING_QUESTIONS.length).toBeGreaterThanOrEqual(12);
  expect(new Set(AR_TRAINING_QUESTIONS.map((item) => item.id)).size).toBe(AR_TRAINING_QUESTIONS.length);
  for (const question of AR_TRAINING_QUESTIONS) {
    expect(question.choices).toHaveLength(4);
    expect(question.correctIndex).toBeGreaterThanOrEqual(0);
    expect(question.correctIndex).toBeLessThan(4);
    expect(question.explanation).toBeTruthy();
    expect(question.source.chunkId).toMatch(/^ASKP1-C\d{6}$/);
    expect(question.source.title).toBeTruthy();
    expect(question.source.locator).toMatch(/^(Page|Slide|Sheet)/);
  }
});
