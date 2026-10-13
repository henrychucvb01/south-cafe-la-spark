import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {newDraft,validate,findings,canonical,signaturePages} from '../src/snpMonitoring/model.js';
import {SNACK_QUESTIONS} from '../src/snackMonitoring/spec.js';
import {generatePdf,TEMPLATE_SHA256} from '../src/snackMonitoring/pdf.js';
import {createHandler} from '../api/snp-monitoring.js';
const sign=d=>{d.signatures=Object.fromEntries(['monitor','representative'].map(role=>[role,{printedName:d[role],date:d.visitDate,pages:signaturePages(d),strokes:[[[.1,.2],[.4,.7],[.8,.3]]],aspectRatio:3,acceptedAt:'2026-10-12T18:00:00Z',contentHash:createHash('sha256').update(canonical(d)).digest('hex')}]));return d;};
const fixture=()=>sign({...newDraft({name:'Dolores EEC'},'Test Staff','Test Monitor','eec-snack'),representative:'Test Rep',visitDate:'2026-10-12',arrival:'14:00',departure:'15:00',servingTime:'14:30',menu:'Milk and crackers',areaEligible:'Yes',attendance:'20',children:'20',adults:'0',capacity:'24',components:{milk:{selected:true,food:'Milk',portion:'4 oz',prepared:'80 oz'},grain:{selected:true,food:'Crackers',portion:'1/2 oz',prepared:'10 oz'}},answers:Object.fromEntries(SNACK_QUESTIONS.map(q=>[q.id,q.trigger==='Yes'?'No':'Yes'])),noFindings:true,compliance:'Yes'});
assert.equal(SNACK_QUESTIONS.length,17);assert.deepEqual(validate(fixture()),[]);
assert.deepEqual(SNACK_QUESTIONS.filter(q=>q.options.includes('N/A')).map(q=>q.id),['5','6','10','11','12']);
for(const q of SNACK_QUESTIONS){const d=fixture();d.answers[q.id]=q.trigger;assert.equal(findings(d)[0].id,q.id);assert.ok(validate(d).length);}
const capacity=fixture();capacity.capacityNA=true;capacity.capacity='';assert.deepEqual(validate(sign(capacity)),[]);
const invalid=fixture();invalid.children='-1';assert.ok(validate(invalid).some(e=>e.message.includes('children')));
invalid.children='20';invalid.components.grain.selected=false;assert.ok(validate(invalid).some(e=>e.message.includes('two')));
const nonArea=fixture();nonArea.areaEligible='No';assert.ok(validate(nonArea).some(e=>e.message.includes('applications')));nonArea.applications={free:'10',reduced:'5',paid:'5'};nonArea.claimed={free:'10',reduced:'5',paid:'5'};assert.deepEqual(validate(sign(nonArea)),[]);
const training=fixture();training.answers['17']='Yes';training.training='Review procedures with staff on October 15.';training.noFindings=false;training.compliance='No';training.observations['17']={observation:'Counting procedure needs training.',category:'followup',action:'Provide training and observe a service.',followup:true,due:'2026-10-15'};assert.deepEqual(validate(sign(training)),[]);
const template=await readFile('public/eec-snack-monitoring-2024-02-06.pdf');assert.equal(createHash('sha256').update(template).digest('hex'),TEMPLATE_SHA256);await mkdir('test-results/snack',{recursive:true});
for(const [name,d] of [['clean',fixture()],['non-area',nonArea],['training',training]]){const bytes=await generatePdf(template,d);const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),2);assert.equal(pdf.getForm().getFields().length,0);await writeFile(`test-results/snack/${name}.pdf`,bytes);}
const many=fixture();many.noFindings=false;many.additional=Array.from({length:15},()=>({id:randomUUID(),observation:'Additional observation requiring a follow-up visit.',category:'followup',action:'Review procedure and document corrective action.',followup:true,due:'2026-11-01'}));many.compliance='No';sign(many);assert.deepEqual(validate(many),[]);const bytes=await generatePdf(template,many);assert.ok((await PDFDocument.load(bytes)).getPageCount()>2);await writeFile('test-results/snack/continuation.pdf',bytes);
const token=randomUUID()+randomUUID(),id=randomUUID();let payload=fixture(),finals=0;
const handler=createHandler({database:{rpc:async(name)=>({data:name==='snp_get'?{id,revision:1,status:'draft',payload}:name==='supper_context'?{actor_role:'supervisor'}:(finals++,{id,status:'finalized'})})}});
const call=async(action,previewHash)=>{const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(b){this.body=b;},send(b){this.body=b;}};await handler({method:'POST',headers:{authorization:`Bearer ${token}`},body:{id,revision:1,action,previewHash}},res);return res;};
const preview=await call('preview');assert.equal(preview.code,200,JSON.stringify(preview.body));assert.equal((await PDFDocument.load(preview.body)).getPageCount(),2);assert.equal((await call('finalize',preview.headers['X-SNP-Preview-Hash'])).code,200);assert.equal(finals,1);payload.menu='Changed';assert.equal((await call('preview')).code,422);
console.log('Snack: 17 questions, N/A and training rules, counts, two components, signatures, two-page PDF, overflow and API template selection passed.');
