import { OFFICIAL_FORM } from "./officialForm.js";
export { OFFICIAL_FORM } from "./officialForm.js";
export const SECTIONS = ["Monitoring Information", "Five-Day History", "Today's Supper Information", "Menu & Serving Sizes", "Monitoring Questions", "Findings / Corrective Action", "Comments", "Names & Signatures", "Final Review", "Submit"];
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
export const MENU = ["Milk", "Meat/Alternate", "Grains/Breads", "Fruit", "Vegetable", "Additional Meat/Alternate", "Other"];
export const QUESTION_IDS = [...Array.from({ length: 17 }, (_, i) => String(i + 1)), "18a", "18b", "19", "20"];


export function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function schoolYear(date) {
  if (!validDate(date)) return "";
  const year = Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 7 ? 1 : 0);
  return `${year}-${String(year + 1).slice(-2)}`;
}
export function weekDates(date) {
  if (!validDate(date)) return [];
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return DAYS.map((_, i) => {
    const current = new Date(day);
    current.setUTCDate(current.getUTCDate() + i);
    return current.toISOString().slice(0, 10);
  });
}
export function newDraft(monitor = "") {
  return { schemaVersion: 1, unannounced: null, adultMeals: "", correctiveActionDue: "", followUpRequired: null, extraFollowUp: "", approvedServiceTime: "", monitoringDate: "", arrivalTime: "", departureTime: "", serviceStart: "", serviceEnd: "", programName: "", programType: "", todayAttendance: "", todayMeals: "", weekStart: "", history: [], menu: MENU.map(category => ({ category, applicable: true, item: "", serving: "" })), answers: {}, correctiveActions: {}, repeatedFindings: "", repeatedAction: "", comments: "", monitorName: monitor, coordinatorName: "", signatures: { monitor: null, coordinator: null } };
}
export function countValid(value) {
  return /^(0|[1-9]\d*)$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) <= 1000000;
}
export function average(history) {
  return history?.length === 5 && history.every(day => countValid(day.meals)) ? history.reduce((sum, day) => sum + Number(day.meals), 0) / 5 : null;
}
export function requiresCorrectiveAction(id, answer) {
  return id === "19" ? answer === "yes" : id !== "18a" && answer === "no";
}
export function applicableQuestions(data, form = OFFICIAL_FORM) {
  return form.questions.filter(q => !q.when || data.answers[q.when.id] === q.when.answer);
}
export function findings(data, form = OFFICIAL_FORM) {
  // Only configured, applicable questions may trigger findings.
  return applicableQuestions(data, form).filter(q => requiresCorrectiveAction(q.id, data.answers[q.id]));
}
export function validate(data, form = OFFICIAL_FORM) {
  const errors = [];
  const add = (section, field, message) => errors.push({ section, field, message });
  if (!validDate(data.monitoringDate)) add(0, "monitoringDate", "Enter a valid monitoring date.");
  const timeValid = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || "");
  ["arrivalTime", "departureTime"].forEach(field => { if (!timeValid(data[field])) add(0, field, `Enter the ${field === "arrivalTime" ? "arrival" : "departure"} time.`); });
  if (timeValid(data.arrivalTime) && timeValid(data.departureTime) && data.departureTime <= data.arrivalTime) add(0, "departureTime", "Departure must be after arrival. Review both times.");
  const dates = weekDates(data.weekStart);
  if (!dates.length || dates[0] !== data.weekStart || data.history.length !== 5) add(1, "weekStart", "Select one complete Monday–Friday week.");
  data.history.forEach((day, i) => {
    const name = DAYS[i] || "History day";
    if (!validDate(day.date) || day.date !== dates[i]) add(1, `date-${i}`, `${name} must match the selected week. Select the week again to restore its dates.`);
    if (day.date === data.monitoringDate) add(1, "weekStart", "The monitoring date cannot be one of the five history dates. Choose a different week.");
    if (!countValid(day.meals)) add(1, `meals-${i}`, `Enter ${name}'s Supper Meal Count as a whole number, including 0 when applicable.`);
    if (!countValid(day.attendance)) add(1, `attendance-${i}`, `Enter ${name}'s attendance as a whole number.`);
    else if (countValid(day.meals) && Number(day.attendance) <= Number(day.meals)) add(1, `attendance-${i}`, `Attendance must be higher than the Supper Meal Count. Please review ${name}.`);
  });
  if (new Set(data.history.map(d => d.date)).size !== data.history.length) add(1, "weekStart", "History dates must not repeat. Select the week again.");
  ["serviceStart", "serviceEnd"].forEach(field => { if (!timeValid(data[field])) add(2, field, "Enter the supper service start and end times."); });
  if (timeValid(data.serviceStart) && timeValid(data.serviceEnd) && data.serviceEnd <= data.serviceStart) add(2, "serviceEnd", "Service end must be after service start.");
  if (!data.programName.trim()) add(2, "programName", "Enter the ASP/program name.");
  ["todayAttendance", "todayMeals"].forEach(field => { if (!countValid(data[field])) add(2, field, `Enter today's ${field === "todayMeals" ? "Supper Meal Count" : "attendance"} as a whole number.`); });
  MENU.forEach((category, i) => {
    const item = data.menu[i];
    if (!item || item.category !== category || typeof item.applicable !== "boolean") add(3, `menu-${i}`, `Review the ${category} category.`);
    else if (item.applicable && (!item.item.trim() || !item.serving.trim())) add(3, `menu-${i}`, `Enter the specific ${category} item and serving size, or confirm it is not applicable.`);
  });
  if (!form.ready) add(4, "officialForm", "Official monitoring questions are awaiting the approved two-page form. Drafts can be saved; submission is unavailable.");
  if (!form.ready || applicableQuestions(data, form).some(q => !q.options.includes(data.answers[q.id]))) add(5, "findingsPending", "Complete the official monitoring questions before reviewing required corrective actions.");
  applicableQuestions(data, form).forEach(q => {
    if (!q.options.includes(data.answers[q.id])) add(4, `question-${q.id}`, `Answer question ${q.id} using one of its permitted responses.`);
    if (q.id === "18b" && data.answers["18b"] === "no" && (!data.repeatedFindings.trim() || !data.repeatedAction.trim())) add(5, "repeatedFindings", "For question 18b answered No, describe the repeated findings and action to be taken.");
  });
  findings(data, form).forEach(q => {
    const action = data.correctiveActions[q.id] || {};
    for (const field of ["description", "action", "training", "followUpPlan"]) if (!action[field]?.trim()) add(5, `action-${q.id}-${field}`, `Question ${q.id}: complete the non-compliance, corrective action, training/communication, and follow-up plan.`);
    for (const field of ["actionDate", "followUpDue"]) if (!validDate(action[field])) add(5, `action-${q.id}-${field}`, `Question ${q.id}: enter the action date and follow-up due date (within 60 operating days).`);
    if (validDate(action.followUpDue) && validDate(data.monitoringDate) && action.followUpDue < data.monitoringDate) add(5, `action-${q.id}-followUpDue`, `Question ${q.id}: follow-up cannot be due before the monitoring.`);
    if (action.followUpComplete && (!validDate(action.followUpDate) || !action.followUpNotes?.trim())) add(5, `action-${q.id}-followUpNotes`, `Question ${q.id}: enter the completed follow-up date and results.`);
  });
  if (!data.comments.trim()) add(6, "comments", 'A comment is always required. If there are no findings, enter "No Findings".');
  for (const role of ["monitor", "coordinator"]) {
    const name = role === "monitor" ? "Manager / Monitor" : "ASP Coordinator";
    if (!data[`${role}Name`].trim()) add(7, `${role}Name`, `Enter the ${name}'s printed name.`);
    const signature = data.signatures[role];
    if (!signature?.strokes?.some(stroke => stroke.length > 1) || !signature.acceptedAt || signature.printedName !== data[`${role}Name`].trim()) add(7, `${role}Signature`, `${name}: draw and accept your signature after confirming your printed name.`);
    if (!validDate(signature?.date)) add(7, `${role}Signature`, `${name}: enter the signature date.`);
    if (!signature?.pages?.includes(1) || !signature?.pages?.includes(2)) add(7, `${role}Signature`, `${name}: explicitly apply the accepted signature to both official pages.`);
  }
  if (!form.ready) add(9, "officialPdf", "The official PDF template and verified field mapping are required before submission.");
  if (typeof data.unannounced !== "boolean") add(0, "unannounced", "Confirm whether this visit was unannounced.");
  if (!data.approvedServiceTime?.trim()) add(2, "approvedServiceTime", "Enter the CDE-approved service time shown for this program.");
  if (!countValid(data.adultMeals)) add(2, "adultMeals", "Enter adult meals as a whole number, including 0 if none.");
  if (typeof data.followUpRequired !== "boolean") add(5, "followUpRequired", "Confirm whether follow-up is required.");
  if (findings(data, form).length) {
    if (!validDate(data.correctiveActionDue)) add(5, "correctiveActionDue", "Enter the date by which corrective action will be completed.");
    if (validDate(data.correctiveActionDue) && data.correctiveActionDue < data.monitoringDate) add(5, "correctiveActionDue", "The corrective-action deadline cannot precede the monitoring date.");
    if (data.followUpRequired !== true) add(5, "followUpRequired", "These answers require follow-up within 60 operating days. Choose Yes.");
  } else if (data.followUpRequired && !data.extraFollowUp?.trim()) add(5, "extraFollowUp", "Describe the required follow-up.");
  findings(data, form).forEach(q => {
    const action = data.correctiveActions[q.id] || {};
    if (!countValid(action.operatingDays) || Number(action.operatingDays) < 1 || Number(action.operatingDays) > 60 || action.calendarConfirmed !== true) add(5, `action-${q.id}-operatingDays`, `Question ${q.id}: confirm the school calendar and enter 1–60 operating days to follow-up. Do not count closed days.`);
  });
  for (const role of ["monitor", "coordinator"]) {
    if (!/^[a-f0-9]{64}$/.test(data.signatures[role]?.contentHash || "")) add(7, `${role}Signature`, "Review this report and accept the signature for its current content.");
  }
  return errors;
}
