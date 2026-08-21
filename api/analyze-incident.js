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

  // Already YYYY-MM-DD
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

  // Already HH:MM
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
    new RegExp(
      `${monthPattern}\\s+(\\d{1,2}),\\s*(\\d{4})`,
      "i"
    )
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

  return normalizeTime(
    `${match[1]}:${match[2] || "00"} ${match[3]}`
  );
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
You are helping a school cafeteria manager document a workplace incident.

Your job is to organize the manager's description into factual incident-record information.

IMPORTANT RULES:

1. Use ONLY information supplied by the manager.
2. Never invent facts.
3. Never invent names, dates, times, locations, witnesses, quotes, actions, or outcomes.
4. Never assume someone's intent, emotion, motive, or mental state.
5. Preserve people's names exactly as provided.
6. Only put something in "exactWords" if the manager clearly supplied a direct quote.
7. If information was not provided, return an empty string for that field.
8. Do not recommend discipline.
9. Do not decide whether a policy was violated.
10. Do not accuse an employee of misconduct beyond what the manager actually described.
11. Choose the closest incident category from the allowed list.
12. "observedFacts" should be objective, professional, and concise.
13. If the manager uses subjective words such as rude, angry, lazy, disrespectful, or bad attitude, rely on the observable behavior they supplied rather than repeating an unsupported conclusion.
14. "managerAction" should contain only actions the manager said they personally took.
15. "employeeResponse" should contain only the employee's stated or observed response after intervention.
16. If important information is missing, identify it in "missingInformation".
17. Ask short, useful follow-up questions in "followUpQuestions".
18. Do not repeat a question if the answer was already provided.
19. "incidentDate" MUST use YYYY-MM-DD format.
20. "incidentTime" MUST use 24-hour HH:MM format.
21. "employeeName" should be the employee who is the primary subject of the incident, only when clearly identified by the manager.
22. Do not put witnesses or the manager in "employeeName" unless they are clearly the employee who is the subject of the incident.

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
  "followUpQuestions": []
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

    const text =
      result?.candidates?.[0]?.content?.parts?.[0]?.text;

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

    incident.employeeName = incident.employeeName || "";

    incident.missingInformation = Array.isArray(
      incident.missingInformation
    )
      ? incident.missingInformation
      : [];

    incident.followUpQuestions = Array.isArray(
      incident.followUpQuestions
    )
      ? incident.followUpQuestions
      : [];

    return response.status(200).json(incident);
  } catch (error) {
    console.error("Analyze incident error:", error);

    return response.status(500).json({
      error: "The incident could not be analyzed.",
    });
  }
}
