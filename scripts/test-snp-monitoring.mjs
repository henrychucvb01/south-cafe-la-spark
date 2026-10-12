import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {QUESTIONS,newDraft,validate,findings,changed,canonical,dueDate} from '../src/snpMonitoring/model.js';
import {generatePdf,TEMPLATE_SHA256} from '../src/snpMonitoring/pdf.js';
import {createHandler} from '../api/snp-monitoring.js';
export function fixture(){
 const d={...newDraft({name:'Synthetic SNP School'},'Test Site Representative','Test Monitor'),visitDate:'2026-10-12',arrival:'08:00',departure:'09:00',meal:'Breakfast',menu:'Milk 8 oz; cereal 1 oz; apple 1/2 cup',procedures:'Office binder',grades:['K-5'],representative:'Test Representative',noFindings:true,compliance:'Yes'};
 for(const q of QUESTIONS)d.answers[q.id]=q.trigger==='Yes'?'No':'Yes';
 return sign(d);
}
export function sign(d){const hash=createHash('sha256').update(canonical(d)).digest('hex');d.signatures=Object.fromEntries(['monitor','representative'].map(role=>[role,{printedName:d[role],date:d.visitDate,pages:[2,3],strokes:[[[.1,.2],[.4,.7],[.8,.3]]],aspectRatio:3,acceptedAt:'2026-10-12T18:00:00Z',contentHash:hash}]));return d;}
assert.equal(QUESTIONS.length,42);assert.deepEqual(QUESTIONS.filter(q=>q.options.includes('N/A')).map(q=>q.id),['1a','1b','1c','1d','1e','1f']);
assert.deepEqual(validate(fixture()),[]);
assert.equal(dueDate('2026-12-20'),'2027-02-03');
for(const q of QUESTIONS){const d=fixture();d.answers[q.id]=q.trigger;assert.equal(findings(d)[0].id,q.id);assert.ok(validate(d).length);}
const corrected=fixture();corrected.answers['4']='No';corrected.noFindings=false;corrected.compliance='No';corrected.observations['4']={category:'onsite',observation:'Serving size was too small.',action:'Correct portion served.',completed:corrected.visitDate,followup:false,verification:'Monitor observed corrected portions.'};sign(corrected);assert.deepEqual(validate(corrected),[]);assert.equal(findings(corrected).length,1,'Onsite correction cannot erase original finding');
const due=structuredClone(corrected);due.observations['4']={...due.observations['4'],category:'followup',followup:true,due:'2026-11-27'};assert.ok(validate(due).some(e=>e.message.includes('45')));due.observations['4'].due='2026-11-26';assert.deepEqual(validate(sign(due)),[]);
assert.deepEqual(changed(fixture(),{menu:'Changed'}).signatures,{});
assert.equal(changed(fixture(),{representative:'New name'}).noFindings,true,'Name edits do not erase a reviewed no-findings confirmation');
const forged=structuredClone(corrected);forged.observations['4']={...forged.observations['4'],required:false,category:'minor'};assert.ok(validate(forged).some(e=>e.message.includes('select corrected')),'Mandatory finding cannot be downgraded to minor');
assert.deepEqual(validate(sign({...corrected,compliance:'Yes'})),[],'Supervisor may explicitly conclude compliance after documented, verified correction');
const unresolvedYes=structuredClone(due);unresolvedYes.compliance='Yes';assert.ok(validate(unresolvedYes).some(e=>e.message.includes('unresolved findings')));
const template=await readFile(new URL('../public/snp-monitoring-2025-09-08.pdf',import.meta.url));assert.equal(createHash('sha256').update(template).digest('hex'),TEMPLATE_SHA256);
await mkdir('test-results/snp',{recursive:true});
for(const [name,d] of [['clean',fixture()],['finding',corrected],['followup',due]]){
 const bytes=await generatePdf(template,d);const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),4);assert.equal(pdf.getForm().getFields().length,0);await writeFile(`test-results/snp/${name}.pdf`,bytes);
}
const many=fixture();many.noFindings=false;many.compliance='No';for(const q of QUESTIONS){many.answers[q.id]=q.trigger;many.observations[q.id]={category:'followup',followup:true,observation:`Observation for ${q.id}. Review found a procedure requiring correction.`,action:'Retrain staff and verify the corrected procedure.',due:'2026-11-26'};}sign(many);assert.deepEqual(validate(many),[]);const long=await generatePdf(template,many);assert.ok((await PDFDocument.load(long)).getPageCount()>4);await writeFile('test-results/snp/continuation.pdf',long);
const token=randomUUID()+randomUUID(),id=randomUUID();let record={id,revision:1,status:'draft',payload:fixture()},role='supervisor',finalized=0;
const database={rpc:async(name,args)=>{if(name==='snp_get')return {data:record};if(name==='supper_context')return {data:{actor_role:role}};if(name==='snp_finalize'){finalized++;return {data:{...record,status:'finalized'}};}throw Error(name);}};
const handler=createHandler({database,templateLoader:async()=>template});
async function call(body,authorization=`Bearer ${token}`){const response={headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(b){this.body=b;return this;},send(b){this.body=b;return this;}};await handler({method:'POST',headers:{authorization},body:{id,revision:1,...body}},response);return response;}
assert.equal((await call({action:'preview'},'')).code,401);
role='manager';assert.equal((await call({action:'preview'})).code,403);role='supervisor';
assert.equal((await call({action:'finalize'})).code,409);
assert.equal((await call({action:'preview',revision:2})).code,409);
let result=await call({action:'preview'});assert.equal(result.code,200,JSON.stringify(result.body));assert.ok(result.headers['X-SNP-Preview-Hash']);
assert.equal((await call({action:'finalize',previewHash:result.headers['X-SNP-Preview-Hash']})).code,200);assert.equal(finalized,1);
record.payload.menu='Tampered after signatures';assert.equal((await call({action:'preview'})).code,422);assert.equal(finalized,1);
console.log('SNP model, 42 response triggers, 45-day deadlines, PDF/continuation pages, signature binding and API guards passed.');
