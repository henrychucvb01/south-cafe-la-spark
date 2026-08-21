const INCIDENT_TYPES = [
  "Rude and Discourteous Behavior",
  "Insubordination",
  "Dereliction of Duties",
  "Fight",
  "Theft",
  "Drug or Alcohol Use",
  "Attendance",
  "Safety / Sanitation",
  "Temperature Logs",
  "Dress / Personal Hygiene",
  "Workers' Compensation",
  "Cell Phone / Electronics",
  "Other",
];

function normalizeDate(value) {
  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeTime(value) {
  if (!value) return "";

  const clean = String(value).trim().toLowerCase();

  if (/^\d{2}:\d{2}$/.test(clean)) {
    return clean;
  }

  const match = clean.match(
    /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/
  );

  if (!match) {
    return "";
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3]?.replace(/\./g, "");

  if (meridiem === "pm" && hours < 12) {
    hours += 12;
  }

  if (meridiem === "am" && hours === 12) {
    hours = 0;
  }

  if (hours > 23 || minutes > 59) {
    return "";
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function extractDateFromDescription(description) {
  const monthPattern =
    "(January|February|March|April|May|June|July|August|September|October|November|December)";

  const match = description.match(
    new RegExp(`${monthPattern}\\s+(\\d{1,2}),\\s*(\\d{4})`, "i")
  );

  if (!match) {
    return "";
  }

  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];

  const month = monthNames.indexOf(match[1].toLowerCase()) + 1;
  const day = Number(match[2]);
  const year = Number(match[3]);

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
}

function extractTimeFromDescription(description) {
  const match = description.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i
  );

  if (!match) {
    return "";
  }

  return normalizeTime(`${match[1]}:${match[2] || "00"} ${match[3]}`);
}

function cleanStringArray(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function cleanWritingCoach(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") {
        return {
          original: "",
          coaching: item.trim(),
        };
      }

      return {
        original: String(item?.original || "").trim(),
        coaching: String(item?.coaching || "").trim(),
      };
    })
    .filter((item) => item.original || item.coaching);
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    return response.status(200).end();
  }

  if (request.method !== "POST") {
    return response.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const description = request.body?.description?.trim();

    if (!description) {
      return response.status(400).json({
        error: "Please provide an incident description.",
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return response.status(500).json({
        error: "Gemini API key is not configured.",
      });
    }

    const prompt = `
You are SPARK, an AI documentation assistant for school cafeteria managers.

A manager will describe a workplace incident in their own words. Managers may be emotional, frustrated, subjective, incomplete, or unfamiliar with documentation standards.

Your job has TWO parts:

PART 1 — ORGANIZE THE FACTS
Organize only the facts the manager actually supplied into the incident-record fields.

PART 2 — COACH THE DOCUMENTATION
Help the manager identify unclear, subjective, emotional, absolute, or unsupported wording and identify important missing details. Also create a concise professional summary using only supplied facts.

IMPORTANT RULES:

1. Use ONLY information supplied by the manager.
2. Never invent facts.
3. Never invent names, dates, times, locations, witnesses, quotes, actions, outcomes, policies, or prior history.
4. Never assume someone's intent, emotion, motive, diagnosis, or mental state.
5. Preserve people's names exactly as provided.
6. Only put something in "exactWords" if the manager clearly supplied a direct quote.
7. If factual information was not provided, return an empty string for that factual field.
8. Do not recommend discipline.
9. Do not decide whether a policy was violated.
10. Do not make a final HR, legal, or disciplinary determination.
11. Do not accuse an employee of misconduct beyond what the manager actually described.
12. Choose the closest incident category from the allowed list.
13. "observedFacts" must be objective, professional, and concise.
14. "managerAction" must contain only actions the manager said they personally took.
15. "employeeResponse" must contain only the employee's stated or observed response after intervention.
16. If important information is missing, identify it in "missingInformation".
17. Ask short, useful follow-up questions in "followUpQuestions".
18. Do not repeat a question if the answer was already provided.
19. "incidentDate" MUST use YYYY-MM-DD format.
20. "incidentTime" MUST use 24-hour HH:MM format.
21. "employeeName" should be the employee who is the primary subject of the incident, only when clearly identified by the manager.
22. Do not put witnesses or the manager in "employeeName" unless they are clearly the employee who is the subject of the incident.
23. For "writingCoach", identify wording such as "bad attitude", "lazy", "rude", "always", "never", "disrespectful", "crazy", "doesn't care", or similar conclusions when the manager did not provide observable support. Explain what observable detail would be stronger.
24. Do not silently rewrite questionable language. Point it out in "writingCoach".
25. "professionalSummary" must be a neutral factual draft based ONLY on supplied facts. It may improve grammar and organization but may not add information.
26. "attentionLevel" is ONLY a triage aid for supervisor review, not a severity ruling or disciplinary recommendation.
27. Use attentionLevel "low" when the described facts appear routine and do not indicate immediate safety, violence, theft, intoxication, injury, or major operational disruption.
28. Use attentionLevel "moderate" when the described facts involve notable refusal, repeated conflict, meaningful disruption, or conduct that reasonably warrants supervisor review but no immediate high-attention condition is described.
29. Use attentionLevel "high" when the reported facts involve physical violence/fighting, threats, alleged theft, suspected drug/alcohol use at work, serious safety risk, injury, or another situation that may require prompt supervisor/HR attention.
30. "attentionReason" must explain the attention level using only the reported facts and neutral language.
31. If the facts are too incomplete to assess attention, use "moderate" and say that additional facts are needed.
32. Do NOT cite or claim to have checked a handbook, policy, collective bargaining agreement, or job aid in this version. Reference materials will be handled separately.

Allowed incident types:

${INCIDENT_TYPES.join(", ")}

Return ONLY valid JSON using exactly this structure:

{
  "employeeName": "",
  "incidentType": "",
  "incidentDate": "",
  "incidentTime": "",
  "incidentWhere": "",
  "involvedPeople": "",
  "observedFacts": "",
  "exactWords": "",
  "managerAction": "",
  "employeeResponse": "",
  "witnesses": "",
  "impact": "",
  "assistanceGuidance": "",
  "missingInformation": [],
  "followUpQuestions": [],
  "attentionLevel": "low",
  "attentionReason": "",
  "writingCoach": [
    {
      "original": "",
      "coaching": ""
    }
  ],
  "professionalSummary": ""
}

Manager's description:

${description}
`;

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();

      console.error("Gemini API error:", errorText);

      return response.status(500).json({
        error: "Gemini could not analyze the incident.",
      });
    }

    const result = await geminiResponse.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return response.status(500).json({
        error: "Gemini returned an empty response.",
      });
    }

    let incident;

    try {
      incident = JSON.parse(text);
    } catch (parseError) {
      console.error("Gemini JSON parsing error:", text);

      return response.status(500).json({
        error: "Gemini returned information in an unexpected format.",
      });
    }

    const fallbackDate = extractDateFromDescription(description);
    const fallbackTime = extractTimeFromDescription(description);

    incident.incidentDate =
      normalizeDate(incident.incidentDate) || fallbackDate;

    incident.incidentTime =
      normalizeTime(incident.incidentTime) || fallbackTime;

    incident.employeeName = String(incident.employeeName || "").trim();

    incident.missingInformation = cleanStringArray(
      incident.missingInformation
    );

    incident.followUpQuestions = cleanStringArray(
      incident.followUpQuestions
    );

    incident.writingCoach = cleanWritingCoach(incident.writingCoach);

    const allowedAttentionLevels = ["low", "moderate", "high"];
    incident.attentionLevel = allowedAttentionLevels.includes(
      String(incident.attentionLevel || "").toLowerCase()
    )
      ? String(incident.attentionLevel).toLowerCase()
      : "moderate";

    incident.attentionReason = String(
      incident.attentionReason || ""
    ).trim();

    incident.professionalSummary = String(
      incident.professionalSummary || ""
    ).trim();

    return response.status(200).json(incident);
  } catch (error) {
    console.error("Analyze incident error:", error);

    return response.status(500).json({
      error: "The incident could not be analyzed.",
    });
  }
}
