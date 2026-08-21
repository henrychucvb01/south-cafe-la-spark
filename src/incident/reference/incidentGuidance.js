/*
  SOUTH CAFÉ LA — SPARK
  incidentGuidance.js

  PURPOSE
  -------
  Provides manager-facing reference guidance for the Incident Record Helper.

  IMPORTANT
  ---------
  - This is a reference assistant, not an HR decision-maker.
  - It does not determine discipline.
  - It does not declare that a policy violation occurred.
  - Managers must document facts and consult AFSS/HR when appropriate.
  - The corrective-action chart is guidance, not a statement of policy.

  SOURCE MATERIAL USED TO BUILD THIS REFERENCE
  --------------------------------------------
  1. LAUSD Food Services Division Employee Handbook, Rev. 2019–2020
  2. Food Services Division Steps for Corrective Action & Progressive Discipline

  Keep this file separate from IncidentRecordHelper.js so the guidance
  can be improved without repeatedly rewriting the main page.
*/

export const INCIDENT_GUIDANCE_VERSION = "1.0";

// ---------------------------------------------------------
// SHARED MANAGER COACHING
// ---------------------------------------------------------

const GENERAL_DOCUMENTATION_COACHING = [
  "Describe what you personally observed or what was directly reported to you.",
  "Use specific actions, words, dates, times, and directions instead of labels such as 'bad attitude,' 'lazy,' or 'disrespectful.'",
  "If a directive was given, document the directive and how the employee responded.",
  "Document the impact on service, safety, students, staff, or operations when applicable.",
  "Document what assistance, clarification, coaching, retraining, or opportunity to improve was provided.",
  "Do not speculate about the employee's intent, motive, or emotions.",
];

const GENERAL_ASSISTANCE_SUGGESTIONS = [
  "Restate the work expectation clearly and confirm that the employee understands it.",
  "Ask whether the employee needs clarification, instruction, training, equipment, or other assistance to meet the expectation.",
  "Provide coaching or retraining when the issue may involve a lack of understanding or skill.",
  "Give the employee an opportunity to explain relevant circumstances before reaching conclusions.",
  "State what improvement is expected going forward and, when appropriate, when you will follow up.",
  "Document the assistance or guidance actually offered. Do not state that assistance was provided if it was not.",
];

// ---------------------------------------------------------
// GUIDANCE DATABASE
// ---------------------------------------------------------

export const INCIDENT_GUIDANCE = {
  "Insubordination": {
    id: "insubordination",
    title: "Insubordination / Willful Disobedience",
    pcRule: "PC Rule 902A(3)",
    referenceType: "Corrective Action / Progressive Discipline Reference",
    referenceSummary:
      "The FSD corrective-action reference describes insubordination or willful disobedience as refusal to follow directives from a higher-ranking staff member.",
    managerFocus: [
      "What specific directive was given?",
      "Who gave the directive?",
      "Was the directive clearly communicated?",
      "What exactly did the employee say or do in response?",
      "Was the employee given clarification or another opportunity to comply?",
      "Did the situation involve HACCP, sanitation, temperature logs, or another health/safety concern?",
    ],
    assistanceSuggestions: [
      "Restate the directive in clear and specific terms.",
      "Explain the operational, service, or safety reason for the directive when appropriate.",
      "Ask the employee whether the direction is understood and whether clarification is needed.",
      "If appropriate, give the employee another opportunity to follow the directive.",
      "Document the employee's response and any assistance or clarification provided.",
    ],
    severityNotes: [
      "The reference chart treats occurrence history and seriousness as relevant considerations.",
      "The chart specifically identifies heightened concern when alleged insubordination endangers the life, health, or safety of students, staff, or the public, including HACCP, sanitation, or temperature-log situations.",
    ],
    hrFlag:
      "Consult AFSS/HR when the conduct may require corrective or disciplinary action, particularly when safety is involved.",
  },

  "Dereliction of Duties": {
    id: "dereliction",
    title: "Inattention to / Dereliction of Duty",
    pcRule: "PC Rule 902A(4)",
    referenceType: "Corrective Action / Progressive Discipline Reference",
    referenceSummary:
      "The FSD corrective-action reference describes this category as purposeful or accidental failure to perform an obligation.",
    managerFocus: [
      "What job duty or assignment was expected?",
      "How was the expectation communicated?",
      "Was the employee trained or previously instructed on the task?",
      "What specifically was not completed or performed?",
      "Was the employee engaged in another activity instead of the assigned duty?",
      "What effect did the failure have on operations?",
      "Did it create a HACCP, sanitation, safety, or significant financial concern?",
    ],
    assistanceSuggestions: [
      "Review the specific job expectation with the employee.",
      "Confirm that the employee understands how and when the task must be completed.",
      "Provide instruction, demonstration, or retraining if a knowledge or skill gap may exist.",
      "Ask whether there is an obstacle preventing the employee from completing the assignment.",
      "Set a clear expectation for future performance and follow up when appropriate.",
    ],
    severityNotes: [
      "The reference distinguishes ordinary performance concerns from failures that may endanger health or safety or cause major financial loss.",
      "Occurrence history may affect the appropriate level of review.",
    ],
    hrFlag:
      "Consult AFSS/HR when the issue is repeated, serious, safety-related, or may require action beyond routine coaching/documentation.",
  },

  "Rude and Discourteous Behavior": {
    id: "discourteous",
    title: "Discourteous / Abusive / Threatening Treatment",
    pcRule: "PC Rule 902A(5)",
    referenceType: "Corrective Action / Progressive Discipline Reference",
    referenceSummary:
      "The FSD reference includes discourteous behavior, abusive conduct, or threatening treatment of employees, students, or the public. Examples in the chart include yelling, combative or argumentative behavior, disrespectful conduct, derogatory remarks, obscenities, profanity, harassment, bullying, and threats.",
    managerFocus: [
      "What behavior was actually observed?",
      "What exact words were used, if remembered?",
      "Who was present?",
      "Who was the behavior directed toward?",
      "Was there yelling, profanity, a threat, physical intimidation, harassment, or bullying?",
      "How did the behavior affect the workplace, service, students, or staff?",
    ],
    assistanceSuggestions: [
      "Describe the behavior rather than labeling the employee's attitude.",
      "Remind the employee of the expectation for professional and respectful workplace conduct.",
      "Identify the specific behavior that needs to change.",
      "Allow the employee to respond and explain relevant circumstances.",
      "State the expected professional behavior going forward.",
    ],
    severityNotes: [
      "The reference chart differentiates conduct such as yelling or argumentative behavior from more serious conduct such as derogatory remarks, obscenities, harassment, bullying, threats of violence, or physical harm.",
      "Threats, violence, harassment, or other serious conduct may require immediate escalation rather than ordinary coaching.",
    ],
    hrFlag:
      "Contact AFSS/HR promptly for threats, violence, harassment, bullying, physical harm, or other serious conduct.",
  },

  "Cell Phone / Electronics": {
    id: "electronics",
    title: "Cell Phone / Personal Electronics",
    pcRule: "PC Rule 902A(6) reference may apply depending on facts",
    referenceType: "Handbook + Corrective Action Reference",
    referenceSummary:
      "The FSD corrective-action chart gives willful use of cell phones, ear pods, or other personal electronic devices while working in the kitchen as an example under willful/persistent violation of rules or procedures.",
    managerFocus: [
      "What device was being used?",
      "Where was the employee when the device was used?",
      "Was the employee actively working or on an authorized break?",
      "What did you personally observe?",
      "Had the expectation been communicated previously?",
      "Did the device use interfere with assigned duties or create a safety/sanitation concern?",
    ],
    assistanceSuggestions: [
      "Review the applicable workplace expectation for personal electronic devices.",
      "Clarify when and where personal device use is permitted.",
      "Ask whether the employee understands the expectation.",
      "Direct the employee to put the device away when appropriate.",
      "Document prior coaching only if it actually occurred.",
    ],
    severityNotes: [
      "Repeated or persistent behavior may be treated differently from an isolated incident.",
      "The manager should document the actual conduct rather than automatically treating every device issue as the same level of concern.",
    ],
    hrFlag:
      "Consult AFSS/HR for repeated or persistent violations or when more formal action may be considered.",
  },

  "Safety / Sanitation": {
    id: "safety",
    title: "Health / Safety / Sanitation",
    pcRule: "PC Rule 902A(21) and related FSD safety requirements",
    referenceType: "Handbook + Corrective Action Reference",
    referenceSummary:
      "The FSD corrective-action reference addresses willful or persistent violation or failure to enforce health and safety regulations/procedures and distinguishes minor safety violations from conduct that endangers students, staff, or the public.",
    managerFocus: [
      "What safety or sanitation requirement was involved?",
      "What was actually observed?",
      "Was there an immediate hazard?",
      "Were students, staff, or the public potentially endangered?",
      "Was food safety, HACCP, sanitation, PPE, or another required procedure involved?",
      "Was the employee previously trained on the requirement?",
      "What immediate corrective action was taken?",
    ],
    assistanceSuggestions: [
      "Stop or correct an unsafe practice immediately when necessary.",
      "Explain the applicable safety or sanitation expectation.",
      "Retrain the employee on the correct procedure when appropriate.",
      "Demonstrate the correct procedure if needed.",
      "Confirm understanding before the employee resumes the affected task.",
      "Document the retraining or assistance actually provided.",
    ],
    severityNotes: [
      "The reference chart distinguishes a minor safety violation from a situation that endangers the health and safety of students, staff, or the public.",
      "The handbook also emphasizes employee health, food safety, and manager responsibility for safe operations.",
    ],
    hrFlag:
      "Immediately involve the appropriate supervisor/AFSS when there is a significant or continuing health or safety risk. Consult HR as appropriate.",
  },

  "Temperature Logs": {
    id: "temperature",
    title: "Temperature Logs / HACCP Documentation",
    pcRule: "Potential PC Rule 902A(3), 902A(4), 902A(21), depending on facts",
    referenceType: "FSD Safety / Corrective Action Reference",
    referenceSummary:
      "The corrective-action reference specifically identifies HACCP, sanitation, and temperature-log issues as potentially serious when refusal or failure creates a health or safety risk.",
    managerFocus: [
      "Which temperature log or HACCP record was involved?",
      "What entry or required action was missing or incorrect?",
      "Was the employee trained on the procedure?",
      "Was the employee directed to complete or correct the record?",
      "Did the employee refuse, forget, misunderstand, or otherwise fail to complete the requirement?",
      "Was food safety potentially affected?",
    ],
    assistanceSuggestions: [
      "Review the required temperature-log or HACCP procedure with the employee.",
      "Demonstrate how the record should be completed when retraining is appropriate.",
      "Explain why accurate and timely temperature documentation is important to food safety.",
      "Confirm that the employee understands the requirement.",
      "Document retraining and any direction given.",
    ],
    severityNotes: [
      "SPARK should not automatically label every missing log as insubordination.",
      "The facts matter: refusal to follow a clear directive is different from an accidental error, lack of training, or performance issue.",
      "Food-safety impact increases the seriousness of the situation.",
    ],
    hrFlag:
      "Escalate significant food-safety concerns to the appropriate supervisor/AFSS and consult HR when corrective or disciplinary action may be needed.",
  },

  "Attendance": {
    id: "attendance",
    title: "Attendance / Tardiness",
    pcRule: "PC Rule 902A(14), 902A(15), 902A(18) may apply depending on facts",
    referenceType: "Handbook + Corrective Action Reference",
    referenceSummary:
      "The FSD materials contain specific guidance for unprotected unexcused or unscheduled absences and tardiness, patterns of absence, and absence without leave. Protected leave issues must be distinguished from ordinary attendance concerns.",
    managerFocus: [
      "Was the issue an absence, tardiness, early departure, or failure to report?",
      "Was notice provided according to the required call-in procedure?",
      "Was the absence approved or scheduled in advance?",
      "Is there an established pattern that is relevant to the concern?",
      "Could the absence involve protected leave or another protected circumstance?",
      "Are the dates and attendance history accurately documented?",
    ],
    assistanceSuggestions: [
      "Review the call-in, attendance, and scheduling expectations with the employee.",
      "Make sure the employee understands how and when to notify the work location.",
      "Ask whether there is information the employee needs to provide regarding the absence.",
      "When circumstances may involve protected leave, follow the appropriate leave process rather than assuming misconduct.",
      "Document attendance dates accurately and maintain required attendance records.",
    ],
    severityNotes: [
      "Attendance guidance depends heavily on the number, timing, type, and protected/unprotected status of absences or tardies.",
      "SPARK should not recommend discipline based solely on an absence count without appropriate review.",
    ],
    hrFlag:
      "Consult AFSS/HR when attendance patterns may require formal action or when protected leave status is uncertain.",
  },

  "Theft": {
    id: "theft",
    title: "Dishonesty / Theft / District Property",
    pcRule: "PC Rule 902A(7) and/or 902A(22), depending on facts",
    referenceType: "Handbook + Corrective Action Reference",
    referenceSummary:
      "The FSD handbook prohibits theft, pilfering, forgery, falsification of records, and other acts of dishonesty. The corrective-action chart separately addresses work-related dishonesty and unauthorized use of District or student-body property.",
    managerFocus: [
      "What property, food, supplies, money, or record was involved?",
      "What did you personally observe?",
      "Is there documentation, video, inventory information, transaction information, or a witness?",
      "Was the property actually removed, used, altered, or claimed improperly?",
      "What did the employee say when asked about the facts?",
      "Avoid describing conduct as theft unless the facts support that conclusion.",
    ],
    assistanceSuggestions: [
      "Preserve relevant records or evidence according to established procedures.",
      "Document observations separately from assumptions or conclusions.",
      "Allow the employee to respond to the factual concern.",
      "Do not promise an outcome or determine discipline through SPARK.",
    ],
    severityNotes: [
      "Dishonesty, falsification, unauthorized use, and theft can involve different facts and different levels of seriousness.",
      "These matters may require supervisory or HR involvement early in the process.",
    ],
    hrFlag:
      "Contact AFSS/HR for suspected theft, falsification, fraud, or other significant dishonesty before deciding on formal action.",
  },

  "Drug or Alcohol Use": {
    id: "drug-alcohol",
    title: "Drug / Alcohol Concern",
    pcRule: "PC Rule 902A(8) and applicable District/FSD requirements",
    referenceType: "Handbook + Corrective Action Reference",
    referenceSummary:
      "The FSD materials address employees appearing under the effects of alcohol or drugs. Documentation should focus on observable speech, behavior, appearance, or other factual information rather than unsupported conclusions.",
    managerFocus: [
      "What specific behavior, speech, appearance, odor, or other observable fact created the concern?",
      "Who observed the behavior?",
      "When and where did it occur?",
      "Was there an immediate safety concern?",
      "What supervisory action was taken?",
    ],
    assistanceSuggestions: [
      "Focus documentation on specific observable facts.",
      "Do not diagnose intoxication or substance use based only on an assumption.",
      "Follow required supervisory procedures for reasonable-suspicion or safety concerns.",
      "Keep the matter appropriately confidential.",
    ],
    severityNotes: [
      "This category can involve immediate safety and procedural requirements.",
      "SPARK should not instruct a manager to conduct testing or make a medical conclusion on its own.",
    ],
    hrFlag:
      "Contact AFSS/appropriate management or HR promptly when an employee appears impaired or there is a drug/alcohol workplace concern.",
  },

  "Fight": {
    id: "fight",
    title: "Fight / Physical Altercation / Workplace Violence",
    pcRule: "Serious incident — applicable violence and conduct rules may apply",
    referenceType: "Handbook / District Incident Reporting Guidance",
    referenceSummary:
      "The handbook identifies fighting, altercations, threats, disruptive behavior, and related serious incidents as matters requiring incident reporting. Safety comes before routine coaching.",
    managerFocus: [
      "Who was involved?",
      "What physical actions were personally observed or reported?",
      "Were there injuries?",
      "Were threats made?",
      "Were students or other employees nearby?",
      "Who witnessed the incident?",
      "Were emergency services, administration, school police/law enforcement, or supervisors contacted?",
    ],
    assistanceSuggestions: [
      "Prioritize immediate safety and separation of involved persons when safe to do so.",
      "Obtain factual witness information according to required procedures.",
      "Document exact actions and statements without deciding fault based on incomplete information.",
      "Follow required incident-reporting and supervisory procedures.",
    ],
    severityNotes: [
      "Physical violence, threats, or injuries are serious matters and should not be treated as ordinary performance coaching.",
    ],
    hrFlag:
      "Immediately follow applicable emergency/reporting procedures and notify appropriate administration/supervision. Consult HR as required.",
  },

  "Dress / Personal Hygiene": {
    id: "dress-hygiene",
    title: "Dress / Personal Hygiene",
    pcRule: "",
    referenceType: "Food Services Division Employee Handbook",
    referenceSummary:
      "The handbook includes School Based Dress Code Policy, safety apparel/PPE, sanitation, and personal hygiene as Food Services job-related standards.",
    managerFocus: [
      "What specific dress, hygiene, PPE, or sanitation expectation was involved?",
      "What was actually observed?",
      "Was the employee previously informed of the requirement?",
      "Did the condition create a food-safety or workplace-safety concern?",
    ],
    assistanceSuggestions: [
      "Privately explain the specific dress, hygiene, PPE, or sanitation expectation.",
      "Avoid embarrassing or subjective descriptions; document the observable issue.",
      "Explain any food-safety or safety reason connected to the requirement.",
      "Give the employee an opportunity to correct the issue when appropriate.",
      "Provide clarification about the required standard.",
    ],
    severityNotes: [
      "A routine dress concern may be different from a condition that creates an immediate food-safety or health concern.",
    ],
    hrFlag:
      "Consult AFSS/HR when the issue is repeated, sensitive, potentially protected, or may require formal corrective action.",
  },

  "Workers' Compensation": {
    id: "workers-comp",
    title: "Workers' Compensation / Workplace Injury",
    pcRule: "",
    referenceType: "Food Services Division Employee Handbook",
    referenceSummary:
      "The handbook contains specific responsibilities for reporting, investigating, documenting, and responding to workplace injuries. Serious injuries and medical treatment have time-sensitive procedures.",
    managerFocus: [
      "When and where did the injury occur?",
      "What task was the employee performing?",
      "What happened immediately before the injury?",
      "Were there witnesses?",
      "Was first aid or professional medical treatment requested or provided?",
      "Were the appropriate supervisor and administrator notified?",
      "Were required injury forms and reports provided or completed?",
    ],
    assistanceSuggestions: [
      "Prioritize medical care and required injury-reporting procedures.",
      "Investigate the incident and obtain factual statements as required.",
      "Discuss preventive measures and retraining when an unsafe practice contributed to the incident.",
      "Follow medical restrictions and accommodation procedures when applicable.",
    ],
    severityNotes: [
      "Workers' compensation incidents have separate procedural requirements and should not be handled solely as employee discipline.",
      "The handbook states that managers should provide necessary assistance to comply with agreed temporary work accommodations.",
    ],
    hrFlag:
      "Follow the FSD workers' compensation reporting process and notify the appropriate supervisor promptly.",
  },

  "Other": {
    id: "other",
    title: "Other Workplace Incident",
    pcRule: "",
    referenceType: "General Documentation Guidance",
    referenceSummary:
      "SPARK did not find a single predefined incident category that clearly controls. The manager should document the facts and use the applicable FSD/District reference before determining next steps.",
    managerFocus: [
      "What exactly happened?",
      "Who was involved?",
      "When and where did it happen?",
      "What did you personally observe?",
      "What exact words were used, if relevant?",
      "What expectation or procedure was involved?",
      "What effect did the incident have?",
      "What action or assistance did the manager provide?",
    ],
    assistanceSuggestions: GENERAL_ASSISTANCE_SUGGESTIONS,
    severityNotes: [
      "When the appropriate category or policy is unclear, do not force a match.",
    ],
    hrFlag:
      "Consult AFSS/HR when the appropriate response or applicable rule is unclear or the matter is serious.",
  },
};

// ---------------------------------------------------------
// ALIASES
// Allows SPARK to tolerate slightly different AI labels.
// ---------------------------------------------------------

const TYPE_ALIASES = {
  "rude and discourteous behavior": "Rude and Discourteous Behavior",
  "rude behavior": "Rude and Discourteous Behavior",
  "discourteous behavior": "Rude and Discourteous Behavior",
  "insubordination": "Insubordination",
  "willful disobedience": "Insubordination",
  "dereliction": "Dereliction of Duties",
  "dereliction of duty": "Dereliction of Duties",
  "dereliction of duties": "Dereliction of Duties",
  "fight": "Fight",
  "fighting": "Fight",
  "theft": "Theft",
  "dishonesty": "Theft",
  "drug or alcohol use": "Drug or Alcohol Use",
  "drug/alcohol": "Drug or Alcohol Use",
  "attendance": "Attendance",
  "tardiness": "Attendance",
  "safety / sanitation": "Safety / Sanitation",
  "safety": "Safety / Sanitation",
  "sanitation": "Safety / Sanitation",
  "temperature logs": "Temperature Logs",
  "temperature log": "Temperature Logs",
  "dress / personal hygiene": "Dress / Personal Hygiene",
  "dress": "Dress / Personal Hygiene",
  "personal hygiene": "Dress / Personal Hygiene",
  "workers' compensation": "Workers' Compensation",
  "workers compensation": "Workers' Compensation",
  "cell phone / electronics": "Cell Phone / Electronics",
  "cell phone": "Cell Phone / Electronics",
  "electronics": "Cell Phone / Electronics",
  "other": "Other",
};

// ---------------------------------------------------------
// SUBJECTIVE / EMOTIONAL LANGUAGE COACH
// ---------------------------------------------------------

const SUBJECTIVE_LANGUAGE = [
  {
    pattern: /\bbad attitude\b/i,
    message:
      'Instead of "bad attitude," describe what the employee actually said or did.',
  },
  {
    pattern: /\blazy\b/i,
    message:
      'Instead of "lazy," identify the assigned task and the observable work behavior.',
  },
  {
    pattern: /\brude\b/i,
    message:
      'If possible, describe the specific words, tone-related behavior, interruption, yelling, gesture, or other observable conduct instead of relying only on "rude."',
  },
  {
    pattern: /\bdisrespectful\b/i,
    message:
      'Describe the specific behavior or words that you considered disrespectful.',
  },
  {
    pattern: /\bangry\b/i,
    message:
      'Avoid assuming the employee was angry. Describe observable behavior such as yelling, raised voice, clenched fists, walking away, or specific statements if those actually occurred.',
  },
  {
    pattern: /\bdoesn't care\b|\bdoes not care\b/i,
    message:
      'Avoid assuming what the employee cares about. Describe the action or failure to act that you observed.',
  },
  {
    pattern: /\balways\b/i,
    message:
      'Be careful with "always." Use specific dates or examples when possible.',
  },
  {
    pattern: /\bnever\b/i,
    message:
      'Be careful with "never." Document specific incidents or dates when possible.',
  },
];

// ---------------------------------------------------------
// PUBLIC FUNCTIONS
// ---------------------------------------------------------

export function normalizeIncidentType(type) {
  if (!type) return "Other";

  if (INCIDENT_GUIDANCE[type]) {
    return type;
  }

  const normalized = String(type).trim().toLowerCase();

  return TYPE_ALIASES[normalized] || "Other";
}

export function getIncidentGuidance(type) {
  const normalizedType = normalizeIncidentType(type);

  return {
    incidentType: normalizedType,
    ...INCIDENT_GUIDANCE[normalizedType],
    generalDocumentationCoaching: GENERAL_DOCUMENTATION_COACHING,
    disclaimer:
      "SPARK provides reference and documentation guidance only. It does not determine whether misconduct occurred or what discipline should be imposed. Corrective and disciplinary decisions are case-by-case and should follow current District/FSD requirements and appropriate AFSS/HR guidance.",
  };
}

export function getSubjectiveLanguageCoaching(text = "") {
  if (!text || typeof text !== "string") {
    return [];
  }

  return SUBJECTIVE_LANGUAGE.filter((item) => item.pattern.test(text)).map(
    (item) => item.message
  );
}

export function getAssistanceGuidanceSuggestions(type) {
  const guidance = getIncidentGuidance(type);

  const specific = Array.isArray(guidance.assistanceSuggestions)
    ? guidance.assistanceSuggestions
    : [];

  return [...new Set([...specific, ...GENERAL_ASSISTANCE_SUGGESTIONS])];
}

/*
  Builds one object that IncidentRecordHelper.js can display.

  Example:

  const sparkGuidance = buildSparkGuidance({
    incidentType: form.incidentType,
    roughDescription: form.roughDescription,
    observedFacts: form.observedFacts,
  });
*/

export function buildSparkGuidance({
  incidentType = "Other",
  roughDescription = "",
  observedFacts = "",
} = {}) {
  const guidance = getIncidentGuidance(incidentType);

  const languageCoaching = getSubjectiveLanguageCoaching(
    `${roughDescription} ${observedFacts}`
  );

  return {
    ...guidance,

    languageCoaching,

    assistanceGuidanceSuggestions:
      getAssistanceGuidanceSuggestions(incidentType),

    hasLanguageCoaching: languageCoaching.length > 0,

    shouldConsultHR: Boolean(guidance.hrFlag),
  };
}

/*
  Optional helper for displaying an easy manager-facing "attention level."

  IMPORTANT:
  This is NOT a disciplinary severity determination.

  It only helps the UI communicate when the incident description contains
  facts that should prompt quicker supervisory review.
*/

export function getReferenceAttentionLevel({
  incidentType = "",
  roughDescription = "",
  observedFacts = "",
  impact = "",
} = {}) {
  const text = `${roughDescription} ${observedFacts} ${impact}`.toLowerCase();

  const urgentTerms = [
    "weapon",
    "gun",
    "knife",
    "threatened to kill",
    "threat to kill",
    "hit",
    "punched",
    "kicked",
    "fight",
    "fighting",
    "physical altercation",
    "assault",
    "injured",
    "injury",
    "harassment",
    "sexual harassment",
    "bullying",
    "under the influence",
    "intoxicated",
  ];

  const safetyTerms = [
    "haccp",
    "temperature",
    "sanitation",
    "food safety",
    "unsafe",
    "safety",
    "contamination",
  ];

  if (
    incidentType === "Fight" ||
    incidentType === "Drug or Alcohol Use" ||
    urgentTerms.some((term) => text.includes(term))
  ) {
    return {
      level: "HIGH ATTENTION",
      label: "Prompt supervisor review recommended",
      explanation:
        "The description may involve safety, violence, harassment, injury, impairment, or another serious concern. Follow applicable reporting procedures and involve appropriate supervision/HR.",
    };
  }

  if (
    incidentType === "Safety / Sanitation" ||
    incidentType === "Temperature Logs" ||
    safetyTerms.some((term) => text.includes(term))
  ) {
    return {
      level: "ELEVATED ATTENTION",
      label: "Review safety impact",
      explanation:
        "The incident may involve a health, food-safety, sanitation, HACCP, or other safety requirement. Document the actual risk and corrective steps taken.",
    };
  }

  return {
    level: "STANDARD REVIEW",
    label: "Manager documentation review",
    explanation:
      "Review the facts, prior relevant history when appropriate, assistance offered, and applicable FSD/District guidance before deciding next steps.",
  };
}
