const VAGUE_WORDS = [
  "rude",
  "disrespectful",
  "angry",
  "mad",
  "lazy",
  "aggressive",
  "hostile",
  "unprofessional",
  "bad attitude",
  "argumentative",
  "inappropriate",
  "insubordinate",
];

const OBSERVABLE_WORDS = [
  "yelled",
  "raised voice",
  "shouted",
  "pointed",
  "walked away",
  "refused",
  "said",
  "stated",
  "used",
  "left",
  "arrived",
  "failed",
  "did not",
  "ignored",
  "continued",
  "threw",
  "pushed",
  "hit",
  "touched",
];

function normalize(value = "") {
  return value.trim().toLowerCase();
}

function hasAny(text, words) {
  return words.some((word) => text.includes(word));
}

function addIssue(issues, issue) {
  issues.push({
    id: issue.id,
    level: issue.level || "warning",
    title: issue.title,
    message: issue.message,
    field: issue.field || null,
    followUpQuestion: issue.followUpQuestion || null,
  });
}

export function checkIncidentDocumentation(form) {
  const issues = [];

  const facts = normalize(form.observedFacts);
  const action = normalize(form.managerAction);
  const response = normalize(form.employeeResponse);
  const witnesses = normalize(form.witnesses);
  const exactWords = normalize(form.exactWords);
  const impact = normalize(form.impact);

  // -----------------------------
  // BASIC REQUIRED INFORMATION
  // -----------------------------

  if (!form.incidentDate) {
    addIssue(issues, {
      id: "missing-date",
      level: "error",
      title: "Incident date is missing",
      message: "The record should identify when the incident occurred.",
      field: "incidentDate",
      followUpQuestion: "What date did the incident occur?",
    });
  }

  if (!form.incidentWhere?.trim()) {
    addIssue(issues, {
      id: "missing-location",
      level: "error",
      title: "Location is missing",
      message: "The record should identify where the incident occurred.",
      field: "incidentWhere",
      followUpQuestion: "Where exactly did the incident occur?",
    });
  }

  if (!form.involvedPeople?.trim()) {
    addIssue(issues, {
      id: "missing-people",
      level: "error",
      title: "People involved are missing",
      message: "Identify the employee and any other people directly involved.",
      field: "involvedPeople",
      followUpQuestion: "Who was directly involved in the incident?",
    });
  }

  if (!facts) {
    addIssue(issues, {
      id: "missing-facts",
      level: "error",
      title: "Incident details are missing",
      message: "Describe what was actually seen, heard, or documented.",
      field: "observedFacts",
      followUpQuestion: "What exactly did you personally see or hear?",
    });
  }

  // -----------------------------
  // VAGUE OR SUBJECTIVE LANGUAGE
  // -----------------------------

  if (facts && hasAny(facts, VAGUE_WORDS)) {
    const hasObservableDetail = hasAny(facts, OBSERVABLE_WORDS);

    if (!hasObservableDetail) {
      addIssue(issues, {
        id: "vague-language",
        level: "warning",
        title: "Add observable details",
        message:
          "The description contains a conclusion or opinion but does not clearly describe the behavior that was observed.",
        field: "observedFacts",
        followUpQuestion:
          "What specifically did the employee say or do that led you to describe the behavior that way?",
      });
    }
  }

  // -----------------------------
  // SHORT INCIDENT DESCRIPTION
  // -----------------------------

  if (facts && facts.length < 40) {
    addIssue(issues, {
      id: "short-description",
      level: "warning",
      title: "The description may need more detail",
      message:
        "The incident description is very short. Consider adding specific actions, statements, timing, or sequence of events.",
      field: "observedFacts",
      followUpQuestion:
        "Can you describe exactly what happened from the beginning of the incident to the end?",
    });
  }

  // -----------------------------
  // QUOTES
  // -----------------------------

  const quoteIndicators = [
    "said",
    "stated",
    "told me",
    "told",
    "yelled",
    "shouted",
    "called",
  ];

  if (facts && hasAny(facts, quoteIndicators) && !exactWords) {
    addIssue(issues, {
      id: "possible-quote",
      level: "info",
      title: "Exact statement may be useful",
      message: "You mentioned that someone spoke or made a statement.",
      field: "exactWords",
      followUpQuestion:
        "Do you remember the exact words that were said? If not, leave this blank rather than guessing.",
    });
  }

  // -----------------------------
  // MANAGER RESPONSE
  // -----------------------------

  if (!action) {
    addIssue(issues, {
      id: "missing-manager-action",
      level: "warning",
      title: "Manager response is missing",
      message: "If you took action after the incident, document what you did.",
      field: "managerAction",
      followUpQuestion:
        "What action did you take after observing or learning about the incident?",
    });
  }

  // -----------------------------
  // DIRECTIVE GIVEN
  // -----------------------------

  const directiveWords = [
    "instructed",
    "directed",
    "told",
    "advised",
    "ordered",
    "asked",
    "reminded",
  ];

  // -----------------------------
  // REFUSAL / INSUBORDINATION DETAIL
  // -----------------------------

  const refusalWords = [
    "refused",
    "would not",
    "didn't follow",
    "did not follow",
    "ignored",
  ];

  if (facts && hasAny(facts, refusalWords)) {
    if (!action) {
      addIssue(issues, {
        id: "directive-needed",
        level: "warning",
        title: "Clarify the directive",
        message:
          "The description suggests that an employee may not have followed a direction.",
        field: "managerAction",
        followUpQuestion:
          "What specific instruction or directive was given to the employee?",
      });
    }
  }

  // -----------------------------
  // WITNESSES
  // -----------------------------

  if (!witnesses) {
    addIssue(issues, {
      id: "witness-check",
      level: "info",
      title: "Confirm witnesses",
      message: "No witnesses are currently listed.",
      field: "witnesses",
      followUpQuestion:
        "Did anyone else see or hear the incident? If not, you can leave this blank.",
    });
  }

  // -----------------------------
  // WORKPLACE IMPACT
  // -----------------------------

  if (!impact) {
    addIssue(issues, {
      id: "impact-check",
      level: "info",
      title: "Consider documenting the impact",
      message:
        "If the incident affected service, safety, teamwork, productivity, or operations, that information may be useful.",
      field: "impact",
      followUpQuestion:
        "Did the incident affect meal service, safety, teamwork, productivity, or cafeteria operations?",
    });
  }

  return {
    issues,
    errors: issues.filter((issue) => issue.level === "error"),
    warnings: issues.filter((issue) => issue.level === "warning"),
    info: issues.filter((issue) => issue.level === "info"),
    canContinue: issues.filter((issue) => issue.level === "error").length === 0,
  };
}
