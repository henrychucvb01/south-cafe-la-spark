import { ASK_SPARK_CATEGORIES, askSpark } from "./askSparkService";

afterEach(() => jest.restoreAllMocks());

test("sends a trimmed question and optional category only to the backend", async () => {
  const payload = { supported: false, answer: "No confirmed answer", citations: [] };
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => payload });
  await expect(askSpark("  What records do I need?  ", ASK_SPARK_CATEGORIES[0])).resolves.toEqual(payload);
  expect(fetch).toHaveBeenCalledWith("/api/ask-spark", expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ question: "What records do I need?", categories: [ASK_SPARK_CATEGORIES[0]] }),
  }));
});
test("does not hide a safe backend error message", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({
    ok: false,
    status: 503,
    json: async () => ({ error: "Ask SPARK is not configured yet." }),
  });
  await expect(askSpark("How do I complete a production record?")).rejects.toThrow(
    "Ask SPARK is not configured yet."
  );
});
