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
Your job is to translate emotional or fragmented manager notes into objective, professional HR documentation.

Allowed Incident Types:
${INCIDENT_TYPES.join(", ")}

RULES:
1. ONLY use facts supplied by the manager. Never invent details.
2. Separate FACTS from OPINIONS. Turn subjective phrases ("bad attitude", "lazy") into observable behaviors.
3. For "writingCoach", provide the exact phrase and a professional replacement.
4. "attentionLevel": "low" (minor/routine), "moderate" (refusal/disruption), "high" (violence, theft, intoxication, serious safety hazard).

EXAMPLE:
Manager: "Brenda gave me huge attitude today during lunch around 11:30 and refused to wash pans, slamming the sink door."
Output:
- incidentType: "Insubordination"
- observedFacts: "At approximately 11:30 AM during lunch service, Brenda was directed to wash pans. Brenda refused the directive and shut the sink cabinet door with force."
- writingCoach: [{
    "original": "gave me huge attitude",
    "coaching": "Attitude is subjective to HR. Consider writing: 'refused direct instructions and slammed cabinet doors'"
}]

Manager's Description:
"${description}"

Return ONLY valid JSON with this exact structure:
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
`;

    // Connects directly to Google's verified gemini-2.5-flash model
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
    });

if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", errorText);
      return response.status(500).json({ error: errorText });
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

    // Apply regex date/time fallbacks if AI missed them
    incident.incidentDate = normalizeDate(incident.incidentDate) || extractDateFromDescription(description);
    incident.incidentTime = normalizeTime(incident.incidentTime) || extractTimeFromDescription(description);
    incident.employeeName = String(incident.employeeName || "").trim();
    incident.followUpQuestions = Array.isArray(incident.followUpQuestions) ? incident.followUpQuestions : [];

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
