export async function analyzeIncident(roughDescription) {
  if (!roughDescription?.trim()) {
    throw new Error(
      "Please describe what happened before continuing."
    );
  }

  try {
    const response = await fetch("/api/analyze-incident", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        description: roughDescription.trim(),
      }),
    });

    let result;

    try {
      result = await response.json();
    } catch (error) {
      throw new Error(
        `AI server returned ${response.status} and did not return valid JSON.`
      );
    }

    if (!response.ok) {
      throw new Error(
        result?.error ||
          `AI server returned error ${response.status}.`
      );
    }

    if (!result || typeof result !== "object") {
      throw new Error(
        "The AI server returned an invalid response."
      );
    }

    return {
      ...result,
      _analysisSource: "gemini",
    };
  } catch (error) {
    console.error(
      "Gemini incident analysis failed:",
      error
    );

    throw new Error(
      error?.message ||
        "The AI incident analyzer could not be reached."
    );
  }
}
