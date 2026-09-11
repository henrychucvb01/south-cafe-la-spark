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
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function normalizeTime(value) {
  if (!value) return "";
  const clean = String(value).trim().toLowerCase();
  if (/^\d{2}:\d{2}$/.test(clean)) return clean;

  const match = clean.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/);
  if (!match) return "";

  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3]?.replace(/\./g, "");

  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return "";

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function extractDateFromDescription(description) {
  const monthPattern = "(January|February|March|April|May|June|July|August|September|October|November|December)";
  const match = description.match(new RegExp(`${monthPattern}\\s+(\\d{1,2}),\\s*(\\d{4})`, "i"));
  if (!match) return "";
  const monthNames = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  return `${Number(match[3])}-${String(monthNames.indexOf(match[1].toLowerCase()) + 1).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
}

function extractTimeFromDescription(description) {
  const match = description.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (!match) return "";
  return normalizeTime(`${match[1]}:${match[2] || "00"} ${match[3]}`);
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") return response.status(200).end();
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });

  try {
    const description = request.body?.description?.trim();
    if (!description) {
      return response.status(400).json({ error: "Please provide an incident description." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return response.status(500).json({ error: "Gemini API key is not configured." });
    }

    const prompt = `
You are SPARK, an expert documentation assistant for school cafeteria managers.
Your job is to translate stressed, emotional, or fragmented manager reports into objective, bulletproof HR documentation.

Allowed Incident Types:
${INCIDENT_TYPES.join(", ")}

### CORE RULES:
1. ONLY use supplied facts. Do NOT invent dates, names, or motives.
2. Separate FACTS from OPINIONS. Convert subjective terms ("lazy", "bad attitude") into factual observations or flag them.
3. For the "writingCoach", ALWAYS provide a direct, professional alternative phrasing the manager can use.
4. "attentionLevel" criteria:
   - "low": Routine disputes, minor lateness, uniform slips.
   - "moderate": Direct refusal/insubordination, repeated disruption.
   - "high": Physical violence, theft, intoxication, severe safety risk.

### EXAMPLE CONVERSION:
Manager: "Brenda gave me huge attitude today during lunch rush around 11:30 and refused to wash pans, slamming the sink door."
Output:
- incidentType: "Insubordination"
- observedFacts: "At approximately 11:30 AM during lunch service, Brenda was directed to wash pans. Brenda refused the directive and shut the sink cabinet door with force."
- writingCoach: [{
    "originalPhrase": "gave me huge attitude",
    "whyProblematic": "Attitude is subjective and unprovable to HR.",
    "suggestedReplacement": "refused direct instructions and slammed cabinet doors"
}]

Manager's Actual Report:
"${description}"

Return ONLY valid JSON matching this schema:
{
  "employeeName": string (subject of report, not manager),
  "incidentType": string (from allowed list),
  "incidentDate": string (YYYY-MM-DD or empty),
  "incidentTime": string (HH:MM 24-hr or empty),
  "incidentWhere": string,
  "involvedPeople": string,
  "observedFacts": string (strictly objective timeline of events),
  "exactWords": string (only words in direct quotes),
  "managerAction": string (what the manager did/said),
  "employeeResponse": string (what employee did/said after manager acted),
  "witnesses": string,
  "operationalImpact": string (e.g. food delay, line stopped),
  "followUpQuestions": string[] (critical missing facts needed for an official HR record),
  "attentionLevel": "low" | "moderate" | "high",
  "attentionReason": string,
  "writingCoach": [
    {
      "originalPhrase": string,
      "whyProblematic": string,
      "suggestedReplacement": string
    }
  ],
  "professionalSummary": string (clean, neutral, third-person narrative ready for HR submission)
}
`;

    // Note: Using standard gemini-1.5-flash (gemini-3.6-flash does not exist)
    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", errorText);
      return response.status(500).json({ error: "Gemini could not analyze the incident." });
    }

    const result = await geminiResponse.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return response.status(500).json({ error: "Gemini returned an empty response." });
    }

    let incident;
    try {
      incident = JSON.parse(text);
    } catch (parseError) {
      console.error("Gemini JSON parsing error:", text);
      return response.status(500).json({ error: "Failed to parse incident response." });
    }

    // Apply regex fallbacks if AI missed date/time
    incident.incidentDate = normalizeDate(incident.incidentDate) || extractDateFromDescription(description);
    incident.incidentTime = normalizeTime(incident.incidentTime) || extractTimeFromDescription(description);
    incident.employeeName = String(incident.employeeName || "").trim();
    incident.followUpQuestions = Array.isArray(incident.followUpQuestions) ? incident.followUpQuestions : [];
    
    // Clean writing coach items
    incident.writingCoach = Array.isArray(incident.writingCoach)
      ? incident.writingCoach.map(item => ({
          originalPhrase: String(item.originalPhrase || "").trim(),
          whyProblematic: String(item.whyProblematic || "").trim(),
          suggestedReplacement: String(item.suggestedReplacement || "").trim(),
        })).filter(item => item.originalPhrase && item.suggestedReplacement)
      : [];

    const allowedAttentionLevels = ["low", "moderate", "high"];
    incident.attentionLevel = allowedAttentionLevels.includes(String(incident.attentionLevel || "").toLowerCase())
      ? String(incident.attentionLevel).toLowerCase()
      : "moderate";

    return response.status(200).json(incident);
  } catch (error) {
    console.error("Analyze incident error:", error);
    return response.status(500).json({ error: "The incident could not be analyzed." });
  }
}
