import {
  extractIncidentDetails,
} from "../utils/extractIncidentDetails";


const AI_API_URL =
  "https://south-cafe-la-command-omega.vercel.app/api/analyze-incident";


export async function analyzeIncident(
  roughDescription
) {
  if (!roughDescription?.trim()) {
    throw new Error(
      "Please describe what happened before continuing."
    );
  }

  try {
    const response = await fetch(
      AI_API_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          description:
            roughDescription.trim(),
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `AI server returned ${response.status}`
      );
    }

    const result =
      await response.json();

    return {
      ...result,
      _analysisSource: "gemini",
    };

  } catch (error) {
    console.warn(
      "Gemini unavailable. Using local incident analyzer.",
      error
    );

    const localResult =
      extractIncidentDetails(
        roughDescription
      );

    return {
      ...localResult,

      missingInformation: [],
      followUpQuestions: [],

      _analysisSource: "local",
    };
  }
}