const MAX_QUESTION_LENGTH = 500;
const NO_ANSWER =
  "Ask SPARK could not find a confirmed answer in the available training materials.";
const requestWindows = new Map();

function isRateLimited(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const key = forwarded || request.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (requestWindows.get(key) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 15) return true;
  recent.push(now);
  requestWindows.set(key, recent);
  return false;
}

function send(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function parseAllowedOrigins() {
  return String(process.env.ASK_SPARK_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function originIsAllowed(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const configured = parseAllowedOrigins();
  if (configured.includes(origin)) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

async function createEmbedding(question, apiKey) {
  const model = process.env.ASK_SPARK_EMBEDDING_MODEL || "gemini-embedding-001";
  const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${model}`,
      content: { parts: [{ text: question }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: 1536,
    }),
  });
  if (!result.ok) throw new Error(`Embedding service returned ${result.status}.`);
  const body = await result.json();
  if (!Array.isArray(body?.embedding?.values)) throw new Error("Embedding service returned no vector.");
  return body.embedding.values;
}

async function retrieveChunks({ question, embedding, categories, supabaseUrl, serviceKey }) {
  const result = await fetch(`${supabaseUrl}/rest/v1/rpc/ask_spark_hybrid_search`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query_text: question,
      query_embedding: embedding,
      match_count: 12,
      filter_categories: categories.length ? categories : null,
    }),
  });
  if (!result.ok) throw new Error(`Knowledge search returned ${result.status}.`);
  const rows = await result.json();
  return Array.isArray(rows) ? rows : [];
}

function buildContext(chunks) {
  return chunks
    .map(
      (chunk) =>
        `[${chunk.chunk_id}] ${chunk.citation_label}\nCategory: ${chunk.topic_category}\n${chunk.content}`
    )
    .join("\n\n---\n\n");
}

async function generateAnswer({ question, chunks, apiKey }) {
  const model = process.env.ASK_SPARK_ANSWER_MODEL || "gemini-3.6-flash";
  const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: `You are Ask SPARK, a retrieval-only assistant for school cafeteria managers. Answer ONLY from the supplied approved excerpts. Never use outside knowledge or invent LAUSD policy. Give a concise, direct, manager-friendly answer. If the excerpts do not confirm the answer, set supported to false. Every factual instruction in a supported answer must be backed by one or more cited chunk IDs. Return JSON only: {"supported":boolean,"answer":string,"citation_ids":string[]}. Do not include citation labels in the answer text.`,
        }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: `Manager question:\n${question}\n\nApproved retrieved excerpts:\n${buildContext(chunks)}` }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            supported: { type: "boolean" },
            answer: { type: "string" },
            citation_ids: { type: "array", items: { type: "string" } },
          },
          required: ["supported", "answer", "citation_ids"],
        },
      },
    }),
  });
  if (!result.ok) throw new Error(`Answer service returned ${result.status}.`);
  const payload = await result.json();
  const outputText = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
  if (!outputText) throw new Error("Answer service returned no text.");
  return JSON.parse(outputText);
}

function validatedResult(generated, chunks) {
  if (!generated?.supported || !String(generated.answer || "").trim()) {
    return { supported: false, answer: NO_ANSWER, citations: [] };
  }
  const byId = new Map(chunks.map((chunk) => [chunk.chunk_id, chunk]));
  const ids = [...new Set(Array.isArray(generated.citation_ids) ? generated.citation_ids : [])];
  const cited = ids.map((id) => byId.get(id)).filter(Boolean);
  if (!cited.length || cited.length !== ids.length) {
    return { supported: false, answer: NO_ANSWER, citations: [] };
  }
  return {
    supported: true,
    answer: String(generated.answer).trim(),
    citations: cited.map((chunk) => ({
      chunkId: chunk.chunk_id,
      title: chunk.title,
      sourceFilename: chunk.source_filename,
      category: chunk.topic_category,
      year: chunk.document_year || null,
      sourceType: chunk.source_type,
      locatorType: chunk.locator_type,
      locatorNumber: chunk.locator_number,
      citationLabel: chunk.citation_label,
    })),
  };
}

export default async function handler(request, response) {
  if (!originIsAllowed(request)) return send(response, 403, { error: "Origin not allowed." });
  if (request.method !== "POST") return send(response, 405, { error: "Method not allowed." });
  if (isRateLimited(request)) return send(response, 429, { error: "Please wait a moment before asking another question." });

  const question = String(request.body?.question || "").trim();
  const categories = Array.isArray(request.body?.categories)
    ? request.body.categories.map((value) => String(value).trim()).filter(Boolean).slice(0, 3)
    : [];
  if (!question) return send(response, 400, { error: "Please enter a question." });
  if (question.length > MAX_QUESTION_LENGTH) {
    return send(response, 400, { error: `Please keep the question under ${MAX_QUESTION_LENGTH} characters.` });
  }

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!supabaseUrl || !serviceKey || !geminiKey) {
    const missing = [
      !supabaseUrl ? "SUPABASE_URL" : null,
      !serviceKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
      !geminiKey ? "GEMINI_API_KEY" : null,
    ].filter(Boolean);
    return send(response, 503, { error: `Ask SPARK configuration is missing: ${missing.join(", ")}.` });
  }

  let embedding;
  try {
    embedding = await createEmbedding(question, geminiKey);
  } catch (error) {
    console.error("Ask SPARK embedding error:", error);
    return send(response, 500, { error: `Ask SPARK embedding step failed: ${error.message}` });
  }

  let chunks;
  try {
    chunks = await retrieveChunks({ question, embedding, categories, supabaseUrl, serviceKey });
  } catch (error) {
    console.error("Ask SPARK retrieval error:", error);
    return send(response, 500, { error: `Ask SPARK training-library search failed: ${error.message}` });
  }

  const credible = chunks.filter(
    (chunk) => Number(chunk.text_rank) > 0 || Number(chunk.semantic_similarity) >= 0.42
  );
  if (!credible.length) return send(response, 200, { supported: false, answer: NO_ANSWER, citations: [] });

  let generated;
  try {
    generated = await generateAnswer({ question, chunks: credible.slice(0, 10), apiKey: geminiKey });
  } catch (error) {
    console.error("Ask SPARK answer error:", error);
    return send(response, 500, { error: `Ask SPARK answer step failed: ${error.message}` });
  }

  return send(response, 200, validatedResult(generated, credible));
}
