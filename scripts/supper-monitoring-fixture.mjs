import { createHash } from "node:crypto";
import { newDraft, weekDates, QUESTION_IDS } from "../src/supperMonitoring/model.js";
import { canonicalReport } from "../src/supperMonitoring/officialForm.js";
export function signFixture(data) {
  const contentHash = createHash("sha256").update(canonicalReport(data)).digest("hex");
  for (const role of ["monitor", "coordinator"]) data.signatures[role] = { printedName: data[`${role}Name`], date: "2026-09-23", acceptedAt: "2026-09-23T20:00:00Z", pages: [1,2], contentHash, aspectRatio: 3, strokes: [[[0.1,0.6],[0.2,0.2],[0.3,0.7],[0.45,0.3],[0.5,0.6],[0.8,0.4]]], method: "this-device" };
  return data;
}
export function makeFixture(withFindings = false) {
  const data = newDraft("TEST Monitor");
  Object.assign(data, { schoolYear: "2026-27", unannounced: true, monitoringDate: "2026-09-23", arrivalTime: "14:00", departureTime: "16:00", serviceStart: "14:30", serviceEnd: "15:30", approvedServiceTime: "14:30-15:30", todayMeals: "100", todayAttendance: "110", adultMeals: "0", programName: "TEST ASP Program", weekStart: "2026-09-14", comments: "No Findings", coordinatorName: "TEST Coordinator", followUpRequired: false });
  data.history = weekDates(data.weekStart).map((date,i) => ({ date, meals: String(96+i), attendance: "110" }));
  data.menu = data.menu.map((row,i) => ({ ...row, applicable: i < 5, item: ["Low-fat milk","Chicken","Whole-grain roll","Apple slices","Carrots","",""][i], serving: ["8 fl oz","2 oz","1 each","1/2 cup","1/2 cup","",""][i] }));
  data.answers = Object.fromEntries(QUESTION_IDS.map(id => [id, id === "18a" || id === "19" ? "no" : id === "18b" || id === "4" ? "na" : "yes"]));
  if (withFindings) {
    Object.assign(data, { followUpRequired: true, comments: "Training and repeat finding documented below.", correctiveActionDue: "2026-09-25", repeatedFindings: "Meal-count recording problem continued.", repeatedAction: "Observe staff at the point of service." });
    Object.assign(data.answers, { "18a": "yes", "18b": "no", "19": "yes", "20": "no" });
    for (const id of ["18b","19","20"]) data.correctiveActions[id] = { description: id === "19" ? "Staff need refresher training." : "Recording practice needs correction.", action: "Reviewed procedure with staff.", training: "In-person practice on 09/23/26.", actionDate: "2026-09-23", followUpDue: "2026-09-25", followUpPlan: "Observe service.", operatingDays: "2", calendarConfirmed: true, followUpComplete: false };
  }
  return signFixture(data);
}
