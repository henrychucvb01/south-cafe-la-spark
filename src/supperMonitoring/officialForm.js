// User-supplied 2022-09-08 PDF; printed revision 9-5-2019.
// Shaded N/A cells are not response options.
export const TEMPLATE_VERSION = "lausd-supper-2022-09-08";
export const TEMPLATE_SHA256 = "46a38e329dde0f31e3d70d5e66ebeb161062be5f0fa2da3f1de789b65359e876";
export const QUESTION_TEXT = [
  "Does the menu as served meet CACFP requirements?",
  "Is enough food served or available to each participant with required portions?",
  "Does the posted menu match what was served today?",
  "Are requests or medical statements kept on file for participants requesting dietary accommodations?",
  "If non-dairy beverages are offered for non-disabled participants, are they nutritionally equivalent to milk?",
  "Are dietary accommodations for participants with disabilities followed as prescribed in the medical statement?",
  "Is drinking water available to children throughout the day, including meal times?",
  "Do all participants receive the same meal regardless of race, color, national origin, sex, age, or disability?",
  "Menu production records for the 5-day history reconciliation (above) and for today, are completed for all meals served.",
  "Are all meals consumed on the facility or under staff supervison?",
  "Are meal counts taken and recorded at the time of each meal service?",
  "Are the correct Supper Program forms being used to record meals served?",
  "Do attendance records support the meal counts today and for the five-day history reconciliation (above)?",
  "Do the meal counts for the five-day history reconciliation appear reasonable when compared to today's counts?",
  "Is a civil rights poster(s) placed in a prominent location(s) in public view at this facility?",
  "Is the facility safe and sanitary?",
  "Have FSD and ASP staff attended the training sessions on the CACFP for the current program year?",
  "Were there problems noted in the prior site review?",
  'If 18a is "Yes," have the problems noted in the prior review been corrected? If the answer here is "No," describe the repeated findings on page 2 and the action to be taken. (Conduct a follow-up review within 60 operating days.)',
  "Does this visit indicate that training is necessary at this facility? (If training is needed, state when and how it will be provided on page 2.)",
  "Facility appears to be in compliance."
];
const ids = [...Array.from({ length: 17 }, (_, i) => String(i + 1)), "18a", "18b", "19", "20"];
const tips = {
  "4": "N/A is available on the official form for this question.",
  "13": "Compare attendance and meal-count records for today and every day in the history week.",
  "14": "Compare today's meal count with the five-day average shown in your history section.",
  "18a": "Review the prior monitoring. No means no prior problems were noted; it does not itself require corrective action. Yes opens 18b.",
  "18b": "Yes means the prior problems were corrected. No requires repeated findings, action to be taken, and follow-up within 60 operating days. If 18a is No, SPARK marks 18b N/A.",
  "19": "Yes means training is needed. State when and how it will be provided and plan follow-up within 60 operating days. No does not itself require corrective action.",
  "20": "Make an overall assessment. Review any findings before choosing Yes. No requires corrective action and follow-up within 60 operating days."
};
export const OFFICIAL_FORM = Object.freeze({ version: TEMPLATE_VERSION, ready: true, questions: ids.map((id, i) => ({ id, text: QUESTION_TEXT[i], options: id === "4" ? ["yes", "no", "na"] : ["yes", "no"], tip: tips[id] || "", ...(id === "18b" ? { when: { id: "18a", answer: "yes" } } : {}) })) });
export function canonicalReport(data) {
  function ordered(value) {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]));
    return value;
  }
  const { signatures, questionCursor, ...report } = data;
  // Each signer attests their own printed name independently.
  if (data.guidedVersion >= 3) { delete report.monitorName; delete report.coordinatorName; }
  return JSON.stringify(ordered(report));
}
