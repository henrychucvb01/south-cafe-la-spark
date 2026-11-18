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

test('long menus still generate a preview with all items in the district box',async()=>{
 const template=fs.readFileSync('public/monitoring/snp-23.pdf');
 const items=Array.from({length:16},(_,i)=>`Menu item ${i+1} (1)`);
 const pdf=await PDFDocument.load(await fillLunch(template,{
  date:'2026-11-18',result:'pass',meal:'lunch',grades:[],answers:{},menu:items.join('\n')
 }));
 expect(pdf.getForm().getTextField('Todays Menu Record All Food Items Served and Serving Sizes').getText()).toBe(items.join(', '));
});

test('writes compliance, the corrective-action deadline and both notes to the district fields',async()=>{
 const template=fs.readFileSync('public/monitoring/snp-23.pdf');
 const draft={date:'2026-11-18',result:'follow-up',meal:'lunch',grades:[],answers:{},
  compliance:'no',correctiveDueDate:'2026-12-01',findings:'Review meal counts.',correctiveActionTaken:'Completed 11/20/2026.'};
 const no=(await PDFDocument.load(await fillLunch(template,draft))).getForm();
 expect(no.getCheckBox('Check Box2.4.0').isChecked()).toBe(false);
 expect(no.getCheckBox('Check Box2.4.1').isChecked()).toBe(true);
 expect(no.getTextField('Text7').getText()).toBe('12/1/2026');
 expect(no.getTextField('Text1').getText()).toBe(draft.findings);
 expect(no.getTextField('Text2').getText()).toBe(draft.correctiveActionTaken);
 const yes=(await PDFDocument.load(await fillLunch(template,{...draft,compliance:'yes'}))).getForm();
 expect(yes.getCheckBox('Check Box2.4.0').isChecked()).toBe(true);
 expect(yes.getCheckBox('Check Box2.4.1').isChecked()).toBe(false);
 expect(yes.getTextField('Text7').getText()||'').toBe('');
});

test('filters condiments from older saved menus before exporting the PDF',async()=>{
 const template=fs.readFileSync('public/monitoring/snp-23.pdf');
 const menu='Apple Slices, Red (1), BBQ Sauce (1), Celery Sticks (1), Ranch Dressing (1), Milk (1 cup)';
 const pdf=await PDFDocument.load(await fillLunch(template,{
  date:'2026-10-08',result:'pass',meal:'lunch',grades:[],answers:{},menu
 }));
 expect(pdf.getForm().getTextField('Todays Menu Record All Food Items Served and Serving Sizes').getText())
  .toBe('Apple Slices, Red (1)\nCelery Sticks (1)\nMilk (1 cup)');
});
