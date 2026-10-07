import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {PDFDocument,StandardFonts,degrees,rgb} from 'pdf-lib';
import QRCode from 'qrcode';
const source=(await readFile('src/breakfast/qrPrintPdf.js','utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
const {buildQrPrintPdf,qrPrintDefaults,qrLabelBoxes}=new Function('PDFDocument','StandardFonts','degrees','rgb','QRCode',source+';return {buildQrPrintPdf,qrPrintDefaults,qrLabelBoxes};')(PDFDocument,StandardFonts,degrees,rgb,QRCode);
const records=Array.from({length:5},(_,i)=>({room_code:['203','S14','B-204','102','A17'][i],campus_label:'Main Campus',teacher_name:'MUST NOT PRINT',url:`https://example.org/#breakfast/00000000-0000-4000-8000-00000000000${i}`}));
await mkdir('node_modules/.cache/qr-print',{recursive:true});
const normal=await buildQrPrintPdf(records,qrPrintDefaults);await writeFile('node_modules/.cache/qr-print/portrait.pdf',normal);assert.equal((await PDFDocument.load(normal)).getPageCount(),2);
const options={...qrPrintDefaults,orientation:'landscape',perPage:2,layout:'horizontal',order:'campus,qr,room',qrRotation:90,textRotation:90};
const rotated=await buildQrPrintPdf(records.slice(0,2),options);await writeFile('node_modules/.cache/qr-print/rotated.pdf',rotated);const pdf=await PDFDocument.load(rotated);assert.equal(pdf.getPages()[0].getWidth(),792);
for(const rotation of [0,90,180,270])for(const layout of ['vertical','horizontal'])for(const perPage of [1,2,4,6]){const opt={...qrPrintDefaults,layout,perPage,qrRotation:rotation,textRotation:rotation};const result=await buildQrPrintPdf(records.map(r=>({...r,campus_label:"West"})),opt);assert.equal((await PDFDocument.load(result)).getPageCount(),Math.ceil(records.length/perPage));for(let i=0;i<perPage;i++){const b=qrLabelBoxes(opt,i);assert(b.x>=24&&b.y>=24&&b.x+b.width<=588&&b.y+b.height<=768);}}
await assert.rejects(()=>buildQrPrintPdf([],qrPrintDefaults),/Select/);await assert.rejects(()=>buildQrPrintPdf([{room_code:'203'}],qrPrintDefaults),/QR is missing/);
await writeFile('node_modules/.cache/qr-print/room-only.pdf',await buildQrPrintPdf(records.slice(0,1),{...qrPrintDefaults,showCampus:false,perPage:1}));
console.log('QR labels: page counts, orientation, rotations, layouts, bounds, and missing QR validation passed.');
