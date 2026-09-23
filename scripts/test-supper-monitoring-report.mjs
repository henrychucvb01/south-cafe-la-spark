import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { generateOfficialPdf, ReportFitError } from "../src/supperMonitoring/pdf.js";
import { OFFICIAL_FORM } from "../src/supperMonitoring/officialForm.js";
import { submissionErrors, createHandler } from "../api/supper-monitoring.js";
import { makeFixture, signFixture } from "./supper-monitoring-fixture.mjs";

const template = await readFile(new URL("../public/supper-monitoring-2022-09-08.pdf", import.meta.url));
await mkdir("test-results/supper-monitoring", { recursive: true });
for (const withFindings of [false, true]) {
  const data = makeFixture(withFindings);
  assert.deepEqual(submissionErrors(data), []);
  const bytes = await generateOfficialPdf(template, data, { school_name: "TEST SCHOOL - QA ONLY" });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2);
  assert.equal(pdf.getForm().getFields().length, 0, "Completed PDF must not retain editable fields");
  await writeFile(`test-results/supper-monitoring/report-${withFindings ? "findings" : "no-findings"}.pdf`, bytes);
}
assert.deepEqual(OFFICIAL_FORM.questions.filter(q => q.options.includes("na")).map(q => q.id), ["4"]);
const data = makeFixture(); data.comments = "Changed after signature";
assert.ok(submissionErrors(data).some(e => e.message.includes("current report content")));
const long = makeFixture(); long.comments = "Long comment ".repeat(400); signFixture(long);
await assert.rejects(() => generateOfficialPdf(template,long,{ school_name:"TEST" }), ReportFitError);
const tampered = makeFixture(); tampered.answers["20"] = "na"; signFixture(tampered);
assert.ok(submissionErrors(tampered).some(e => e.field === "question-20"));
const overdue = makeFixture(true); overdue.correctiveActions["19"].operatingDays = "61"; signFixture(overdue);
assert.ok(submissionErrors(overdue).some(e => e.field === "action-19-operatingDays"));
const fixed = makeFixture(); fixed.answers["18a"] = "yes"; fixed.answers["18b"] = "yes"; signFixture(fixed);
assert.deepEqual(submissionErrors(fixed), [], "Corrected prior findings do not require repeated-finding details");

const token = randomUUID()+randomUUID();
const record = { id:randomUUID(),location_id:1,revision:3,status:"draft",payload:makeFixture() };
let pdfBase64 = null;
const database = {
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data:{school_name:"TEST SCHOOL - QA ONLY"} }) }) }) }),
  rpc: async (name, args) => {
    if (args.p_token!==token) return {error:{message:"Session expired"}};
    if (name === "get_supper_monitoring") return {data:record};
    if (name === "read_supper_monitoring_pdf") return {data:pdfBase64};
    if (name === "finalize_supper_monitoring") {
      assert.equal(args.p_revision,record.revision);
      assert.equal(createHash("sha256").update(Buffer.from(args.p_pdf_base64,"base64")).digest("hex"),args.p_pdf_sha256);
      pdfBase64=args.p_pdf_base64; Object.assign(record,{status:"completed",revision:4}); return {data:record};
    }
    throw Error(`Unexpected RPC ${name}`);
  }
};
const handler=createHandler({database,templateLoader:async()=>template});
async function request(body,auth=token) {
  const response={code:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},send(body){this.body=body;return this;}};
  await handler({method:"POST",headers:{authorization:`Bearer ${auth}`},body:{id:record.id,revision:3,...body}},response);
  return response;
}
assert.equal((await request({action:"submit"},randomUUID()+randomUUID())).code,403);
assert.equal((await request({action:"submit",revision:2})).code,409);
assert.equal((await request({action:"preview"})).headers["Content-Type"],"application/pdf");
assert.equal(record.status,"draft");
assert.equal((await request({action:"submit"})).code,200);
assert.equal(record.status,"completed");
assert.equal((await request({action:"submit"})).code,200,"Retry is idempotent");
assert.equal((await request({action:"download"})).body.toString("base64"),pdfBase64);
console.log("PASS: exact template, two-page static PDFs, official question choices, 18b/19/20 validation, signature binding, overflow rejection, server scope, preview, submit/retry and stored download.");
