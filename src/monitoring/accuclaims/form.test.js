/** @jest-environment node */
import fs from 'fs';
import {PDFDocument} from 'pdf-lib';
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
