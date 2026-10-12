import {PDFDocument,PDFName,PDFDict,StandardFonts,rgb,pushGraphicsState,popGraphicsState,concatTransformationMatrix,drawObject} from 'pdf-lib';
import fields from './fields.js';
import {QUESTIONS,GRADES,findings} from './model.js';
export const TEMPLATE_SHA256='2ba206d0eacaf53e0b051dbc8f073541ec28150a458c72871b65278fc7d5e4e5';
// Final signed reports are static; editable answers remain in the saved draft.
// Original page content, including LAUSD's agency appearance and notices, is preserved.
export async function generatePdf(template,d){
 const pdf=await PDFDocument.load(template,{updateMetadata:false});
 if(pdf.getPageCount()!==4)throw Error('The official SNP template must contain all four pages.');
 // Shared field widgets in this source confuse generic flattening (lost agency,
 // dangling references, resized boxes). Paint original appearances directly.
 for(const page of pdf.getPages()){
  const annotations=page.node.Annots();
  for(let i=0;annotations&&i<annotations.size();i++){
   const widget=annotations.lookup(i);if(widget.get(PDFName.of('Subtype'))?.toString()!=='/Widget')continue;
   const ap=widget.lookup(PDFName.of('AP'));const normal=ap?.lookup(PDFName.of('N'));
   const ref=normal instanceof PDFDict?normal.get(PDFName.of('Off')):ap?.get(PDFName.of('N'));
   if(!ref)continue;const stream=pdf.context.lookup(ref);if(!stream?.dict)continue;
   stream.dict.set(PDFName.of('Type'),PDFName.of('XObject'));stream.dict.set(PDFName.of('Subtype'),PDFName.of('Form'));
   const b=stream.dict.lookup(PDFName.of('BBox')).asArray().map(n=>n.asNumber()),r=widget.lookup(PDFName.of('Rect')).asArray().map(n=>n.asNumber());
   const sx=(r[2]-r[0])/(b[2]-b[0]),sy=(r[3]-r[1])/(b[3]-b[1]);
   const name=page.node.newXObject('OriginalWidget',ref);
   page.pushOperators(pushGraphicsState(),concatTransformationMatrix(sx,0,0,sy,r[0]-b[0]*sx,r[1]-b[1]*sy),drawObject(name),popGraphicsState());
  }
  // Keep district notice hyperlinks, but remove all interactive form widgets.
  if(annotations){const links=[];for(let i=0;i<annotations.size();i++)if(annotations.lookup(i).get(PDFName.of('Subtype'))?.toString()==='/Link')links.push(annotations.get(i));if(links.length)page.node.set(PDFName.of('Annots'),pdf.context.obj(links));else page.node.delete(PDFName.of('Annots'));}
 }
 pdf.catalog.delete(PDFName.of('AcroForm'));pdf.catalog.delete(PDFName.of('OpenAction'));pdf.catalog.delete(PDFName.of('AA'));
 const font=await pdf.embedFont(StandardFonts.Helvetica);const pages=pdf.getPages();
 const fail=label=>{throw Error(`${label} does not fit the official field. Shorten that entry; nothing has been truncated.`);};
 function wrap(value,width,size){const result=[];for(const para of String(value||'').split(/\r?\n/)){let line='';for(const word of para.split(/\s+/).filter(Boolean)){if(font.widthOfTextAtSize(word,size)>width)fail('A word');const next=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(next,size)>width){result.push(line);line=word;}else line=next;}result.push(line);}return result;}
 function box(page,value,rect,label,size=9,min=7){let lines;const [x,y,x2,y2]=rect;while(size>=min){lines=wrap(value,x2-x-4,size);if(lines.length*(size+2)<=y2-y-3)break;size-=0.25;}if(size<min)fail(label);lines.forEach((line,i)=>page.drawText(line,{x:x+2,y:y2-size-2-i*(size+2),size,font,color:rgb(0,0,0)}));}
 function field(name,value,size=9){for(const f of fields[name])box(pages[f.page],value,f.rect,name,size);}
 function mark(name){for(const f of fields[name]){const [x,y,x2,y2]=f.rect;pages[f.page].drawLine({start:{x:x+3,y:y+3},end:{x:x2-3,y:y2-3},thickness:1.2});pages[f.page].drawLine({start:{x:x+3,y:y2-3},end:{x:x2-3,y:y+3},thickness:1.2});}}
 const shortDate=s=>`${s.slice(5,7)}/${s.slice(8,10)}/${s.slice(2,4)}`;
 field('SITE',d.siteName);field('DATE',shortDate(d.visitDate),8);
 field('ARRIVAL TIME',d.arrival);field('DEPARTURE TIME',d.departure);field('SITE STAFF RESPONSIBLE FOR MEAL COUNTS',d.staff,8);
 field('Todays Menu Record All Food Items Served and Serving Sizes',d.menu,9);
 // The original form's widget labels for Q1g and Q2 are reversed visually.
 field('Where Is a copy of the procedures located on site',d.otherService||'');field('Text16',d.procedures);
 mark(d.meal.toLowerCase());mark('Check Box13'); // CEP, not P2.
 mark(d.compliance==='Yes'?'Check Box14':'Check Box15');
 GRADES.forEach((g,i)=>{if(d.grades.includes(g))mark(['Check Box8','Check Box9','Check Box10','Check Box11','Check Box3'][i]);});
 const order1=['1a','1b','1c','1d','1e','1f','4','5','6','7','8','9','10a','10b','10c','10d','10e','10f'];
 const order2=['10g','11','12','13','14','15i','16i','17i','17ii','17iii','18a','18b','18c','18d','19a','19b','19c','20a','20b','20c','20d','20e','20f','20g'];
 for(const q of QUESTIONS){const answer=d.answers[q.id];if(answer==='N/A'){mark(`Check Box4.${order1.indexOf(q.id)}`);continue;}let name;if(order1.includes(q.id))name=`Check Box17.${order1.indexOf(q.id)}.${answer==='Yes'?0:1}`;else {const i=order2.indexOf(q.id);name=`Check Box${i<20?1:2}.${i<20?i:i-20}.${answer==='Yes'?0:1}`;}mark(name);}
 mark(`Check Box2.4.${d.compliance==='Yes'?0:1}`);
 const fs=findings(d);const dues=fs.filter(f=>f.followup).map(f=>f.due).sort();field('Text7',dues.length?shortDate(dues[0]):'See findings / completed');
 const descriptions=fs.length?fs.map(f=>`${f.required?'Q'+f.id:'Additional observation'}: ${f.observation}\n${f.category==='minor'?'Minor observation / no formal finding':`Corrective action: ${f.action}\n${f.category==='onsite'?'Corrected during visit. ':''}${f.followup?`Follow-up required by ${f.due}.`:`Correction verified: ${f.verification}`}`}`).join('\n\n'):'No findings. All required responses reviewed.';
 const actions=fs.length?fs.map(f=>`${f.required?'Q'+f.id:'Additional observation'}: ${f.category==='minor'?'No formal corrective action required.':`${f.action}\n${f.completed?'Completed: '+f.completed+'. ':''}${f.followup?'Follow-up remains required by '+f.due+'.': 'Verification: '+f.verification}`}`).join('\n\n'):'No corrective actions required.';
 const descLines=wrap(descriptions,539,9),actionLines=wrap(actions,539,9);
 // Overflow uses additional copies of the original findings page, never a replacement form.
 const count=Math.max(Math.ceil(descLines.length/13),Math.ceil(actionLines.length/12),1);
 const continuationPages=[];
 for(let i=1;i<count;i++){const [copy]=await pdf.copyPages(pdf,[2]);pdf.insertPage(3+i-1,copy);continuationPages.push(copy);}
 const findingPages=[pages[2],...continuationPages];
 function signature(page,s,rect){const [x,y,x2,y2]=rect;const ratio=s.aspectRatio;const pts=s.strokes.flat();const xs=pts.map(p=>p[0]*ratio),ys=pts.map(p=>p[1]);const minX=Math.min(...xs),minY=Math.min(...ys);const scale=Math.min((x2-x-4)/Math.max(Math.max(...xs)-minX,.02),(y2-y-14)/Math.max(Math.max(...ys)-minY,.02));const pos=p=>({x:x+2+(p[0]*ratio-minX)*scale,y:y2-2-(p[1]-minY)*scale});for(const line of s.strokes)for(let i=1;i<line.length;i++)page.drawLine({start:pos(line[i-1]),end:pos(line[i]),thickness:.85});box(page,`${s.printedName} ${shortDate(s.date)}`,[x,y-2,x2,y+11],'Signature printed name/date',6,5);}
 for(const [role,key] of [['monitor','Monitors Signature'],['representative','Site Representatives Signature']]){
  const widgets=fields[key];signature(pages[1],d.signatures[role],widgets.find(f=>f.page===1).rect);
  for(const p of findingPages)signature(p,d.signatures[role],widgets.find(f=>f.page===2).rect);
 }
 findingPages.forEach((p,i)=>{descLines.slice(i*13,(i+1)*13).forEach((line,j)=>p.drawText(line,{x:40,y:592-j*18,size:9,font}));actionLines.slice(i*12,(i+1)*12).forEach((line,j)=>p.drawText(line,{x:40,y:316-j*18,size:9,font}));if(count>1)p.drawText(`Findings sheet ${i+1} of ${count}`,{x:400,y:615,size:8,font});});
 return pdf.save();
}
