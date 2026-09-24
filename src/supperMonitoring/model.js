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
export function newDraft(monitor = "", role = "manager") {
  return { schemaVersion: 1, guidedVersion: 3, schoolYear: schoolYear(localDate()), monitoringSlot: role === "supervisor" ? "supervisor" : "manager_1", unannounced: true, adultMeals: "0", serviceTimes: [], todayAttendanceConfirmed: "", historyVerified: "", correctiveActionDue: "", followUpRequired: null, extraFollowUp: "", approvedServiceTime: "", monitoringDate: "", arrivalTime: "", departureTime: "", serviceStart: "", serviceEnd: "", programName: "", programType: "", todayAttendance: "", todayMeals: "", weekStart: "", history: [], menu: MENU.map(category => ({ category, applicable: true, item: "", serving: "" })), answers: {}, correctiveActions: {}, repeatedFindings: "", repeatedAction: "", comments: "", monitorName: monitor, coordinatorName: "", signatures: { monitor: null, coordinator: null } };
}
export const SERVICE_DAYS = [...DAYS, "Saturday", "Sunday"];
export const timeValid = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || "");
export function monitoringDay(date) {
  return validDate(date) ? SERVICE_DAYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7] : "";
}
export function displayTime(value) {
  if (!timeValid(value)) return value || "";
  const [hour, minute] = value.split(":");
  return `${Number(hour) % 12 || 12}:${minute} ${Number(hour) < 12 ? "AM" : "PM"}`;
}
export function attendanceKey(date, meals, attendance) { return `${date}|${meals}|${attendance}`; }
export function serviceEnd(start) {
  if (!timeValid(start)) return "";
  const [h, m] = start.split(":").map(Number);
  const end = h * 60 + m + 30;
  return `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}
export function historyKey(history) { return JSON.stringify(history.map(({date, meals, attendance}) => [date, String(meals), String(attendance)])); }
export function repeatedHistory(history) {
  if (history?.length !== 5 || !history.every(d => countValid(d.meals) && Number(d.meals) > 0 && countValid(d.attendance))) return false;
  const columns = ["meals", "attendance"].map(key => history.map(d => Number(d[key])));
  return columns.some(values => values.some(v => values.filter(n => n === v).length >= 4)) || columns.every(values => Math.max(...values) - Math.min(...values) <= 1);
}
export function changeDraft(current, field, value) {
  const next = { ...current, [field]: value };
  if (["todayMeals", "todayAttendance", "monitoringDate"].includes(field)) next.todayAttendanceConfirmed = "";
  if (field === "monitorName" || field === "coordinatorName") {
    const role = field === "monitorName" ? "monitor" : "coordinator";
    next.signatures = {...current.signatures, [role]: null};
  } else if (field !== "signatures" && field !== "questionCursor") next.signatures = {monitor:null, coordinator:null};
  return next;
}
export function observedServices(data) {
  return (data.serviceTimes || []).filter(row => row.day === monitoringDay(data.monitoringDate) && row.observed === true);
}
// Upgrade editable legacy drafts without claiming their generic service hours were CDE-approved.
export function resumeDraft(payload) {
  const data = { ...newDraft(), ...payload };
  if (!Array.isArray(payload.serviceTimes)) {
    data.serviceTimes = payload.programName || payload.serviceStart || payload.approvedServiceTime ? [{ program: payload.programName || "", day: monitoringDay(payload.monitoringDate), start: payload.serviceStart || "", end: payload.serviceEnd || "", observed: true, needsConfirmation: true }] : [];
    data.legacyServiceTime = payload.approvedServiceTime || "";
    data.signatures = { monitor: null, coordinator: null };
  }
  data.serviceTimes = data.serviceTimes.map(row => ({...row, end: serviceEnd(row.start)}));
  if (payload.guidedVersion !== 3) data.signatures = { monitor: null, coordinator: null };
  return { ...data, schemaVersion: 1, guidedVersion: 3, unannounced: true, adultMeals: "0" };
}
export const ZERO_HISTORY_MESSAGE = "This week cannot be used because one or more days has a Supper meal count of 0. Select a different Monday-Friday week with five days of Supper meal history.";
export function countValid(value) {
  return /^(0|[1-9]\d*)$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) <= 1000000;
}
export function average(history) {
  return history?.length === 5 && history.every(day => countValid(day.meals)) ? Math.round(history.reduce((sum, day) => sum + Number(day.meals), 0) / 5) : null;
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
  if (!/^\d{4}-\d{2}$/.test(data.schoolYear || "") || String(Number(data.schoolYear?.slice(0,4)) + 1).slice(-2) !== data.schoolYear?.slice(-2)) add(0, "schoolYear", "Choose a valid school year, such as 2026-27.");
  else if (validDate(data.monitoringDate) && schoolYear(data.monitoringDate) !== data.schoolYear) add(0, "schoolYear", "Monitoring date must be in the selected school year.");
  if (!["manager_1","manager_2","supervisor"].includes(data.monitoringSlot)) add(0, "monitoringSlot", "Choose a monitoring slot.");
  ["arrivalTime", "departureTime"].forEach(field => { if (!timeValid(data[field])) add(0, field, `Enter the ${field === "arrivalTime" ? "arrival" : "departure"} time.`); });
  if (timeValid(data.arrivalTime) && timeValid(data.departureTime) && data.departureTime <= data.arrivalTime) add(0, "departureTime", "Departure must be after arrival. Review both times.");
  const services = Array.isArray(data.serviceTimes) ? data.serviceTimes : [];
  if (!services.length) add(0, "serviceTimes", "Add the CDE-approved Supper service times for the After School Program.");
  services.forEach((row, i) => {
    if (!row.program?.trim()) add(0, `program-${i}`, "Enter the After School Program name.");
    if (!SERVICE_DAYS.includes(row.day)) add(0, `day-${i}`, "Choose the day of week for this approved service time.");
    if (!timeValid(row.start)) add(0, `start-${i}`, "Enter the CDE-approved service start time.");
    if (row.end !== serviceEnd(row.start)) add(0, `end-${i}`, "Service end must be exactly 30 minutes after its start. Reopen this draft to recalculate.");
    if (timeValid(row.start) && timeValid(row.end) && row.end <= row.start) add(0, `end-${i}`, "CDE-approved service end must be after its start time.");
    if (row.needsConfirmation) add(0, `service-${i}`, "Confirm the CDE-approved times copied from this older draft.");
  });
  const observed = observedServices(data);
  if (validDate(data.monitoringDate) && !observed.length) add(0, "serviceTimes", `Select at least one After School Program observed on ${monitoringDay(data.monitoringDate)}. Add that day's approved times if needed.`);
  observed.forEach(service => {
    const row = {...service, end: serviceEnd(service.start)};
    if (timeValid(row.start) && timeValid(data.arrivalTime) && data.arrivalTime >= row.start) add(0, "arrivalTime", `Arrival must be before the approved Supper service start time of ${displayTime(row.start)} (${row.program}, ${row.day}).`);
    if (timeValid(row.end) && timeValid(data.departureTime) && data.departureTime <= row.end) add(0, "departureTime", `Departure must be after the approved Supper service end time of ${displayTime(row.end)} (${row.program}, ${row.day}).`);
  });
  const dates = weekDates(data.weekStart);
  if (!dates.length || dates[0] !== data.weekStart || data.history.length !== 5) add(1, "weekStart", "Select one complete Monday–Friday week.");
  data.history.forEach((day, i) => {
    const name = DAYS[i] || "History day";
    if (!validDate(day.date) || day.date !== dates[i]) add(1, `date-${i}`, `${name} must match the selected week. Select the week again to restore its dates.`);
    if (day.date === data.monitoringDate) add(1, "weekStart", "The monitoring date cannot be one of the five history dates. Choose a different week.");
    if (!countValid(day.meals)) add(1, `meals-${i}`, `Enter ${name}'s Supper Meal Count as a positive whole number.`);
    if (countValid(day.meals) && Number(day.meals) === 0) add(1, `meals-${i}`, ZERO_HISTORY_MESSAGE);
    if (!countValid(day.attendance)) add(1, `attendance-${i}`, `Enter ${name}'s attendance as a whole number.`);
    else if (countValid(day.meals) && Number(day.attendance) < Number(day.meals)) add(1, `attendance-${i}`, "Attendance cannot be lower than the Supper meal count. Verify the attendance and Community Roster.");
    if (countValid(day.meals) && Number(day.meals) > 0 && Number(day.attendance) === Number(day.meals) && day.attendanceConfirmed !== attendanceKey(day.date, day.meals, day.attendance)) add(1, `attendance-${i}`, "Verify the attendance and Community Roster, then confirm these equal numbers are correct.");
  });
  if (repeatedHistory(data.history) && data.historyVerified !== historyKey(data.history)) add(1, "historyVerified", "Double-check the repeated 5-Day History counts, then select I Verified These Numbers.");
  if (new Set(data.history.map(d => d.date)).size !== data.history.length) add(1, "weekStart", "History dates must not repeat. Select the week again.");
  ["todayAttendance", "todayMeals"].forEach(field => { if (!countValid(data[field])) add(2, field, `Enter today's ${field === "todayMeals" ? "Supper Meal Count" : "attendance"} as a whole number.`); });
  if (countValid(data.todayMeals) && countValid(data.todayAttendance)) {
    if (Number(data.todayAttendance) < Number(data.todayMeals)) add(2, "todayAttendance", "Attendance cannot be lower than the Supper meal count. Verify the attendance and Community Roster.");
    if (Number(data.todayAttendance) === Number(data.todayMeals) && data.todayAttendanceConfirmed !== attendanceKey(data.monitoringDate, data.todayMeals, data.todayAttendance)) add(2, "todayAttendance", "Verify the attendance and Community Roster, then confirm these equal numbers are correct.");
  }
  MENU.forEach((category, i) => {
    const item = data.menu[i];
    if (!item || item.category !== category || typeof item.applicable !== "boolean") add(3, `menu-${i}`, `Review the ${category} category.`);
    else if (item.applicable && (!!item.item.trim() !== !!item.serving.trim())) add(3, `menu-${i}`, `Enter the specific ${category} item and serving size, or confirm it is not applicable.`);
  });
  if (!form.ready) add(4, "officialForm", "Official monitoring questions are awaiting the approved two-page form. Drafts can be saved; submission is unavailable.");
  if (!form.ready || applicableQuestions(data, form).some(q => !q.options.includes(data.answers[q.id]))) add(5, "findingsPending", "Complete the official monitoring questions before reviewing required corrective actions.");
  applicableQuestions(data, form).forEach(q => {
    if (!q.options.includes(data.answers[q.id])) add(4, `question-${q.id}`, `Answer question ${q.id} using one of its permitted responses.`);
    if (q.id === "18b" && data.answers["18b"] === "no" && (!data.repeatedFindings.trim() || !data.repeatedAction.trim())) add(4, "repeatedFindings", "For question 18b answered No, describe the repeated findings and action to be taken.");
  });
  findings(data, form).forEach(q => {
    const action = data.correctiveActions[q.id] || {};
    for (const field of ["description", "action", "training", "followUpPlan"]) if (!action[field]?.trim()) add(["18b", "19", "20"].includes(q.id) ? 4 : 5, `action-${q.id}-${field}`, `Question ${q.id}: complete the non-compliance, corrective action, training/communication, and follow-up plan.`);
    for (const field of ["actionDate", "followUpDue"]) if (!validDate(action[field])) add(["18b", "19", "20"].includes(q.id) ? 4 : 5, `action-${q.id}-${field}`, `Question ${q.id}: enter the action date and follow-up due date (within 60 operating days).`);
    if (validDate(action.followUpDue) && validDate(data.monitoringDate) && action.followUpDue < data.monitoringDate) add(["18b", "19", "20"].includes(q.id) ? 4 : 5, `action-${q.id}-followUpDue`, `Question ${q.id}: follow-up cannot be due before the monitoring.`);
    if (action.followUpComplete && (!validDate(action.followUpDate) || !action.followUpNotes?.trim())) add(["18b", "19", "20"].includes(q.id) ? 4 : 5, `action-${q.id}-followUpNotes`, `Question ${q.id}: enter the completed follow-up date and results.`);
  });
  if (!data.comments.trim()) add(6, "comments", 'A comment is always required. If there are no findings, enter "No Findings".');
  for (const role of ["monitor", "coordinator"]) {
    const name = role === "monitor" ? (data.monitoringSlot === "supervisor" ? "Supervisor / AFSS" : "Manager / Monitor") : "After School Program Coordinator";
    if (!data[`${role}Name`].trim()) add(7, `${role}Name`, `Enter the ${name}'s printed name.`);
    const signature = data.signatures[role];
    if (!signature?.strokes?.some(stroke => stroke.length > 1) || !signature.acceptedAt || signature.printedName !== data[`${role}Name`].trim()) add(7, `${role}Signature`, `${name}: draw and accept your signature after confirming your printed name.`);
    if (!validDate(signature?.date)) add(7, `${role}Signature`, `${name}: enter the signature date.`);
    if (!signature?.pages?.includes(1) || !signature?.pages?.includes(2)) add(7, `${role}Signature`, `${name}: explicitly apply the accepted signature to both official pages.`);
  }
  if (!form.ready) add(9, "officialPdf", "The official PDF template and verified field mapping are required before submission.");
  if (typeof data.followUpRequired !== "boolean") add(5, "followUpRequired", "Confirm whether follow-up is required.");
  if (findings(data, form).length) {
    if (!validDate(data.correctiveActionDue)) add(5, "correctiveActionDue", "Enter the date by which corrective action will be completed.");
    if (validDate(data.correctiveActionDue) && data.correctiveActionDue < data.monitoringDate) add(5, "correctiveActionDue", "The corrective-action deadline cannot precede the monitoring date.");
    if (data.followUpRequired !== true) add(5, "followUpRequired", "These answers require follow-up within 60 operating days. Choose Yes.");
  } else if (data.followUpRequired && !data.extraFollowUp?.trim()) add(5, "extraFollowUp", "Describe the required follow-up.");
  findings(data, form).forEach(q => {
    const action = data.correctiveActions[q.id] || {};
    if (!countValid(action.operatingDays) || Number(action.operatingDays) < 1 || Number(action.operatingDays) > 60 || action.calendarConfirmed !== true) add(["18b", "19", "20"].includes(q.id) ? 4 : 5, `action-${q.id}-operatingDays`, `Question ${q.id}: confirm the school calendar and enter 1–60 operating days to follow-up. Do not count closed days.`);
  });
  for (const role of ["monitor", "coordinator"]) {
    if (!/^[a-f0-9]{64}$/.test(data.signatures[role]?.contentHash || "")) add(7, `${role}Signature`, "Review this report and accept the signature for its current content.");
  }
  return errors;
}
