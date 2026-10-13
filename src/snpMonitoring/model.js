import {SNACK_QUESTIONS,snackDefaults,validateSnack} from '../snackMonitoring/spec.js';
// Transcribed from district SNP-23, supplied 2025-09-08. N/A is printed only for 1a–1f.
export const SECTIONS = ['Site Information & Required Postings','Meal Service Observation','Records & Staff Interview','Food Safety & Compliance','Findings & Corrective Actions','Signatures & PDF Preview'];
const q = (id, text, section, na=false) => ({id,text,section,options:na?['Yes','No','N/A']:['Yes','No'],trigger:Number.parseInt(id,10)>=18?'Yes':'No'});
export const QUESTIONS = [
 ...['Cafeteria','Meals served at cart','Meals served in the classroom','Meals served in the office','Meals served on a field trip','Meals served on weekends'].map((t,i)=>q(`1${'abcdef'[i]}`,`Does the meal count system match the site collection procedures: ${t}?`,1,true)),
 q('4','Do all meals served meet the menu pattern requirements?',1),
 q('5','Is the method used for counting reimbursable meals in compliance with the approved point of service requirement? (Meal counts must be taken at the location(s) where complete meals are served to children.)',1),
 q('6',"Is the point of service meal count used to determine the school’s claim for reimbursement?",1),
 q('7','Is the person responsible for monitoring and counting meals correctly identifying reimbursable meals?',1),
 q('8','Does the count system prevent overt identification of the eligible needy?',1),
 q('9','Are internal controls (edits, monitoring, etc.) established to ensure that daily counts do not exceed the number of students eligible or in attendance and that an accurate claim is made?',2),
 ...['Second meals?','Lost, stolen, misused, forgotten or destroyed tickets, tokens, IDs, etc.?','Adult and non-student meals (and identifying program vs. nonprogram)?','A la carte?','Field trips?','Charged and/or prepaid meals?','Unpaid meal charges?'].map((t,i)=>q(`10${'abcdefg'[i]}`,`Is the school correctly implementing policies for handling the following (as applicable): ${t}`,2)),
 q('11','Is someone trained as a backup for the monitor and the meal counter?',2),
 q('12','Are there procedures for meal counting and claiming when the primary counting and claiming system is not available? Do staff know when and how to implement them?',2),
 q('13','Are daily counts correctly totaled and recorded?',2),
 q('14','If claims are aggregated, are the meal counts correctly totaled and consolidated?',2),
 q('15i','Is the civil rights poster displayed in the feeding area for public viewing?',0),
 q('16i','Is the wellness policy posted in public view in the cafeteria or other central eating area?',0),
 q('17i','Is the most recent food safety inspection posted in the feeding area for public viewing?',3),
 q('17ii','Is staff following HACCP plan and standard operating procedures?',3),
 q('17iii','Are thermometers located in all refrigerators and freezers and temperatures documented daily?',3),
 ...['Maintenance of the Nonprofit School Food Service Account?','Paid Lunch Equity?','Revenue from Nonprogram Foods?','Indirect Costs?'].map((t,i)=>q(`18${'abcd'[i]}`,`Were any issues readily observed in relation to Resource Management: ${t}`,3)),
 ...['One or more category counts are "backed-out" (subtracting out meals from total meal counts to determine free, reduced price, and/or paid category counts).','Pre-counts (morning counts, ordering counts) are used for the meal count claim.','The count system relies on memory or visual identification for eligibility determination.'].map((t,i)=>q(`19${'abc'[i]}`,`Does your system include any of the following practices? ${t}`,3)),
 ...['Free and Reduced-price Process – including verification, notification, and other procedures','Reporting and Recordkeeping','Smart Snacks','Water','Professional Standards','SBP and SFSP Outreach','Other'].map((t,i)=>q(`20${'abcdefg'[i]}`,`Were any issues readily observed in other general areas: ${t}?`,3))
];
export const questionsFor=d=>d?.program==='eec-snack'?SNACK_QUESTIONS:QUESTIONS;
export const signaturePages=d=>d?.program==='eec-snack'?[1,2]:[2,3];
export const GRADES=['K-5','K-8','6-8','9-12','EEC'];
export const localDate=()=>new Date().toLocaleDateString('en-CA');
export function dueDate(date) {const d=new Date(`${date}T12:00:00Z`);if(!Number.isFinite(+d))return '';d.setUTCDate(d.getUTCDate()+45);return d.toISOString().slice(0,10);}
export function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
export function newDraft(site,staff='',monitor='',program='snp') {return {siteName:site.name,visitDate:localDate(),meal:'',staff,monitor,arrival:'',departure:'',menu:'',procedures:'',otherService:'',grades:[],answers:{},observations:{},additional:[],noFindings:false,signatures:{},...(program==='eec-snack'?snackDefaults():{})};}
export function findings(d) {
 return [...questionsFor(d).filter(q=>d.answers?.[q.id]===q.trigger).map(q=>({...d.observations?.[q.id],id:q.id,required:true})),...(d.additional||[]).map(f=>({...f,required:false}))];
}
export function unresolved(d){return findings(d).filter(f=>f.category!=='minor'&&(!f.completed||f.followup));}
export function canonical(d){const {signatures,...rest}=d;const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;return JSON.stringify(sorted(rest));}
export function changed(d,patch){return {...d,...patch,signatures:{},noFindings:patch.noFindings??(patch.answers||patch.observations||patch.additional?false:d.noFindings)};}
export function validate(d,signatures=true){
 const questions=questionsFor(d);const snack=d?.program==='eec-snack';
 const errors=[];const add=(section,message)=>errors.push({section,message});
 if(!d||typeof d!=='object')return [{section:0,message:'Open a valid draft.'}];
 for(const [key,label] of [['siteName','Site'],['staff','Site staff responsible']])if(!String(d[key]||'').trim())add(0,`${label} is required.`);
 if(!validDate(d.visitDate))add(0,'Enter a valid review date.');
 if(d.program&&!['snp','eec-snack'].includes(d.program))add(0,'Unknown monitoring program.');
 if(snack)validateSnack(d,add);
 if(!snack&&!['Breakfast','Lunch'].includes(d.meal))add(0,'Choose Breakfast or Lunch.');
 for(const k of ['arrival','departure'])if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(d[k]||''))add(0,`Enter ${k} time.`);
 if(d.arrival&&d.departure&&d.departure<d.arrival)add(0,'Departure must be after arrival.');
 if(!d.menu?.trim())add(1,'Record all menu items and serving sizes.');
 if(!snack&&!d.procedures?.trim())add(2,'Question 2: record where the procedures are kept.');
 if(!snack&&(!Array.isArray(d.grades)||!d.grades.length||d.grades.some(g=>!GRADES.includes(g))))add(1,'Question 3: select the menu planning grade group(s).');
 for(const q of questions)if(!q.options.includes(d.answers?.[q.id]))add(q.section,`Question ${q.id} is unanswered.`);
 const fs=findings(d);
 const extraIds=(d.additional||[]).map(f=>f.id);
 if(extraIds.some(id=>!/^[a-f0-9-]{36}$/.test(id||''))||new Set(extraIds).size!==extraIds.length)add(4,'Additional findings must have distinct valid identifiers.');
 if(!['Yes','No'].includes(d.compliance))add(4,'Answer the final site compliance statement.');
 if(d.compliance==='No'&&!fs.some(f=>f.category!=='minor'))add(4,'Document the required corrective action when the site compliance statement is No.');
 if(d.compliance==='Yes'&&(unresolved(d).length||questions.some(q=>!q.options.includes(d.answers?.[q.id]))))add(4,'The site cannot be declared free of corrective actions when unresolved findings or unanswered questions remain.');
 if(d.noFindings&&(fs.length||questions.some(q=>!q.options.includes(d.answers?.[q.id]))))add(4,'No Findings cannot override findings or unanswered questions.');
 if(!fs.length&&!d.noFindings)add(4,'Confirm No Findings after reviewing all responses.');
 if(fs.length>60)add(4,'Use at most 60 findings.');
 for(const f of fs){
  if(!f.observation?.trim())add(4,`Finding ${f.id}: describe the observation.`);
  if(!['onsite','followup','minor'].includes(f.category)||f.required&&f.category==='minor')add(4,`Finding ${f.id}: select corrected during visit or follow-up required.`);
  if(f.category!=='minor'){
   if(!f.action?.trim())add(4,`Finding ${f.id}: document corrective action.`);
   if(typeof f.followup!=='boolean')add(4,`Finding ${f.id}: specify whether follow-up remains required.`);
   if(f.category==='followup'&&!f.followup)add(4,`Finding ${f.id}: follow-up is required for this category.`);
   if(f.followup&&(!validDate(f.due)||f.due<d.visitDate||f.due>dueDate(d.visitDate)))add(4,`Finding ${f.id}: follow-up must be due within 45 calendar days of the visit.`);
   if(!f.followup&&!validDate(f.completed))add(4,`Finding ${f.id}: enter the completion date.`);
   if(!f.followup&&!f.verification?.trim())add(4,`Finding ${f.id}: document how the correction was verified.`);
   if(f.completed&&(!validDate(f.completed)||f.completed<d.visitDate))add(4,`Finding ${f.id}: completion cannot precede the visit.`);
   if(f.category==='onsite'&&f.completed!==d.visitDate)add(4,`Finding ${f.id}: an onsite correction must have the visit completion date.`);
  }
 }
 if(signatures)for(const role of ['monitor','representative']){
  const s=d.signatures?.[role];
  if(s?.printedName!==String(d[role]||'').trim())add(5,`The ${role} printed name must match the accepted signature.`);
  if(!s||!s.printedName?.trim()||!validDate(s.date)||s.date<d.visitDate||JSON.stringify(s.pages)!==JSON.stringify(signaturePages(d))||!Number.isFinite(Date.parse(s.acceptedAt))||!(s.aspectRatio>0&&s.aspectRatio<=20)||!Array.isArray(s.strokes)||!s.strokes.length||s.strokes.length>80||s.strokes.flat().length>4000||!s.strokes.some(l=>l.length>1)||s.strokes.some(l=>!Array.isArray(l)||l.length>1500||l.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1))))add(5,`Accept a valid ${role} signature on pages ${signaturePages(d).join(" and ")}.`);
 }
 return errors;
}
export function filename(d){return `${d.siteName.replace(/[^a-z0-9 -]/gi,'').trim().replace(/\s+/g,'_')}_${d.program==='eec-snack'?'EEC-Snack':'SNP-'+d.meal}_${d.visitDate}.pdf`;}
