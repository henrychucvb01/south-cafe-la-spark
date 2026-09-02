import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "202609010005_expand_ar_training_to_500.sql"), "utf8");
const start = migration.indexOf("insert into public.ar_training_questions");
const end = migration.indexOf("on conflict (id)", start);
if (start < 0 || end < 0) throw new Error("AR question seed section is missing");
const seed = migration.slice(start, end);
const value = String.raw`\$arq\$([\s\S]*?)\$arq\$`;
const rowPattern = new RegExp(
  String.raw`^\s*\(${value},\s*(\d+),\s*${value},\s*${value},\s*${value},\s*${value}::jsonb,\s*([0-3]),\s*${value},\s*${value},\s*${value},\s*${value},\s*true\)[,;]?$`,
  "gm",
);
const rows = [];
let match;
while ((match = rowPattern.exec(seed))) {
  rows.push({ id: match[1], order: Number(match[2]), type: match[3], category: match[4], prompt: match[5], choices: JSON.parse(match[6]), correctIndex: Number(match[7]), explanation: match[8], sourceTitle: match[9], sourceLocator: match[10], chunkId: match[11] });
}
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
check(rows.length === 500, `Expected 500 questions, found ${rows.length}`);
check(new Set(rows.map((row) => row.id)).size === 500, "Question IDs are not unique");
check(new Set(rows.map((row) => row.order)).size === 500, "Bank order values are not unique");
check(Math.min(...rows.map((row) => row.order)) === 1 && Math.max(...rows.map((row) => row.order)) === 500, "Bank order must span 1–500");
const forbidden = /\b(EEC|CMS|Gold Standard|CACFP)\b/i;
for (const row of rows) {
  check(Array.isArray(row.choices) && row.choices.length === 4, `${row.id}: expected four choices`);
  check(new Set(row.choices.map((choice) => choice.toLowerCase().trim())).size === 4, `${row.id}: duplicate choices`);
  check(row.correctIndex >= 0 && row.correctIndex < 4, `${row.id}: invalid correctIndex`);
  check(Boolean(row.explanation && row.sourceTitle && row.sourceLocator && row.chunkId), `${row.id}: missing provenance`);
  check(!forbidden.test(`${row.prompt} ${row.choices.join(" ")} ${row.explanation} ${row.sourceTitle}`), `${row.id}: forbidden material`);
}
check(/offset v_state\.batch_index \* 50 limit 50/i.test(migration), "50-question batch query is missing");
check(/batch_index = 9 then cycle_number \+ 1/i.test(migration), "Full-bank reshuffle cycle is missing");
check(/points_awarded < 10/i.test(migration) && /v_points := least\(2, 10 - v_progress\.points_awarded\)/i.test(migration), "2-point/10-point scoring cap is missing");
check(/extract\(isodow from p_service_date\) between 1 and 5/i.test(migration), "Weekday scoring rule is missing");
check(/^\s*begin;/im.test(migration) && /commit;\s*$/i.test(migration), "Migration must run transactionally");
check(!/^\s*\('/m.test(seed), "Question seed must use apostrophe-safe dollar-quoted literals");
check(/expected 500 active questions/i.test(migration) && /expected 500 active answer keys/i.test(migration), "Post-migration count assertions are missing");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
const categories = Object.fromEntries([...new Set(rows.map((row) => row.category))].sort().map((category) => [category, rows.filter((row) => row.category === category).length]));
console.log(JSON.stringify({ questions: rows.length, uniqueIds: 500, batchSize: 50, categories }, null, 2));
