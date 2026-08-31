import fs from "node:fs";
import path from "node:path";

const EXPECTED_DOCUMENTS = 96;
const EXPECTED_CHUNKS = 1415;
const CORPUS_VERSION = "phase1-2026-08-31";
const EMBEDDING_MODEL = process.env.ASK_SPARK_EMBEDDING_MODEL || "text-embedding-3-small";
const BATCH_SIZE = 50;

function requireValue(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function readCorpus(filePath) {
  const rows = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Invalid JSON on corpus line ${index + 1}.`);
      }
    });

  const documents = new Map();
  for (const row of rows) {
    if (!row.chunk_id || !row.document_id || !row.text || !row.source_sha256) {
      throw new Error(`Chunk ${row.chunk_id || "unknown"} is missing required fields.`);
    }
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

  if (documents.size !== EXPECTED_DOCUMENTS || rows.length !== EXPECTED_CHUNKS) {
    throw new Error(
      `Corpus safety check failed: found ${documents.size} documents and ${rows.length} chunks; expected ${EXPECTED_DOCUMENTS} and ${EXPECTED_CHUNKS}.`
    );
  }
  return { documents: [...documents.values()], chunks: rows };
}

async function openAiEmbeddings(texts, apiKey) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts, dimensions: 1536 }),
  });
  if (!response.ok) throw new Error(`Embedding request failed (${response.status}): ${await response.text()}`);
  const result = await response.json();
  return result.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

async function upsert(table, rows, supabaseUrl, serviceKey) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=${table === "ask_spark_documents" ? "document_id" : "chunk_id"}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(`Supabase ${table} upsert failed (${response.status}): ${await response.text()}`);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const pathArg = args.find((arg) => !arg.startsWith("--"));
  if (!pathArg) throw new Error("Provide the absolute path to chunks.jsonl.");

  const corpusPath = path.resolve(pathArg);
  const { documents, chunks } = readCorpus(corpusPath);
  console.log(`Validated ${documents.length} approved documents and ${chunks.length} chunks.`);
  console.log("Only approved metadata, chunk text, citation locators, and embeddings will be uploaded.");
  if (!apply) {
    console.log("Dry run complete. Add --apply to upload after the migration is installed.");
    return;
  }

  const supabaseUrl = requireValue("SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = requireValue("SUPABASE_SERVICE_ROLE_KEY");
  const openAiKey = requireValue("OPENAI_API_KEY");
  await upsert("ask_spark_documents", documents, supabaseUrl, serviceKey);

  for (let offset = 0; offset < chunks.length; offset += BATCH_SIZE) {
    const batch = chunks.slice(offset, offset + BATCH_SIZE);
    const embeddings = await openAiEmbeddings(batch.map((row) => row.text), openAiKey);
    const records = batch.map((row, index) => ({
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
    await upsert("ask_spark_chunks", records, supabaseUrl, serviceKey);
    console.log(`Uploaded ${Math.min(offset + BATCH_SIZE, chunks.length)} / ${chunks.length} chunks.`);
  }
  console.log("Ask SPARK Phase 1 corpus load complete.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
