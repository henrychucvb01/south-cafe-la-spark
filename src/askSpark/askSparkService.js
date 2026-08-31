export const ASK_SPARK_CATEGORIES = [
  "BIC / Breakfast",
  "Civil Rights",
  "Counting and Claiming",
  "Field Trips / Offsite Meals",
  "General Manager Reference",
  "HACCP / Food Safety",
  "Manager Systems / Daily Operations",
  "Production Records / Inventory",
  "SOP / Manager Operations",
  "Special Diets / Accommodations",
  "Supper / CACFP / EEC",
];

export async function askSpark(question, category = "") {
  const response = await fetch("/api/ask-spark", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: question.trim(), categories: category ? [category] : [] }),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Ask SPARK returned ${response.status} without a valid response.`);
  }
  if (!response.ok) throw new Error(result?.error || "Ask SPARK could not complete the search.");
  return result;
}
