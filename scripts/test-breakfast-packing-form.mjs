import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {PDFDocument,StandardFonts,PDFName} from 'pdf-lib';
const itemSource=(await readFile('src/breakfast/packingItems.js','utf8')).replaceAll('export ','');
const PACKING_ITEMS=new Function(itemSource+';return PACKING_ITEMS;')();
const source=(await readFile('src/breakfast/packingPdf.js','utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
const build=new Function('PDFDocument','StandardFonts','PDFName','PACKING_ITEMS',source+';return buildPackingPdf;')(PDFDocument,StandardFonts,PDFName,PACKING_ITEMS);
const template=await readFile('public/breakfast/daily-meal-packing-reference.pdf');
const data={school:'SPARK Test School',location_code:'TEST',service_date:'2026-10-07',menu:{entree1:'Breakfast Bagel',entree2:'Cereal',vegan:'Vegan Burrito'},rows:Array.from({length:21},(_,i)=>({id:`class-${i}`,room:`${201+i}`,campus:'Main Site',enrollment:28,items:Object.fromEntries(PACKING_ITEMS.map(([k],j)=>[k,j===0?24:j===4?28:0]))}))};
delete data.rows[0].items.milkLactaid; // Unknown is not zero and totals stay incomplete.
const bytes=await build(template,data),pdf=await PDFDocument.load(bytes),form=pdf.getForm();
assert.equal(pdf.getPageCount(),2);
for(const [name,value] of [['page1.School Name','SPARK Test School'],['page1.Date','2026-10-07'],['page1.Room Row1','201'],['page1.Room Row19','219'],['page2.Room Row1','220'],['page2.Room Row2','221'],['page1.Hot Entrée','Breakfast Bagel'],['page1.Hot EntreeRow1','24'],['page1.Cold EntreeRow1','0'],['page1.Hot EntreeTotals','456'],['page2.Hot EntreeTotals','48']])assert.equal(form.getTextField(name).getText(),value,name);
assert(!form.getTextField('page1.Lactaid White Milk 8ozRow1').getText());assert(!form.getTextField('page1.Lactaid White Milk 8ozTotals').getText());
assert.equal(form.getTextField('page2.Lactaid White Milk 8ozTotals').getText(),'0');
assert(!form.getTextField('page1.Food Service Designee_2').getText());assert(!form.getTextField('page1.Food Service Designee_2').isReadOnly());
assert.equal(form.getFields().length,452); // All 226 source fields survive on each page.
await assert.rejects(build(template,{...data,rows:[]}),/No classrooms/);
await assert.rejects(build(template,{...data,rows:[data.rows[0],data.rows[0]]}),/Duplicate/);
await assert.rejects(build(template,{...data,rows:[{...data.rows[0],items:{entree1:-1}}]}),/Invalid/);
await mkdir('node_modules/.cache/bic-forms',{recursive:true});await writeFile('node_modules/.cache/bic-forms/packing-sample.pdf',bytes);
console.log('PASS: district packing form, 21 classrooms over two pages, exact menu/item columns, zero vs unknown, per-page totals, unique interactive fields, blank signatures, duplicate/invalid protection.');
