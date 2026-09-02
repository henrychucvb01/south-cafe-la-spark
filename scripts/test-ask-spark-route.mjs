import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const sourcePath = new URL("../api/ask-spark.js", import.meta.url);
const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ask-spark-route-"));
const modulePath = path.join(tempDirectory, "ask-spark.mjs");

try {
  await fs.copyFile(sourcePath, modulePath);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  process.env.GEMINI_API_KEY = "test-gemini-key";

  const cases = [
    {
      question: "How do I complete a production record?",
      chunkId: "ASKP1-C000168",
      title: "Counting and Claiming Module 2026-27",
      category: "Counting and Claiming",
      locatorType: "page",
      locatorNumber: 4,
      content: "Complete the Food Production Worksheet and use it as the balance point to verify the number of meals served.",
      answer: "Complete the Food Production Worksheet and use it to verify the number of meals served.",
    },
    {
      question: "What do I do for a field trip?",
      chunkId: "ASKP1-C000420",
      title: "Field Trip Meal Procedures",
      category: "Field Trips / Offsite Meals",
      locatorType: "page",
      locatorNumber: 2,
      content: "Submit the field trip meal request in advance and retain the completed meal count documentation.",
      answer: "Submit the field trip meal request in advance and retain the completed meal count documentation.",
    },
    {
      question: "What are the BIC procedures?",
      chunkId: "ASKP1-C000731",
      title: "Breakfast in the Classroom Procedures",
      category: "BIC / Breakfast",
      locatorType: "slide",
      locatorNumber: 8,
      content: "Record meals at the point of service and return the roster and unused food after breakfast service.",
      answer: "Record meals at the point of service, then return the roster and unused food after breakfast service.",
    },
  ];
  let currentCase;

  globalThis.fetch = async (url, options = {}) => {
    if (url.includes(":embedContent")) {
      return new Response(JSON.stringify({ embedding: { values: [0.1, 0.2, 0.3] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/rpc/ask_spark_hybrid_search")) {
      const query = JSON.parse(options.body).query_text;
      currentCase = cases.find((item) => item.question === query);
      assert.ok(currentCase, `Unexpected test question: ${query}`);
      return new Response(JSON.stringify([{
        chunk_id: currentCase.chunkId,
        document_id: "ASKP1-0069",
        title: currentCase.title,
        source_filename: `${currentCase.title}.pdf`,
        topic_category: currentCase.category,
        document_year: "2026",
        source_type: "PDF",
        locator_type: currentCase.locatorType,
        locator_number: currentCase.locatorNumber,
        citation_label: `${currentCase.title} - ${currentCase.locatorType} ${currentCase.locatorNumber}`,
        content: currentCase.content,
        semantic_similarity: 0.88,
        text_rank: 0.42,
        combined_score: 0.79,
      }]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes(":generateContent")) {
      const grounded = {
        supported: true,
        answer: currentCase.answer,
        citation_ids: [currentCase.chunkId],
      };
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(grounded) }] } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  };

  const { default: handler } = await import(`${new URL(`file:///${modulePath.replace(/\\/g, "/")}`).href}?test=${Date.now()}`);
  for (const testCase of cases) {
    let statusCode = 0;
    let responseBody;
    const response = {
      setHeader() {},
      status(value) { statusCode = value; return this; },
      json(value) { responseBody = value; return value; },
    };
    await handler({
      method: "POST",
      headers: { host: "localhost:3000", origin: "http://localhost:3000" },
      socket: { remoteAddress: `127.0.0.${cases.indexOf(testCase) + 1}` },
      body: { question: testCase.question, categories: [] },
    }, response);

    assert.equal(statusCode, 200);
    assert.equal(responseBody.supported, true);
    assert.equal(responseBody.answer, testCase.answer);
    assert.equal(responseBody.citations.length, 1);
    assert.equal(responseBody.citations[0].chunkId, testCase.chunkId);
    assert.equal(responseBody.citations[0].locatorType, testCase.locatorType);
    assert.equal(responseBody.citations[0].locatorNumber, testCase.locatorNumber);
    console.log(`Grounded Ask SPARK route test passed: ${testCase.question}`);
  }
} finally {
  await fs.rm(tempDirectory, { recursive: true, force: true });
}
