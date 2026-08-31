const EXPECTED_DOCUMENTS = 96;
const EXPECTED_CHUNKS = 1415;
const CORPUS_VERSION = "phase1-2026-08-31";
const MAX_BATCH_SIZE = 25;
const EMBEDDING_MODEL = process.env.ASK_SPARK_EMBEDDING_MODEL || "gemini-embedding-001";

function send(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function normalizeSupabaseUrl(value) {
  const parsed = new URL(String(value || "").trim());
  if (parsed.protocol !== "https:") {
    throw new Error("SUPABASE_URL must use https.");
  }
  return parsed.origin;
}

function requireEnvironment() {
  const rawSupabaseUrl = process.env.SUPABASE_URL?.trim();
  const values = {
    supabaseUrl: rawSupabaseUrl ? normalizeSupabaseUrl(rawSupabaseUrl) : "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    geminiKey: process.env.GEMINI_API_KEY?.trim(),
    importToken: process.env.ASK_SPARK_IMPORT_TOKEN?.trim(),
  };
  for (const [name, value] of Object.entries(values)) {
    if (!value) throw new Error(`Missing server configuration: ${name}.`);
  }
  return values;
}

function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_BATCH_SIZE) {
    throw new Error(`Each import batch must contain 1-${MAX_BATCH_SIZE} rows.`);
  }

  return rows.map((row, index) => {
    const required = [
      "chunk_id",
      "document_id",
      "text",
      "source_sha256",
      "source_filename",
      "title",
      "topic_category",
      "source_type",
      "locator_type",
      "citation_label",
    ];
    for (const field of required) {
      if (typeof row?.[field] !== "string" || !row[field].trim()) {
        throw new Error(`Row ${index + 1} is missing ${field}.`);
      }
    }
    return row;
  });
}

async function geminiEmbeddings(texts, apiKey) {
  const result = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`,
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: 1536,
        })),
      }),
    }
  );

  if (!result.ok) {
    throw new Error(`Gemini embedding request failed (${result.status}).`);
  }

  const body = await result.json();
  if (!Array.isArray(body.embeddings) || body.embeddings.length !== texts.length) {
    throw new Error("Gemini embedding response did not match the import batch.");
  }
  return body.embeddings.map((item) => item.values);
}

function restUrl(supabaseUrl, table, params = {}) {
  const url = new URL(`/rest/v1/${encodeURIComponent(table)}`, supabaseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function upsert(table, rows, supabaseUrl, serviceKey) {
  const conflict = table === "ask_spark_documents" ? "document_id" : "chunk_id";
  const url = restUrl(supabaseUrl, table, { on_conflict: conflict });
  const result = await fetch(url, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!result.ok) {
    const detail = await result.text();
    throw new Error(`Supabase ${table} upsert failed (${result.status}): ${detail.slice(0, 300)}`);
  }
}

async function countRows(table, filter, supabaseUrl, serviceKey) {
  const url = restUrl(supabaseUrl, table, { select: "*", limit: 1 });
  if (filter) {
    for (const pair of filter.split("&")) {
      const separator = pair.indexOf("=");
      if (separator > 0) {
        url.searchParams.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
    }
  }
  const result = await fetch(url, {
    method: "GET",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  if (!result.ok) {
    const detail = await result.text();
    throw new Error(`Could not verify ${table} (${result.status}): ${detail.slice(0, 300)}`);
  }
  const range = result.headers.get("content-range") || "";
  const total = Number(range.split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

export default async function handler(request, response) {
  if (process.env.VERCEL_ENV !== "preview") {
    return send(response, 404, { error: "Importer is available only on Preview deployments." });
  }
  if (request.method !== "POST") {
    return send(response, 405, { error: "Method not allowed." });
  }
  if (!sameOrigin(request)) {
    return send(response, 403, { error: "Origin not allowed." });
  }

  try {
    const { supabaseUrl, serviceKey, geminiKey, importToken } = requireEnvironment();
    const suppliedToken = String(request.headers["x-ask-spark-import-token"] || "");
    if (!suppliedToken || suppliedToken !== importToken) {
      return send(response, 401, { error: "Import token is incorrect." });
    }

    const action = request.body?.action;

    if (action === "verify") {
      const documents = await countRows(
        "ask_spark_documents",
        "approved=eq.true&corpus_version=eq.phase1-2026-08-31",
        supabaseUrl,
        serviceKey
      );
      const chunks = await countRows(
        "ask_spark_chunks",
        "corpus_version=eq.phase1-2026-08-31",
        supabaseUrl,
        serviceKey
      );
      const embeddedChunks = await countRows(
        "ask_spark_chunks",
        "corpus_version=eq.phase1-2026-08-31&embedding=not.is.null",
        supabaseUrl,
        serviceKey
      );
      return send(response, 200, {
        documents,
        chunks,
        embeddedChunks,
        complete:
          documents === EXPECTED_DOCUMENTS &&
          chunks === EXPECTED_CHUNKS &&
          embeddedChunks === EXPECTED_CHUNKS,
      });
    }

    if (action !== "import") {
      return send(response, 400, { error: "Unknown import action." });
    }

    const rows = validateRows(request.body?.rows);
    const documents = new Map();
    for (const row of rows) {
      documents.set(row.document_id, {
        document_id: row.document_id,
        source_filename: row.source_filename,
        title: row.title,
        topic_category: row.topic_category,
        document_year: row.document_year || null,
        source_type: row.source_type,
        source_sha256: row.source_sha256,
        approved: true,
        corpus_version: CORPUS_VERSION,
      });
    }

    await upsert("ask_spark_documents", [...documents.values()], supabaseUrl, serviceKey);
    const embeddings = await geminiEmbeddings(rows.map((row) => row.text), geminiKey);
    const chunks = rows.map((row, index) => ({
      chunk_id: row.chunk_id,
      document_id: row.document_id,
      topic_category: row.topic_category,
      locator_type: row.locator_type,
      locator_number: Number.isFinite(Number(row.locator_number)) ? Number(row.locator_number) : null,
      chunk_sequence_in_locator: Number(row.chunk_sequence_in_locator) || 1,
      citation_label: row.citation_label,
      content: row.text,
      character_count: Number(row.character_count) || row.text.length,
      embedding: embeddings[index],
      corpus_version: CORPUS_VERSION,
    }));
    await upsert("ask_spark_chunks", chunks, supabaseUrl, serviceKey);

    return send(response, 200, { imported: rows.length });
  } catch (error) {
    console.error("Ask SPARK import error:", error);
    return send(response, 500, { error: error?.message || "Ask SPARK import failed." });
  }
}
