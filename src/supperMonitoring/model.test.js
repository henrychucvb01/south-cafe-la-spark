import { newDraft, weekDates, average, validate, requiresCorrectiveAction, findings, QUESTION_IDS, schoolYear } from "./model";

// Synthetic questionnaire exercises the renderer contract. It is deliberately
// not the missing official questionnaire or an approved compliance definition.
const fixture = { ready: true, questions: QUESTION_IDS.map(id => ({ id, options: ["yes", "no", "na"], ...(id === "18b" ? { when: { id: "18a", answer: "yes" } } : {}) })) };
function completeDraft() {
  const data = newDraft("A Monitor");
  Object.assign(data, { unannounced: true, adultMeals: "0", approvedServiceTime: "14:30-15:30", followUpRequired: false, monitoringDate: "2026-09-23", arrivalTime: "14:00", departureTime: "16:00", serviceStart: "14:30", serviceEnd: "15:30", programName: "ASP", todayAttendance: "101", todayMeals: "100", weekStart: "2026-09-14", coordinatorName: "B Coordinator", comments: "No Findings" });
  data.history = weekDates(data.weekStart).map(date => ({ date, meals: "100", attendance: "101" }));
  data.menu = data.menu.map(row => ({ ...row, item: "Menu item", serving: "1 cup" }));
  data.answers = Object.fromEntries(QUESTION_IDS.map(id => [id, id === "18a" || id === "19" ? "no" : "yes"]));
  ["monitor", "coordinator"].forEach(role => { data.signatures[role] = { contentHash: "a".repeat(64), strokes: [[[0.1, 0.2], [0.4, 0.8]]], printedName: data[`${role}Name`], date: "2026-09-23", pages: [1, 2], acceptedAt: "2026-09-23T20:00:00Z" }; });
  return data;
}

test("a week is always Monday through Friday, including year and leap-day boundaries", () => {
  expect(weekDates("2027-01-01")).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"]);
  expect(weekDates("2024-02-29")[3]).toBe("2024-02-29");
  expect(weekDates("2026-02-30")).toEqual([]);
  expect(weekDates("2026-09-20")[0]).toBe("2026-09-14");
});
test("average distinguishes missing values from zero and retains entered counts", () => {
  const history = completeDraft().history;
  history[0].meals = "0";
  expect(average(history)).toBe(80);
  history[0].meals = "";
  expect(average(history)).toBeNull();
  history[0].meals = "2.5";
  expect(average(history)).toBeNull();
  expect(history[0].meals).toBe("2.5");
});
test("detects equal and lower attendance for each day", () => {
  for (let i = 0; i < 5; i++) for (const count of ["100", "99"]) {
    const draft = completeDraft(); draft.history[i].attendance = count;
    expect(validate(draft, fixture).some(e => e.field === `attendance-${i}`)).toBe(true);
  }
});
test("detects duplicate, weekend, missing, and monitoring-date history entries", () => {
  const draft = completeDraft();
  expect(validate(draft, fixture)).toEqual([]);
  draft.history[1].date = draft.history[0].date;
  expect(validate(draft, fixture).some(e => e.message.includes("repeat"))).toBe(true);
  draft.history[1].date = "2026-09-19";
  expect(validate(draft, fixture).some(e => e.field === "date-1")).toBe(true);
  draft.monitoringDate = draft.history[0].date;
  expect(validate(draft, fixture).some(e => e.message.includes("monitoring date cannot"))).toBe(true);
  draft.history[2].meals = "";
  expect(validate(draft, fixture).some(e => e.field === "meals-2")).toBe(true);
});
test("No triggers corrective action except 18a/19; Yes to 19 triggers it", () => {
  expect(requiresCorrectiveAction("18a", "no")).toBe(false);
  expect(requiresCorrectiveAction("19", "no")).toBe(false);
  expect(requiresCorrectiveAction("19", "yes")).toBe(true);
  expect(requiresCorrectiveAction("18b", "no")).toBe(true);
  expect(requiresCorrectiveAction("20", "no")).toBe(true);
  expect(requiresCorrectiveAction("20", "na")).toBe(false);
});
test("18b only applies according to the configured form condition", () => {
  const draft = completeDraft(); draft.answers["18b"] = "no";
  expect(findings(draft, fixture)).toEqual([]);
  draft.answers["18a"] = "yes";
  expect(findings(draft, fixture).map(q => q.id)).toEqual(["18b"]);
  expect(validate(draft, fixture).some(e => e.field === "repeatedFindings")).toBe(true);
});
test("corrective action and follow-up fields are mandatory when triggered", () => {
  const draft = completeDraft(); draft.answers["19"] = "yes"; draft.followUpRequired = true; draft.correctiveActionDue = "2026-10-01";
  expect(validate(draft, fixture).some(e => e.section === 5)).toBe(true);
  draft.correctiveActions["19"] = { description: "Finding", action: "Action", training: "Discussion", followUpPlan: "Return visit", actionDate: "2026-09-23", followUpDue: "2026-10-01", operatingDays: "6", calendarConfirmed: true };
  expect(validate(draft, fixture)).toEqual([]);
  draft.correctiveActions["19"].followUpComplete = true;
  expect(validate(draft, fixture).some(e => e.field === "action-19-followUpNotes")).toBe(true);
});
test("blank comment, names, signature date, page consent and stale signature name fail review", () => {
  const draft = completeDraft();
  draft.comments = "  "; draft.coordinatorName = "";
  draft.signatures.monitor.pages = [1]; draft.signatures.monitor.date = "";
  expect(validate(draft, fixture).map(e => e.field)).toEqual(expect.arrayContaining(["comments", "coordinatorName", "monitorSignature", "coordinatorSignature"]));
});
test("missing menu information, invalid times and incomplete questions fail review", () => {
  const draft = completeDraft(); draft.menu[0].serving = ""; draft.departureTime = "13:00"; delete draft.answers["20"];
  expect(validate(draft, fixture).map(e => e.field)).toEqual(expect.arrayContaining(["menu-0", "departureTime", "question-20"]));
});
test("official template cannot be bypassed by otherwise complete answers", () => {
  expect(validate(completeDraft(), { ready: false, questions: [] }).map(e => e.field)).toEqual(expect.arrayContaining(["officialForm", "officialPdf"]));
});
test("school-year boundary uses July and does not parse invalid dates", () => {
  expect(schoolYear("2026-06-30")).toBe("2025-26");
  expect(schoolYear("2026-07-01")).toBe("2026-27");
  expect(schoolYear("2026-02-30")).toBe("");
});
