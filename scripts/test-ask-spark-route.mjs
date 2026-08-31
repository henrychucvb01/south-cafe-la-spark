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
  process.env.OPENAI_API_KEY = "test-openai-key";

  globalThis.fetch = async (url) => {
    if (url === "https://api.openai.com/v1/embeddings") {
      return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/rpc/ask_spark_hybrid_search")) {
      return new Response(JSON.stringify([{
        chunk_id: "ASKP1-C000168",
        document_id: "ASKP1-0069",
        title: "Counting and Claiming Module 2026-27",
        source_filename: "Counting and Claiming Module 2026-27.pdf",
        topic_category: "Counting and Claiming",
        document_year: "2026",
        source_type: "PDF",
        locator_type: "page",
        locator_number: 4,
        citation_label: "Counting and Claiming Module 2026-27 - page 4",
        content: "The Food Production Worksheet serves as the balance point used to verify the number of meals served.",
        semantic_similarity: 0.88,
        text_rank: 0.42,
        combined_score: 0.79,
      }]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === "https://api.openai.com/v1/responses") {
      const grounded = {
        supported: true,
        answer: "Use the Food Production Worksheet as the balance point to verify that food served supports the meals claimed.",
        citation_ids: ["ASKP1-C000168"],
      };
      return new Response(JSON.stringify({
        output: [{ content: [{ type: "output_text", text: JSON.stringify(grounded) }] }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  };

  const { default: handler } = await import(`${new URL(`file:///${modulePath.replace(/\\/g, "/")}`).href}?test=${Date.now()}`);
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
    socket: { remoteAddress: "127.0.0.1" },
    body: { question: "How do I complete a production record?", categories: [] },
  }, response);

  assert.equal(statusCode, 200);
  assert.equal(responseBody.supported, true);
  assert.match(responseBody.answer, /Food Production Worksheet/);
  assert.equal(responseBody.citations.length, 1);
  assert.equal(responseBody.citations[0].chunkId, "ASKP1-C000168");
  assert.equal(responseBody.citations[0].locatorNumber, 4);
  console.log("Ask SPARK route test passed with a grounded answer and page citation.");
} finally {
  await fs.rm(tempDirectory, { recursive: true, force: true });
}
