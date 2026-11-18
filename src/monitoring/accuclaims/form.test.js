/** @jest-environment node */
import fs from 'fs';
import {PDFDocument,decodePDFRawStream} from 'pdf-lib';
import {fillLunch} from './form';

test('signed SNP-23 copies both roles to pages 2 and 3 and preserves an unsigned role',async()=>{
 const original=await PDFDocument.load(fs.readFileSync('public/monitoring/snp-23.pdf'));
 const managerField='Site Representatives Signature';
 original.getForm().getTextField(managerField).setText('Existing manager signature');
 const template=await original.save();
 const signature={aspectRatio:3,strokes:[[[0.1,0.2],[0.5,0.7],[0.8,0.3]]]};
 const draft={date:'2026-11-18',result:'pass',grades:[],answers:{},meal:'breakfast'};
 const supervisorOnly=await PDFDocument.load(await fillLunch(template,{...draft,signatures:{supervisor:signature}}));
 expect(supervisorOnly.getForm().getFieldMaybe('Monitors Signature')).toBeUndefined();
 expect(supervisorOnly.getForm().getTextField(managerField).getText()).toBe('Existing manager signature');
 const both=await PDFDocument.load(await fillLunch(template,{...draft,signatures:{supervisor:signature,manager:signature}}));
 expect(both.getForm().getFieldMaybe(managerField)).toBeUndefined();
 for(const i of [1,2]){
  const page=both.getPage(i);
  const content=both.context.lookup(page.node.Contents().get(page.node.Contents().size()-1));
  expect(content.getContentsString().length).toBeGreaterThan(0);
 }
});

test('preserves one line per menu item on the original SNP-23',async()=>{
 const template=fs.readFileSync('public/monitoring/snp-23.pdf');
 const menu=[
  'Apple Slices, Red (1)','Breaded Cheese Fish Wedges (2 oz)','Celery Sticks (1)',
  'Deep Dish Pepperoni Pizza (2 oz)','Milk (1 cup)','Raspberry Passion Fruit Slush (1)',
  'Roasted Potato Wedges (0.5 cup)','Vegan Chik-n Nuggets (2.25 oz)'
 ].join('\n');
 const pdf=await PDFDocument.load(await fillLunch(template,{
  date:'2026-11-18',result:'pass',meal:'lunch',grades:[],answers:{},menu,menuProductionDate:'2026-11-18'
 }));
 expect(pdf.getForm().getTextField('Todays Menu Record All Food Items Served and Serving Sizes').getText()).toBe(menu);
});

test('regenerating a PDF replaces the supervisor strokes and retains the manager strokes on both pages',async()=>{
 const template=fs.readFileSync('public/monitoring/snp-23.pdf');
 const supervisor={aspectRatio:3,strokes:[[[0.1,0.2],[0.5,0.7]]]};
 const manager={aspectRatio:3,strokes:[[[0.2,0.1],[0.6,0.8]]]};
 const replacement={aspectRatio:3,strokes:[[[0.1,0.7],[0.5,0.2]]]};
 const draft={date:'2026-11-18',result:'pass',meal:'lunch',grades:[],answers:{}};
 const render=async signatures=>PDFDocument.load(await fillLunch(template,{...draft,signatures}));
 const [oldPdf,newPdf,managerPdf]=await Promise.all([
  render({supervisor,manager}),render({supervisor:replacement,manager}),render({manager})
 ]);
 const contents=(pdf,index)=>{
  const streams=pdf.getPage(index).node.Contents();
  return streams.asArray().map(ref=>Buffer.from(decodePDFRawStream(pdf.context.lookup(ref)).decode()).toString());
 };
 for(const index of [1,2]){
  const managerOnly=contents(managerPdf,index).at(-1);
  const before=contents(oldPdf,index).at(-1);
  const after=contents(newPdf,index).at(-1);
  expect(before).not.toEqual(after);
  expect(before).toContain(managerOnly);
  expect(after).toContain(managerOnly);
 }
});
