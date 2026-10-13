import {PDFDocument,StandardFonts} from 'pdf-lib';
import {flattenOriginal} from '../snpMonitoring/flattenOriginal.js';
import {findings} from '../snpMonitoring/model.js';
import {SNACK_QUESTIONS} from './spec.js';
import fields from './fields.js';
export const TEMPLATE_SHA256='d6ea60217a3b43cf4ed5ab7cbcdad1ea3899239b0d269fa2faf4f49d39ca970a';
export function formatTime(value){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value||''))return '';const [hour,minute]=value.split(':');const h=Number(hour);return `${h%12||12}:${minute} ${h<12?'AM':'PM'}`;}
export async function generatePdf(template,d){
 const pdf=await PDFDocument.load(template,{updateMetadata:false});
 if(pdf.getPageCount()!==2)throw Error('The official snack template must contain both pages.');
 flattenOriginal(pdf,new Set(['Text3','Text4']));
 const pages=pdf.getPages(),font=await pdf.embedFont(StandardFonts.Helvetica);
 const fail=label=>{throw Error(`${label} does not fit the official field. Shorten that entry; nothing has been truncated.`);};
 function wrap(value,width,size){const lines=[];for(const para of String(value??'').split(/\r?\n/)){let line='';for(const word of para.split(/\s+/).filter(Boolean)){if(font.widthOfTextAtSize(word,size)>width)fail('A word');const next=line?line+' '+word:word;if(font.widthOfTextAtSize(next,size)>width){lines.push(line);line=word;}else line=next;}lines.push(line);}return lines;}
 function box(page,value,r,label,size=12,min=8,center=false){let lines;const [x,y,x2,y2]=r;for(;size>=min;size-=.25){lines=wrap(value,x2-x-4,size);if((lines.length===1?size:lines.length*(size+2))<=y2-y-2)break;}if(size<min)fail(label);lines.forEach((line,i)=>page.drawText(line,{x:center?(x+x2-font.widthOfTextAtSize(line,size))/2:x+2,y:center?(y+y2+lines.length*(size+2))/2-size-i*(size+2):y2-size-2-i*(size+2),size,font}));}
 function field(key,value,size=12,center=false){for(const f of fields[key])box(pages[f.page],value,f.rect,key,size,7,center);}
 function mark(key){for(const f of fields[key]){const [x,y,x2,y2]=f.rect;pages[f.page].drawLine({start:{x:x+3,y:y+3},end:{x:x2-3,y:y2-3},thickness:1.1});pages[f.page].drawLine({start:{x:x+3,y:y2-3},end:{x:x2-3,y:y+3},thickness:1.1});}}
 const date=s=>`${s.slice(5,7)}/${s.slice(8,10)}/${s.slice(2,4)}`;
 field('EEC',d.siteName.replace(/\s+(EEC|Early Education Center)$/i,''));field('REVIEW DATE',date(d.visitDate));
 field('ARRIVAL TIME',formatTime(d.arrival));field('DEPARTURE TIME',formatTime(d.departure));mark('Check Box1');
 field('SERVING TIMERow1',formatTime(d.servingTime),14,true);field('ATTENDANCE TODAYRow1',d.attendance,16,true);field('Text12',d.children,16,true);field('Text5','0',16,true);
 if(d.capacityNA)mark('Check Box3');else field('LICENSEROOM CAPACITY Check Box if NARow1',d.capacity,16,true);
 mark('Check Box4');field('Text3','N/A',16,true);field('Text4','N/A',16,true);
 box(pages[0],d.menu,[40,410,183,475],'Snack menu',13);
 for(const [key,text,num] of [['milk','MILK',6],['meat','MEATALTERNATE',7],['grain','GRAINBREAD',8],['produce','VEGETABLEFRUIT',9]])if(d.components[key]?.selected){field('Text'+num,d.components[key].food,11);field('PLANNED SERVING SIZE'+text,d.components[key].portion,11,true);field('TOTAL AMOUNT PREPARED'+text,d.components[key].prepared,11,true);}
 const na={5:16,6:17,10:18,11:19,12:20};
 for(const q of SNACK_QUESTIONS){const a=d.answers[q.id],n=Number(q.id);mark(a==='N/A'?'Check Box'+na[n]:n===17?(a==='Yes'?'34':'35'):`Check Box15.${n-1}.${a==='Yes'?0:1}`);}
 mark(d.compliance==='Yes'?'36':'37');
 const fs=findings(d),dues=fs.filter(f=>f.followup).map(f=>f.due).sort();if(dues.length)field('Text11',date(dues[0]),7);
 const descriptions=[...fs.map(f=>`${f.required?'Q'+f.id:'Additional observation'}: ${f.observation}`),...(d.answers['17']==='Yes'?[`Training: ${d.training}`]:[]),...(!fs.length?['No findings. All responses reviewed.']:[])].join('\n\n');
 const actions=fs.length?fs.map(f=>`${f.required?'Q'+f.id:'Additional observation'}: ${f.category==='minor'?'Minor observation / no formal corrective action.':`${f.action}\n${f.completed?'Completed: '+f.completed+'. ':''}${f.followup?'Follow-up required by '+f.due+'.':'Verified: '+f.verification}`}`).join('\n\n'):'No corrective actions required.';
 const desc=wrap(descriptions,539,9),act=wrap(actions,539,9),count=Math.max(1,Math.ceil(desc.length/12),Math.ceil(act.length/12));
 const findingPages=[pages[1]];for(let i=1;i<count;i++){const [copy]=await pdf.copyPages(pdf,[1]);pdf.addPage(copy);findingPages.push(copy);}
 function signature(page,s,r){const [x,y,x2,y2]=r,ratio=s.aspectRatio,pts=s.strokes.flat(),xs=pts.map(p=>p[0]*ratio),ys=pts.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),scale=Math.min((x2-x-4)/Math.max(Math.max(...xs)-minX,.02),(y2-y-4)/Math.max(Math.max(...ys)-minY,.02));const point=p=>({x:x+2+(p[0]*ratio-minX)*scale,y:y2-2-(p[1]-minY)*scale});for(const line of s.strokes)for(let i=1;i<line.length;i++)page.drawLine({start:point(line[i-1]),end:point(line[i]),thickness:.85});}
 for(const [role,key,second] of [['monitor','Monitors Signature','Monitors Signature_2'],['representative','Site Representatives Signature','Site Representatives Signature_2']]){signature(pages[0],d.signatures[role],fields[key][0].rect);for(const page of findingPages)signature(page,d.signatures[role],fields[second][0].rect);}
 findingPages.forEach((page,i)=>{desc.slice(i*12,(i+1)*12).forEach((line,j)=>page.drawText(line,{x:40,y:578-j*18,size:9,font}));act.slice(i*12,(i+1)*12).forEach((line,j)=>page.drawText(line,{x:40,y:319-j*18,size:9,font}));if(count>1)page.drawText(`Findings sheet ${i+1} of ${count}`,{x:407,y:605,size:8,font});});
 return pdf.save();
}
