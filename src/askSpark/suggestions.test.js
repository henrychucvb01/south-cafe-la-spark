import { ASK_SPARK_SUGGESTIONS, editDistance, getAskSparkSuggestions } from "./suggestions";

test("finds common questions by phrase", () => {
  expect(getAskSparkSuggestions("production record")[0].question).toMatch(/production record/i);
});

test("fuzzy matches manager misspellings", () => {
  expect(getAskSparkSuggestions("prodction recrod").some((item) => /production record/i.test(item.question))).toBe(true);
  expect(editDistance("prodction", "production")).toBe(1);
});

test("filters suggestions by approved category", () => {
  const results = getAskSparkSuggestions("meal", "Field Trips / Offsite Meals");
  expect(results.length).toBeGreaterThan(0);
  expect(results.every((item) => item.category === "Field Trips / Offsite Meals")).toBe(true);
});

test("does not promote EEC in general autocomplete suggestions", () => {
  expect(ASK_SPARK_SUGGESTIONS.some((item) => /\bEEC\b|early education/i.test(item.question))).toBe(false);
  expect(getAskSparkSuggestions("EEC binder")).toEqual([]);
});
