export const ASK_SPARK_SUGGESTIONS = [
  { question: "How do I complete a production record?", category: "Production Records / Inventory" },
  { question: "What should I record when the menu changes?", category: "Production Records / Inventory" },
  { question: "How long should meal count records be kept?", category: "Counting and Claiming" },
  { question: "What do I do when the meal counting system is down?", category: "Counting and Claiming" },
  { question: "How do I document meal counts above the edit check?", category: "Counting and Claiming" },
  { question: "What is the balance point for meals claimed?", category: "Counting and Claiming" },
  { question: "What records do I need for supper?", category: "Supper / CACFP / EEC" },
  { question: "How do I count visiting students for supper?", category: "Supper / CACFP / EEC" },
  { question: "What belongs in the EEC site binder?", category: "Supper / CACFP / EEC" },
  { question: "When must EEC temperature logs be completed?", category: "Supper / CACFP / EEC" },
  { question: "How do I verify EEC attendance against meal counts?", category: "Supper / CACFP / EEC" },
  { question: "What do I do if a student needs a special diet?", category: "Special Diets / Accommodations" },
  { question: "What paperwork is required for a special diet?", category: "Special Diets / Accommodations" },
  { question: "Can lactose-free milk be provided without documentation?", category: "Special Diets / Accommodations" },
  { question: "How far in advance are field trip meals requested?", category: "Field Trips / Offsite Meals" },
  { question: "Where can the point of service be for a field trip?", category: "Field Trips / Offsite Meals" },
  { question: "What happens to leftover field trip meals?", category: "Field Trips / Offsite Meals" },
  { question: "What are the rules for Sunday field trip meals?", category: "Field Trips / Offsite Meals" },
  { question: "Who marks the BIC meal count roster?", category: "BIC / Breakfast" },
  { question: "Can students be required to take breakfast?", category: "BIC / Breakfast" },
  { question: "What must be returned after BIC service?", category: "BIC / Breakfast" },
  { question: "Where should the And Justice for All poster be displayed?", category: "Civil Rights" },
  { question: "How do I handle a civil rights complaint?", category: "Civil Rights" },
  { question: "Which food temperature logs are required?", category: "HACCP / Food Safety" },
  { question: "How often should equipment temperature logs be completed?", category: "HACCP / Food Safety" },
  { question: "What should I check before an Administrative Review?", category: "SOP / Manager Operations" },
  { question: "What documents support meals claimed for reimbursement?", category: "SOP / Manager Operations" },
  { question: "How should substitutions be documented?", category: "SOP / Manager Operations" },
  { question: "What are the daily manager record-keeping tasks?", category: "Manager Systems / Daily Operations" },
  { question: "What should I review before meal service starts?", category: "Manager Systems / Daily Operations" },
];

export function normalizeSearch(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function editDistance(left, right) {
  const a = normalizeSearch(left);
  const b = normalizeSearch(right);
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const held = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = held;
    }
  }
  return row[b.length];
}

export function getAskSparkSuggestions(query, category = "", limit = 6) {
  const normalized = normalizeSearch(query);
  if (normalized.length < 2) return [];
  const queryWords = normalized.split(" ");
  return ASK_SPARK_SUGGESTIONS
    .filter((item) => !category || item.category === category)
    .map((item) => {
      const text = normalizeSearch(item.question);
      const words = text.split(" ");
      let score = text.includes(normalized) ? 100 - text.indexOf(normalized) : 0;
      for (const queryWord of queryWords) {
        const best = Math.min(...words.map((word) => editDistance(queryWord, word)));
        if (words.some((word) => word.startsWith(queryWord))) score += 25;
        else if (best <= (queryWord.length >= 5 ? 2 : 1)) score += 14 - best;
        else score -= 15;
      }
      return { ...item, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.question.localeCompare(b.question))
    .slice(0, limit);
}
