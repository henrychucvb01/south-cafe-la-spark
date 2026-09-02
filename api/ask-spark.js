const MAX_QUESTION_LENGTH = 500;
const NO_ANSWER =
  "I couldn't find enough approved guidance to answer that confidently. Try describing what happened or what you need to do, and I'll search again.";
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

function expandDomainTerms(question) {
  return String(question || "")
    .replace(/\bAR\b/gi, "Administrative Review (AR)")
    .replace(/\bBIC\b/gi, "Breakfast in the Classroom (BIC)")
    .replace(/\bMPLH\b/gi, "Meals Per Labor Hour (MPLH)");
}

function conversationalResponse(question) {
  const normalized = String(question || "")
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
  const greetings = new Set(["hi", "hello", "hey", "hiya", "howdy", "good morning", "good afternoon", "good evening"]);
  if (greetings.has(normalized)) {
    const greeting = normalized.startsWith("good ") ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}!` : "Hey!";
    return `${greeting} 👋 What can I help you with today?`;
  }
  if (/^(thanks|thank you|thx|ty|thanks spark|thank you spark)$/.test(normalized)) return "You got it! ✨ I'm here whenever you need me.";
  if (/^(help|help me|what can you do|what do you do)$/.test(normalized)) return "Sure! Ask me about cafeteria procedures, production records, meal counting, BIC, food safety, field trips, special diets, Administrative Review prep, or other manager training guidance.";
  if (/^(who are you|what are you)$/.test(normalized)) return "I'm Ask SPARK ✨ — your cafeteria operations and training assistant. Ask me a work question and I'll check the approved training guidance for the answer.";
  return null;
}

async function interpretQuestion(question, apiKey) {
  const model = process.env.ASK_SPARK_ANSWER_MODEL || "gemini-3.6-flash";
  const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `You rewrite short, messy, misspelled cafeteria-manager questions into a strong search query for an internal approved training library. Preserve the manager's likely intent without answering the question or inventing policy. Expand obvious cafeteria terminology and useful synonyms. AR means Administrative Review, BIC means Breakfast in the Classroom, and MPLH means Meals Per Labor Hour. For vague illness wording such as "kid gets sick", include relevant search concepts such as student illness, student worker illness, vomiting, diarrhea, employee health, food safety, exclusion/restriction, and manager procedure, without asserting that any particular rule applies. Return JSON only: {"search_query":string}.` }] },
      contents: [{ role: "user", parts: [{ text: question }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: { type: "object", properties: { search_query: { type: "string" } }, required: ["search_query"] },
      },
    }),
  });
  if (!result.ok) throw new Error(`Intent service returned ${result.status}.`);
  const payload = await result.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
  const parsed = text ? JSON.parse(text) : null;
  return String(parsed?.search_query || "").trim();
}

async function createEmbedding(question, apiKey) {
  const model = process.env.ASK_SPARK_EMBEDDING_MODEL || "gemini-embedding-001";
  const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ model: `models/${model}`, content: { parts: [{ text: question }] }, taskType: "RETRIEVAL_QUERY", outputDimensionality: 1536 }),
  });
  if (!result.ok) throw new Error(`Embedding service returned ${result.status}.`);
  const body = await result.json();
  if (!Array.isArray(body?.embedding?.values)) throw new Error("Embedding service returned no vector.");
  return body.embedding.values;
}

async function retrieveChunks({ question, embedding, categories, supabaseUrl, serviceKey }) {
  let result;
  try {
    result = await fetch(`${supabaseUrl}/rest/v1/rpc/ask_spark_hybrid_search_rest`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query_text: question, query_embedding: embedding, match_count: 18, filter_categories: categories.length ? categories : null }),
    });
  } catch (error) {
    const cause = error?.cause?.code || error?.cause?.message || "unknown network error";
    throw new Error(`Knowledge search network failure (${cause}).`);
  }
  if (!result.ok) {
    const details = (await result.text()).trim().slice(0, 1000);
    throw new Error(`Knowledge search returned ${result.status}${details ? `: ${details}` : "."}`);
  }
  const rows = await result.json();
  return Array.isArray(rows) ? rows : [];
}

function buildContext(chunks) {
  return chunks.map((chunk) => `[${chunk.chunk_id}] ${chunk.citation_label}\nCategory: ${chunk.topic_category}\n${chunk.content}`).join("\n\n---\n\n");
}

async function generateAnswer({ question, retrievalQuestion, chunks, apiKey }) {
  const model = process.env.ASK_SPARK_ANSWER_MODEL || "gemini-3.6-flash";
  const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `You are Ask SPARK, a friendly school cafeteria operations assistant. For cafeteria work questions, answer ONLY from the supplied approved excerpts. Never use outside knowledge or invent LAUSD policy. The manager may type casually, misspell words, or describe a situation instead of using official terminology; infer their intended question from the original wording and retrieval meaning. AR means Administrative Review, not Arkansas. Write naturally and practically for a cafeteria manager. Do not add labels such as "Confirmed answer" or "Verified answer". If the excerpts do not actually support an answer, set supported to false. Every factual work instruction in a supported answer must be backed by cited chunk IDs. Return JSON only: {"supported":boolean,"answer":string,"citation_ids":string[]}.` }] },
      contents: [{ role: "user", parts: [{ text: `Manager's original question:\n${question}\n\nInterpreted search intent (not a source):\n${retrievalQuestion}\n\nApproved retrieved excerpts:\n${buildContext(chunks)}` }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: { type: "object", properties: { supported: { type: "boolean" }, answer: { type: "string" }, citation_ids: { type: "array", items: { type: "string" } } }, required: ["supported", "answer", "citation_ids"] },
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
  if (!generated?.supported || !String(generated.answer || "").trim()) return { supported: false, answer: NO_ANSWER, citations: [] };
  const byId = new Map(chunks.map((chunk) => [chunk.chunk_id, chunk]));
  const ids = [...new Set(Array.isArray(generated.citation_ids) ? generated.citation_ids : [])];
  const cited = ids.map((id) => byId.get(id)).filter(Boolean);
  if (!cited.length || cited.length !== ids.length) return { supported: false, answer: NO_ANSWER, citations: [] };
  const seenSources = new Set();
  const uniqueCited = cited.filter((chunk) => {
    const key = [chunk.source_filename, chunk.locator_type, chunk.locator_number].join("|");
    if (seenSources.has(key)) return false;
    seenSources.add(key);
    return true;
  });
  return { supported: true, answer: String(generated.answer).trim(), citations: uniqueCited.map((chunk) => ({ chunkId: chunk.chunk_id, title: chunk.title, sourceFilename: chunk.source_filename, category: chunk.topic_category, year: chunk.document_year || null, sourceType: chunk.source_type, locatorType: chunk.locator_type, locatorNumber: chunk.locator_number, citationLabel: chunk.citation_label })) };
}

export default async function handler(request, response) {
  if (!originIsAllowed(request)) return send(response, 403, { error: "Origin not allowed." });
  if (request.method !== "POST") return send(response, 405, { error: "Method not allowed." });
  if (isRateLimited(request)) return send(response, 429, { error: "Please wait a moment before asking another question." });
  const question = String(request.body?.question || "").trim();
  const categories = Array.isArray(request.body?.categories) ? request.body.categories.map((value) => String(value).trim()).filter(Boolean).slice(0, 3) : [];
  if (!question) return send(response, 400, { error: "Please enter a question." });
  if (question.length > MAX_QUESTION_LENGTH) return send(response, 400, { error: `Please keep the question under ${MAX_QUESTION_LENGTH} characters.` });

  const conversational = conversationalResponse(question);
  if (conversational) return send(response, 200, { supported: true, conversational: true, answer: conversational, citations: [] });

  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!supabaseUrl || !serviceKey || !geminiKey) {
    const missing = [!supabaseUrl ? "SUPABASE_URL" : null, !serviceKey ? "SUPABASE_SERVICE_ROLE_KEY" : null, !geminiKey ? "GEMINI_API_KEY" : null].filter(Boolean);
    return send(response, 503, { error: `Ask SPARK configuration is missing: ${missing.join(", ")}.` });
  }
  try {
    const parsedSupabaseUrl = new URL(supabaseUrl);
    if (parsedSupabaseUrl.protocol !== "https:") throw new Error("SUPABASE_URL must use https.");
  } catch (error) {
    return send(response, 503, { error: `Ask SPARK configuration has an invalid SUPABASE_URL: ${error.message}` });
  }

  let retrievalQuestion = expandDomainTerms(question);
  try {
    const interpreted = await interpretQuestion(retrievalQuestion, geminiKey);
    if (interpreted) retrievalQuestion = interpreted;
  } catch (error) {
    console.warn("Ask SPARK intent interpretation fallback:", error.message);
  }

  let embedding;
  try {
    embedding = await createEmbedding(retrievalQuestion, geminiKey);
  } catch (error) {
    console.error("Ask SPARK embedding error:", error);
    return send(response, 500, { error: `Ask SPARK embedding step failed: ${error.message}` });
  }

  let chunks;
  try {
    chunks = await retrieveChunks({ question: retrievalQuestion, embedding, categories, supabaseUrl, serviceKey });
  } catch (error) {
    console.error("Ask SPARK retrieval error:", error);
    return send(response, 500, { error: `Ask SPARK training-library search failed: ${error.message}` });
  }

  const credible = chunks.filter((chunk) => Number(chunk.text_rank) > 0 || Number(chunk.semantic_similarity) >= 0.36);
  if (!credible.length) return send(response, 200, { supported: false, answer: NO_ANSWER, citations: [] });

  let generated;
  try {
    generated = await generateAnswer({ question, retrievalQuestion, chunks: credible.slice(0, 12), apiKey: geminiKey });
  } catch (error) {
    console.error("Ask SPARK answer error:", error);
    return send(response, 500, { error: `Ask SPARK answer step failed: ${error.message}` });
  }
  return send(response, 200, validatedResult(generated, credible));
}
