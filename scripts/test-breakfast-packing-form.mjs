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

const differentMenus={school:'Fictional BIC Pilot',service_date:'2026-10-07',menu:{},rows:[
 {id:'k1',room:'TEST K1',enrollment:20,menu:{entree1:'Kindergarten Toast',milkSpecial:'Almond milk'},items:{entree1:10,milkSpecial:2},quantity_source:'Teacher pre-order'},
 {id:'s1',room:'TEST G2',enrollment:20,menu:{entree1:'Standard Cereal',other:'Approved diet item',milkSpecial:'Soy milk'},items:{entree1:12,other:1,milkSpecial:3},quantity_source:'Packed'}]};
const grouped=await build(template,differentMenus),groupedPdf=await PDFDocument.load(grouped),groupedForm=groupedPdf.getForm();assert.equal(groupedPdf.getPageCount(),2);assert.equal(groupedForm.getTextField('page1.Hot Entrée').getText(),'Kindergarten Toast');assert.equal(groupedForm.getTextField('page2.Hot Entrée').getText(),'Standard Cereal');assert.equal(groupedForm.getTextField('page1.Other Special diet ectRow1').getText(),'2');assert.equal(groupedForm.getTextField('page2.Other Special diet ectRow1').getText(),'4');
await assert.rejects(build(template,{...differentMenus,rows:[{...differentMenus.rows[0],menu_conflicts:['Conflict']}]}),/Resolve classroom menu/);
await writeFile('node_modules/.cache/bic-forms/grouped-packing-sample.pdf',grouped);
console.log('PASS grouped packing PDF: separate menu/source sheets, exact per-classroom headers and quantities, authorized special milk in Other column, conflicts block printing.');
