import {PDFDocument, StandardFonts, layoutMultilineText} from 'pdf-lib';
import {drawSignature} from '../../supperMonitoring/pdf';

const group = (name, labels) => labels.map((label,i)=>({label,yes:`${name}.${i}.0`,no:`${name}.${i}.1`,na:name==='Check Box17'&&i<6?`Check Box4.${i}`:null}));
export const questions = [
 ...group('Check Box17',['1a Cafeteria','1b Cart','1c Classroom','1d Office','1e Field trips','1f Weekend service','4 Meets menu pattern','5 Approved point of service','6 Count used for claims','7 Correctly identifies reimbursable meals','8 Prevents overt identification','9 Internal controls','10a Second meals','10b Lost or misused IDs','10c Adult and non-student meals','10d À la carte','10e Field trips','10f Charged or prepaid meals']),
 ...group('Check Box1',['10g Unpaid meal charges','11 Backup staff trained','12 Backup counting procedures','13 Counts totaled and recorded','14 Claims consolidated correctly','15 Civil rights poster','16 Wellness policy posted','17i Food safety inspection posted','17ii HACCP followed','17iii Temperatures documented','18a Nonprofit account issues','18b Paid lunch equity issues','18c Nonprogram revenue issues','18d Indirect cost issues','19a Backed-out counts','19b Pre-counts used','19c Memory or visual identification','20a Free/reduced-price process issues','20b Reporting issues','20c Smart Snacks issues']),
 ...group('Check Box2',['20d Water issues','20e Professional standards issues','20f Outreach issues','20g Other issues'])
];
export const grades={'K–5':'Check Box8','K–8':'Check Box9','6–8':'Check Box10','9–12':'Check Box11',EEC:'Check Box3'};
export const filename = (name,meal='lunch') => `SNP ${meal==='breakfast'?'Breakfast':'Lunch'}-${name.trim().toUpperCase().replace(/[\\/:*?"<>|]/g,'-')}.pdf`;
const menuField = 'Todays Menu Record All Food Items Served and Serving Sizes';
function fitField(field,text,font,maxSize,multiline){
 const widgets=field.acroField.getWidgets().map(w=>w.getRectangle());
 const minSize=multiline?5:6;
 for(let size=maxSize;size>=minSize;size-=0.5){
  if(widgets.every(({width,height})=>{
   const bounds={x:0,y:0,width:width-6,height:height-6};
   if(!multiline)return font.widthOfTextAtSize(text,size)<=bounds.width&&font.heightAtSize(size)<=bounds.height;
   const layout=layoutMultilineText(text,{font,fontSize:size,bounds,alignment:0});
   return layout.lines.length*layout.lineHeight<=bounds.height&&layout.lines.every(line=>line.width<=bounds.width);
  })){field.setFontSize(size);return true;}
 }
 return false;
}
export async function fillLunch(template,draft){
 const doc=await PDFDocument.load(template),form=doc.getForm();
 if(!['pass','follow-up'].includes(draft.result))throw Error('Select Pass or Follow-Up before previewing.');
 const font=await doc.embedFont(StandardFonts.Helvetica);
 const date=draft.date.split('-');
 const fields={'AGENCY':'Los Angeles Unified School District','SITE':draft.site,'DATE':`${Number(date[1])}/${Number(date[2])}/${date[0]}`,'ARRIVAL TIME':draft.arrival,'DEPARTURE TIME':draft.departure,'SITE STAFF RESPONSIBLE FOR MEAL COUNTS':draft.staff,[menuField]:draft.menu,'Where Is a copy of the procedures located on site':draft.procedures,'Text16':draft.other,'Text1':draft.findings};
 for(const [key,value] of Object.entries(fields)) if(value){
  const field=form.getTextField(key);
  let text=value;
  if(key===menuField&&!fitField(field,text,font,11,true)){
   text=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).join(', ');
   if(!fitField(field,text,font,11,true))throw Error('The menu is too long for the original PDF box. Shorten the wording while keeping the items and serving sizes.');
  }
  if(key==='DATE'&&!fitField(field,text,font,9,false))throw Error('The date does not fit the original PDF box.');
  field.setText(text);
  if(key==='DATE'||key===menuField)field.updateAppearances(font);
 }
 form.getCheckBox('Check Box12').uncheck(); // P2
 form.getCheckBox('Check Box13').check(); // CEP
 form.getCheckBox('Check Box14')[draft.result==='pass'?'check':'uncheck']();
 form.getCheckBox('Check Box15')[draft.result==='follow-up'?'check':'uncheck']();
 form.getCheckBox(draft.meal==='breakfast'?'breakfast':'lunch').check();
 form.getCheckBox(draft.meal==='breakfast'?'lunch':'breakfast').uncheck();
 for(const grade of draft.grades) if(grades[grade]) form.getCheckBox(grades[grade]).check();
 for(const q of questions){const key=q[draft.answers[q.yes]];if(key)form.getCheckBox(key).check();}
 // Both signer fields have widgets on pages 2 and 3 of the original form.
 for(const [role,fieldName] of [['supervisor','Monitors Signature'],['manager','Site Representatives Signature']]){
  const signature=draft.signatures?.[role];
  if(!signature)continue;
  const field=form.getTextField(fieldName);
  const boxes=field.acroField.getWidgets().map(widget=>({
   page:doc.findPageForAnnotationRef(doc.context.getObjectRef(widget.dict)),
   rectangle:widget.getRectangle()
  }));
  if(boxes.length!==2||boxes.some(box=>!box.page))throw Error('Could not locate both signature spaces on the original SNP-23 form.');
  form.removeField(field);
  for(const {page,rectangle:{x,y,width,height}} of boxes){
   drawSignature(page,signature,{x:x+2,y:y+2,width:width-4,height:height-4});
  }
 }
 return doc.save();
}
