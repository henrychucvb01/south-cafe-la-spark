import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument } from "pdf-lib";
import { generateOfficialPdf, ReportFitError } from "../src/supperMonitoring/pdf.js";
import { changeDraft } from "../src/supperMonitoring/model.js";
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
const previewResponse=await request({action:"preview"});
assert.equal(previewResponse.headers["Content-Type"],"application/pdf");
assert.equal(record.status,"draft");
assert.equal((await request({action:"submit"})).code,200);
assert.equal(record.status,"completed");
assert.equal(previewResponse.body.toString("base64"),pdfBase64,"Submitted PDF exactly matches preview bytes");
assert.equal((await request({action:"submit"})).code,200,"Retry is idempotent");
assert.equal((await request({action:"download"})).body.toString("base64"),pdfBase64);
console.log("PASS: exact template, two-page static PDFs, official question choices, 18b/19/20 validation, signature binding, overflow rejection, server scope, preview, submit/retry and stored download.");

// Verify actual rendered PDF data, including values near the official field coordinates.
const multi=makeFixture();multi.unannounced=false;multi.adultMeals="9";
multi.serviceTimes.push({program:"Second Program",day:"Wednesday",start:"14:45",end:"15:15",observed:true});
multi.serviceTimes.push({program:"Tuesday Program",day:"Tuesday",start:"12:00",end:"12:30",observed:true});
signFixture(multi);
const multiBytes=await generateOfficialPdf(template,multi,{school_name:"TEST SCHOOL - QA ONLY",monitoring_site_name:"North Offsite"});
await writeFile('test-results/supper-monitoring/report-multiple-programs.pdf',multiBytes);
const task=getDocument({data:multiBytes.slice(),useSystemFonts:true});
const doc=await task.promise;
const page1=await doc.getPage(1),page2=await doc.getPage(2);
const first=(await page1.getTextContent()).items;
const second=(await page2.getTextContent()).items.map(i=>i.str).join(' ');
assert.ok(second.includes('North Offsite'));
assert.ok(first.some(i=>i.str==='98' && Math.abs(i.transform[4]-322)<1 && Math.abs(i.transform[5]-543)<1),'Average is a whole number in the official location');
assert.ok(first.some(i=>i.str === '0' && Math.abs(i.transform[4]-555)<1 && Math.abs(i.transform[5]-687)<1),'Adult meals is always 0 in the official location');
assert.ok(!first.some(i=>i.str === '9' && Math.abs(i.transform[4]-555)<1));
assert.ok(second.includes('Second Program') && second.includes('2:45 PM-3:15 PM'));
assert.ok(second.includes('TEST After School Program') && second.includes('2:30 PM-3:00 PM'));
assert.ok(!second.includes('Tuesday Program'),'Only services observed on the monitoring date print on the report');
// The unconditional unannounced mark is two line segments at its original coordinates.
const ops=await page1.getOperatorList();
const automaticBytes=await generateOfficialPdf(template,{...multi,unannounced:true,adultMeals:"0"},{school_name:"TEST SCHOOL - QA ONLY",monitoring_site_name:"North Offsite"});
const automaticTask=getDocument({data:automaticBytes,useSystemFonts:true});
const automaticDoc=await automaticTask.promise;
const normalizeOperators = value => JSON.stringify(value).replace(/g_d\d+_/g,"g_doc_");
assert.equal(normalizeOperators(await (await automaticDoc.getPage(1)).getOperatorList()),normalizeOperators(ops),"False/old adult values must render exactly like automatic Unannounced and Adult Meals 0");
await automaticTask.destroy();
await task.destroy();
for (const mutate of [d=>{d.arrivalTime='14:30';},d=>{d.departureTime='15:00';},d=>{d.history[0].meals='0';},d=>{d.todayAttendance='99';},d=>{d.serviceTimes=[];}]) {
 const invalid=makeFixture();mutate(invalid);signFixture(invalid);assert.ok(submissionErrors(invalid).length,'Server submission enforces guided business rules');
}
console.log('PASS: automatic adult-zero mapping, multiple observed programs and day-specific times, original PDF coordinates, and server submission business rules.');

for(const slot of ['manager_1','supervisor']) {
 let signed=makeFixture();signed.monitoringSlot=slot;signFixture(signed);
 const first=signed.signatures.monitor;
 signed=changeDraft(signed,'coordinatorName','Independent Coordinator');
 assert.equal(signed.signatures.monitor,first);
 assert.ok(!submissionErrors(signed).some(e=>e.field==='monitorSignature'||e.message.startsWith('Monitor:')));
 signed.signatures.coordinator={...first,printedName:'Independent Coordinator'};
 assert.deepEqual(submissionErrors(signed),[],'Both independently accepted signatures validate for '+slot);
 signed.monitorName='Tampered';assert.ok(submissionErrors(signed).some(e=>e.field==='monitorSignature'));
}
console.log('PASS: independent Manager/AFSS and Coordinator signature binding, site identity, whole-number PDF average, and byte-identical preview/submission.');
