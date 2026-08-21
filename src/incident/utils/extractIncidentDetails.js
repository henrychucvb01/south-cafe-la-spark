const TIME_REGEX =
  /\b(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\b/i;

const DATE_REGEX =
  /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/;

const LOCATION_KEYWORDS = [
  "kitchen",
  "cafeteria",
  "serving line",
  "lunchroom",
  "storage room",
  "freezer",
  "refrigerator",
  "office",
  "break room",
  "dish room",
  "prep area",
  "receiving area",
];

const IMPACT_KEYWORDS = [
  "delayed",
  "delay",
  "service stopped",
  "meal service",
  "teamwork",
  "morale",
  "safety",
  "students waiting",
  "line backed up",
  "production",
];

const MANAGER_ACTION_WORDS = [
  "i told",
  "i instructed",
  "i directed",
  "i asked",
  "i reminded",
  "i advised",
  "i sent",
  "i spoke",
  "i separated",
  "i stopped",
];

const RESPONSE_WORDS = [
  "she complied",
  "he complied",
  "they complied",
  "walked away",
  "returned to work",
  "returned to the line",
  "continued",
  "refused",
  "argued",
  "said no",
  "ignored",
];

function cleanSentence(text = "") {
  return text
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text = "") {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(cleanSentence)
    .filter(Boolean);
}

function findSentenceContaining(sentences, terms) {
  return (
    sentences.find((sentence) => {
      const lower = sentence.toLowerCase();

      return terms.some((term) =>
        lower.includes(term)
      );
    }) || ""
  );
}

function extractLocation(text) {
  const lower = text.toLowerCase();

  for (const location of LOCATION_KEYWORDS) {
    if (lower.includes(location)) {
      return location;
    }
  }

  return "";
}

function extractDate(text) {
  const match = text.match(DATE_REGEX);

  return match ? match[1] : "";
}

function extractTime(text) {
  const match = text.match(TIME_REGEX);

  return match ? match[1] : "";
}

function extractQuotedWords(text) {
  const match = text.match(
    /["“]([^"”]+)["”]/
  );

  return match ? match[1].trim() : "";
}

function guessIncidentType(text) {
  const lower = text.toLowerCase();

  if (
    lower.includes("fight") ||
    lower.includes("hit") ||
    lower.includes("punch") ||
    lower.includes("pushed") ||
    lower.includes("physical")
  ) {
    return "Fight";
  }

  if (
    lower.includes("refused") ||
    lower.includes("would not follow") ||
    lower.includes("did not follow my direction") ||
    lower.includes("ignored my instruction")
  ) {
    return "Insubordination";
  }

  if (
    lower.includes("yelled") ||
    lower.includes("shouted") ||
    lower.includes("profanity") ||
    lower.includes("cussed") ||
    lower.includes("disrespectful") ||
    lower.includes("rude")
  ) {
    return "Rude and Discourteous Behavior";
  }

  if (
    lower.includes("phone") ||
    lower.includes("cell phone") ||
    lower.includes("earbuds") ||
    lower.includes("ear pods")
  ) {
    return "Cell Phone / Electronics";
  }

  if (
    lower.includes("temperature log") ||
    lower.includes("temperature logs")
  ) {
    return "Temperature Logs";
  }

  if (
    lower.includes("acrylic nails") ||
    lower.includes("nail polish") ||
    lower.includes("hair net") ||
    lower.includes("hairnet") ||
    lower.includes("open toe") ||
    lower.includes("dress code")
  ) {
    return "Dress / Personal Hygiene";
  }

  if (
    lower.includes("sanitation") ||
    lower.includes("hand washing") ||
    lower.includes("handwashing") ||
    lower.includes("gloves")
  ) {
    return "Safety / Sanitation";
  }

  if (
    lower.includes("late") ||
    lower.includes("tardy") ||
    lower.includes("absent") ||
    lower.includes("called out")
  ) {
    return "Attendance";
  }

  if (
    lower.includes("injury") ||
    lower.includes("workers comp") ||
    lower.includes("worker's comp") ||
    lower.includes("doctor")
  ) {
    return "Workers' Compensation";
  }

  if (
    lower.includes("stole") ||
    lower.includes("theft") ||
    lower.includes("took district")
  ) {
    return "Theft";
  }

  return "Other";
}

function detectWitnesses(sentences) {
  const witnessSentence =
    findSentenceContaining(sentences, [
      "witness",
      "saw it",
      "heard it",
      "was there",
      "were there",
    ]);

  return witnessSentence;
}

function detectManagerAction(sentences) {
  return findSentenceContaining(
    sentences,
    MANAGER_ACTION_WORDS
  );
}

function detectEmployeeResponse(sentences) {
  return findSentenceContaining(
    sentences,
    RESPONSE_WORDS
  );
}

function detectImpact(sentences) {
  return findSentenceContaining(
    sentences,
    IMPACT_KEYWORDS
  );
}

export function extractIncidentDetails(
  roughDescription
) {
  const text = cleanSentence(
    roughDescription
  );

  const sentences =
    splitSentences(text);

  return {
    incidentType:
      guessIncidentType(text),

    incidentDate:
      extractDate(text),

    incidentTime:
      extractTime(text),

    incidentWhere:
      extractLocation(text),

    involvedPeople: "",

    observedFacts:
      text,

    exactWords:
      extractQuotedWords(text),

    managerAction:
      detectManagerAction(sentences),

    employeeResponse:
      detectEmployeeResponse(sentences),

    impact:
      detectImpact(sentences),

    witnesses:
      detectWitnesses(sentences),

    assistanceGuidance: "",
  };
}