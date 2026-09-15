function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
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

// Map vague words to helpful, concrete suggestions
const VAGUE_WORD_COACHING = {
  rude: "Instead of 'rude', describe their specific tone, gesture, or words (e.g., 'spoke in a raised voice' or 'rolled eyes').",
  disrespectful: "Instead of 'disrespectful', state the exact action (e.g., 'ignored instruction' or 'turned back while being spoken to').",
  angry: "Describe physical indicators (e.g., 'clenched fists', 'slammed tray', 'shouted') rather than assuming emotion.",
  mad: "Describe physical indicators (e.g., 'clenched fists', 'slammed tray', 'shouted') rather than assuming emotion.",
  lazy: "Instead of 'lazy', state the specific duty not done (e.g., 'did not begin dish line prep at 10:30 AM').",
  aggressive: "Describe specific physical actions or statements rather than summarizing it as 'aggressive'.",
  hostile: "State the concrete statements or conduct rather than concluding the environment was 'hostile'.",
  unprofessional: "State the specific policy or task that was missed rather than using 'unprofessional'.",
  "bad attitude": "Instead of 'bad attitude', note the direct behavior (e.g., 'did not respond to greetings and refused assigned station').",
  argumentative: "State what directive was given and the employee's exact verbal refusal.",
  insubordinate: "Clearly document: 1) What direct order you gave, and 2) Exactly what the employee did or said to refuse it.",
};

export function checkIncidentDocumentation(form, aiResult = null) {
  const issues = [];

  const facts = normalize(form.observedFacts || form.description || form.roughDescription);
  const action = normalize(form.managerAction);
  const employeeName = normalize(form.employeeName || form.involvedPeople);
  const date = normalize(form.incidentDate);

  // Read AI analysis either from the 2nd parameter or from properties inside form
  const ai = aiResult || form._aiAnalysis || form.aiAnalysis || null;

  // -------------------------------------------------------------
  // 1. CORE CHECKS (Only block if we literally don't know who or what happened)
  // -------------------------------------------------------------

  if (!facts) {
    addIssue(issues, {
      id: "missing-facts",
      level: "error",
      title: "Incident details needed",
      message: "Please write a brief summary of what happened.",
      field: "observedFacts",
      followUpQuestion: "What did you personally observe or hear?",
    });
  }

  if (!employeeName) {
    addIssue(issues, {
      id: "missing-people",
      level: "warning", // Changed to warning so it doesn't hard-lock the manager
      title: "Employee name missing",
      message: "Adding the employee's name makes this an official record.",
      field: "employeeName",
      followUpQuestion: "Which employee was involved?",
    });
  }

  if (!date) {
    addIssue(issues, {
      id: "missing-date",
      level: "warning", // Changed to warning so it doesn't trap the user
      title: "Date not specified",
      message: "The date helps establish an accurate timeline.",
      field: "incidentDate",
      followUpQuestion: "What date did this take place?",
    });
  }

  // -------------------------------------------------------------
  // 2. HELPFUL WRITING COACH (Gives actual solutions, not just scolding)
  // -------------------------------------------------------------

  // If Gemini provided specific coaching, use it!
  if (ai?.writingCoach && Array.isArray(ai.writingCoach) && ai.writingCoach.length > 0) {
    ai.writingCoach.forEach((coach, idx) => {
      addIssue(issues, {
        id: `ai-coach-${idx}`,
        level: "warning",
        title: `Clarify: "${coach.originalPhrase || coach.original}"`,
        message: coach.suggestedReplacement 
          ? `HR prefers observable facts. Consider: "${coach.suggestedReplacement}"`
          : coach.whyProblematic || coach.coaching,
        field: "observedFacts",
      });
    });
  } else {
    // Fallback: Check for vague words and give actionable advice
    for (const [word, advice] of Object.entries(VAGUE_WORD_COACHING)) {
      if (facts.includes(word)) {
        addIssue(issues, {
          id: `vague-${word}`,
          level: "info",
          title: `Tip for word: "${word}"`,
          message: advice,
          field: "observedFacts",
        });
        break; // Only show one coaching tip at a time so we don't overwhelm
      }
    }
  }

  // -------------------------------------------------------------
  // 3. AI FOLLOW-UP QUESTIONS (Targeted, not generic)
  // -------------------------------------------------------------

  if (ai?.followUpQuestions && Array.isArray(ai.followUpQuestions) && ai.followUpQuestions.length > 0) {
    ai.followUpQuestions.slice(0, 2).forEach((q, idx) => {
      addIssue(issues, {
        id: `ai-q-${idx}`,
        level: "info",
        title: "Helpful detail to consider",
        message: q,
        field: "observedFacts",
        followUpQuestion: q,
      });
    });
  } else if (!action) {
    // Friendly reminder about manager action only if not already documented
    addIssue(issues, {
      id: "manager-action-tip",
      level: "info",
      title: "Did you take immediate action?",
      message: "If you gave a directive or spoke with the employee, note it here.",
      field: "managerAction",
      followUpQuestion: "What did you say or do when this happened?",
    });
  }

  return {
    issues,
    errors: issues.filter((i) => i.level === "error"),
    warnings: issues.filter((i) => i.level === "warning"),
    info: issues.filter((i) => i.level === "info"),
    // Now the manager is NEVER unfairly locked out as long as there is some description!
    canContinue: issues.filter((i) => i.level === "error").length === 0,
  };
}
