const MAX_QUESTION_LENGTH = 500;
const NO_ANSWER =
  "I couldn't find enough approved guidance to answer that confidently. Try describing what happened or what you need to do, and I'll search again.";
const BUSY_MESSAGE =
  "Ask SPARK is busy right now. Please try your question again in a moment.";
// This is the same public project URL used by the SPARK client. Keeping a
// server-side fallback prevents Ask SPARK from failing when a deployment has
// the private credentials but omits the non-secret SUPABASE_URL variable.
const DEFAULT_SUPABASE_URL = "https://kkrcxqhfzepifhkryodd.supabase.co";
const requestWindows = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimited(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const key = forwarded || request.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (requestWindows.get(key) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 60) return true;
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
  let expanded = String(question || "")
    .replace(/\bAR\b/gi, "Administrative Review (AR)")
    .replace(/\bBIC\b/gi, "Breakfast in the Classroom (BIC)")
    .replace(/\bMPLH\b/gi, "Meals Per Labor Hour (MPLH)");

  const normalized = expanded.toLowerCase();
  const concepts = [];
  const add = (text) => {
    if (!concepts.includes(text)) concepts.push(text);
  };

  if (/\b(kid|kids|child|children|student|students)\b/.test(normalized)) add("student pupil child");
  if (/\b(sick|ill|illness|vomit|vomiting|throw up|diarrhea|fever)\b/.test(normalized)) {
    add("illness sickness employee health food safety exclusion restriction symptoms manager procedure");
  }
  if (/\b(warm|hot|cold|temperature|temp)\b/.test(normalized)) add("food temperature time temperature control TCS food safety");
  if (/\b(milk|dairy)\b/.test(normalized)) add("milk dairy refrigeration temperature food safety");
  if (/\b(count|counts|counted|meal count|claim|claiming)\b/.test(normalized)) add("meal counting claiming point of service meal count forms edit check");
  if (/\b(production|production sheet|production record|worksheet)\b/.test(normalized)) add("food production worksheet production record planned prepared served leftovers");
  if (/\b(field trip|offsite|off-site|trip meal)\b/.test(normalized)) add("field trip offsite meals point of service roster meal service");
  if (/\b(allergy|allergies|special diet|different food|different meal|accommodation)\b/.test(normalized)) add("special diet food allergy meal accommodation medical statement");
  if (/\b(civil rights|discrimination|poster|complaint)\b/.test(normalized)) add("civil rights nondiscrimination complaint required posting");
  if (/\b(receive|receiving|delivery|deliveries|invoice|inventory|fifo|stock)\b/.test(normalized)) add("receiving delivery inventory FIFO storage inspection");
  if (/\b(clean|cleaning|sanitize|sanitizing|sanitation|bleach)\b/.test(normalized)) add("cleaning sanitizing sanitation HACCP food safety");
  if (/\b(leftover|leftovers|extra food|served extra)\b/.test(normalized)) add("leftovers served extra production record food safety");
  if (/\b(roster|teacher list|student list)\b/.test(normalized)) add("roster accountability meal count record keeping");
  if (/\b(breakfast|classroom breakfast)\b/.test(normalized)) add("Breakfast in the Classroom BIC breakfast service accountability");
  if (/\b(supper|cacfp)\b/.test(normalized)) add("supper CACFP meal service record keeping monitoring");

  return concepts.length ? `${expanded}\nRelated cafeteria training terms: ${concepts.join("; ")}` : expanded;
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

async function fetchWith429Retry(url, options, label) {
  const waits = [700, 1600];
  let result = await fetch(url, options);
  for (const wait of waits) {
    if (![429, 502, 503, 504].includes(result.status)) return result;
    await sleep(wait);
    result = await fetch(url, options);
  }
  if ([429, 502, 503, 504].includes(result.status)) {
    const error = new Error(`${label} is temporarily unavailable.`);
    error.code = "RATE_LIMITED";
    throw error;
  }
  return result;
}

function parseGeneratedOutput(outputText) {
  const normalized = outputText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const objectStart = normalized.indexOf("{");
  const objectEnd = normalized.lastIndexOf("}");
  const objectText = objectStart >= 0 && objectEnd > objectStart
    ? normalized.slice(objectStart, objectEnd + 1)
    : normalized;

  try {
    return JSON.parse(objectText);
  } catch (jsonError) {
    const supportedMatch = objectText.match(/["']?supported["']?\s*:\s*(true|false)/i);
    const answerMatch = objectText.match(/["']?answer["']?\s*:\s*(["'])([\s\S]*?)\1\s*,\s*["']?citation_ids["']?\s*:/i);
    const citationSection = objectText.match(/["']?citation_ids["']?\s*:\s*\[([\s\S]*?)\]/i);
    const citationIds = citationSection?.[1]?.match(/ASKP1-C\d{6}/g) || [];
    if (!supportedMatch || !answerMatch || (!citationSection && supportedMatch[1].toLowerCase() === "true")) {
      throw jsonError;
    }
    return {
      supported: supportedMatch[1].toLowerCase() === "true",
      answer: answerMatch[2].replace(/\\n/g, "\n").replace(/\\(["'\\])/g, "$1").trim(),
      citation_ids: citationIds,
    };
  }
}

async function createEmbedding(question, apiKey) {
  const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const listRes = await fetch(listUrl);

  if (!listRes.ok) {
    const errText = await listRes.text();
    throw new Error(`Google API Key check failed (${listRes.status}): ${errText}`);
  }

  const listData = await listRes.json();
  const availableModels = listData.models || [];

  const embedModels = availableModels
    .filter((m) => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("embedContent"))
    .map((m) => m.name);

  if (embedModels.length === 0) {
    const sampleAvailable = availableModels.map((m) => m.name.replace("models/", "")).slice(0, 6).join(", ");
    throw new Error(
      `Your Google API key does not have an embedding model enabled. Available models: [${sampleAvailable || "none found"}].`
    );
  }

  const chosenModelFull = embedModels.find((m) => m.includes("text-embedding-004")) || embedModels[0];
  const cleanModel = chosenModelFull.replace(/^models\//, "");

  const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:embedContent?key=${apiKey}`;
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${cleanModel}`,
      content: { parts: [{ text: question }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: 1536,
    }),
  };

  const result = await fetchWith429Retry(embedUrl, options, "Embedding service");
  if (!result.ok) {
    const errorDetails = await result.text();
    throw new Error(`Embedding request failed on model '${cleanModel}': ${errorDetails}`);
  }

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

function citationFromChunk(chunk) {
  return { chunkId: chunk.chunk_id, title: chunk.title, sourceFilename: chunk.source_filename, category: chunk.topic_category, year: chunk.document_year || null, sourceType: chunk.source_type, locatorType: chunk.locator_type, locatorNumber: chunk.locator_number, citationLabel: chunk.citation_label };
}

function extractiveFallback(question, chunks) {
  const ignored = new Set(["about", "approved", "cafeteria", "could", "manager", "procedure", "should", "spark", "training", "what", "when", "where", "which", "with"]);
  const questionTerms = new Set(String(question || "").toLowerCase().match(/[a-z0-9]+/g)?.filter((term) => term.length >= 4 && !ignored.has(term)) || []);
  const cited = chunks
    .filter((chunk) => {
      const contentTerms = new Set(String(chunk.content || "").toLowerCase().match(/[a-z0-9]+/g) || []);
      const overlap = [...questionTerms].filter((term) => contentTerms.has(term)).length;
      return overlap >= 2 || (overlap >= 1 && Number(chunk.semantic_similarity) >= 0.42);
    })
    .slice(0, 3);
  if (!cited.length) return { supported: false, answer: NO_ANSWER, citations: [] };
  const excerpts = cited.map((chunk) => {
    const content = String(chunk.content || "").replace(/\s+/g, " ").trim();
    const shortened = content.length > 450 ? `${content.slice(0, 447).trimEnd()}…` : content;
    return `• ${shortened}`;
  });
  return {
    supported: true,
    answer: `Ask SPARK found this confirmed guidance in the approved training library:\n\n${excerpts.join("\n\n")}`,
    citations: cited.map(citationFromChunk),
  };
}

async function generateAnswer({ question, retrievalQuestion, chunks, apiKey }) {
  // 1. Ask Google which generation models are active for this API key
  const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const listRes = await fetch(listUrl);

  let chosenModel = "gemini-1.5-flash-latest";

  if (listRes.ok) {
    const listData = await listRes.json();
    const genModels = (listData.models || [])
      .filter((m) => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""));

    // Auto-select: prefer 1.5-flash variants, then 2.0-flash, then any gemini model
    chosenModel =
      genModels.find((m) => m === "gemini-1.5-flash-latest") ||
      genModels.find((m) => m.includes("1.5-flash")) ||
      genModels.find((m) => m.includes("2.0-flash")) ||
      genModels.find((m) => m.includes("gemini")) ||
      genModels[0] ||
      "gemini-1.5-flash-latest";
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${apiKey}`;

  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: `You are Ask SPARK, a friendly school cafeteria operations assistant. For cafeteria work questions, answer ONLY from the supplied approved excerpts. Never use outside knowledge or invent LAUSD policy. The manager may type casually, misspell words, or describe a situation instead of using official terminology. Use the related cafeteria training terms only to understand the likely intent; they are not policy or evidence. AR means Administrative Review, not Arkansas. Write naturally and practically for a cafeteria manager. Do not add labels such as "Confirmed answer" or "Verified answer". If the excerpts do not actually support an answer, set supported to false. Every factual work instruction in a supported answer must be backed by cited chunk IDs. Return JSON only: {"supported":boolean,"answer":string,"citation_ids":string[]}.`,
        }],
      },
      contents: [{
        role: "user",
        parts: [{
          text: `Manager's original question:\n${question}\n\nSearch wording (not a source):\n${retrievalQuestion}\n\nApproved retrieved excerpts:\n${buildContext(chunks)}`,
        }],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            supported: { type: "boolean" },
            answer: { type: "string" },
            citation_ids: { type: "array", items: { type: "string" } },
          },
          required: ["supported", "answer", "citation_ids"],
          additionalProperties: false,
        },
      },
    }),
  };

  const result = await fetchWith429Retry(url, options, "Answer service");

  if (!result.ok) {
    const errorDetails = await result.text();
    console.error("Google Answer Error:", result.status, errorDetails);
    throw new Error(`Answer service returned ${result.status}: ${errorDetails}`);
  }

  const payload = await result.json();
  const outputText = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
  if (!outputText) throw new Error("Answer service returned no text.");
  return parseGeneratedOutput(outputText);
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
  return { supported: true, answer: String(generated.answer).trim(), citations: uniqueCited.map(citationFromChunk) };
}

export default async function handler(request, response) {
  if (!originIsAllowed(request)) return send(response, 403, { error: "Origin not allowed." });
  if (request.method !== "POST") return send(response, 405, { error: "Method not allowed." });
  if (isRateLimited(request)) return send(response, 429, { error: "Ask SPARK is receiving a lot of questions at once. Please try again in a moment." });
  const question = String(request.body?.question || "").trim();
  const categories = Array.isArray(request.body?.categories) ? request.body.categories.map((value) => String(value).trim()).filter(Boolean).slice(0, 3) : [];
  if (!question) return send(response, 400, { error: "Please enter a question." });
  if (question.length > MAX_QUESTION_LENGTH) return send(response, 400, { error: `Please keep the question under ${MAX_QUESTION_LENGTH} characters.` });

  const conversational = conversationalResponse(question);
  if (conversational) return send(response, 200, { supported: true, conversational: true, answer: conversational, citations: [] });

  const supabaseUrl = String(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).trim().replace(/\/+$/, "");
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

  const retrievalQuestion = expandDomainTerms(question);

  let embedding;
  try {
    embedding = await createEmbedding(retrievalQuestion, geminiKey);
  } catch (error) {
    console.error("Ask SPARK embedding error:", error);
    if (error.code === "RATE_LIMITED") return send(response, 503, { error: BUSY_MESSAGE });
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
    if (error.code === "RATE_LIMITED") return send(response, 200, extractiveFallback(question, credible));
    return send(response, 500, { error: `Ask SPARK answer step failed: ${error.message}` });
  }
  return send(response, 200, validatedResult(generated, credible));
}
