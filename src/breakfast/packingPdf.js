import {PDFDocument,StandardFonts,PDFName} from 'pdf-lib';
import {PACKING_ITEMS} from './packingItems';
export async function buildPackingPdf(template,data){
 if(!data?.rows?.length)throw new Error('No classrooms or saved packing records for this date.');
 if(new Set(data.rows.map(r=>r.id)).size!==data.rows.length)throw new Error('Duplicate classroom rows. Refresh before printing.');
 for(const row of data.rows)for(const [key] of PACKING_ITEMS)if(row.items[key]!=null&&(!Number.isInteger(row.items[key])||row.items[key]<0||row.items[key]>10000))throw new Error('Invalid packed quantity. Review the classroom before printing.');
 const output=await PDFDocument.create();
 // Keep different campuses and menus identifiable, with 19 rows per district sheet.
 const campuses=[...new Set(data.rows.map(r=>r.campus||''))],batches=[];
 for(const campus of campuses){const rows=data.rows.filter(r=>(r.campus||'')===campus);for(let i=0;i<rows.length;i+=19)batches.push({campus,rows:rows.slice(i,i+19)});}
 for(let i=0;i<batches.length;i++){
  const {campus,rows}=batches[i],pdf=await PDFDocument.load(template),form=pdf.getForm(),font=await pdf.embedFont(StandardFonts.Helvetica);
  function fill(name,value){const field=form.getTextField(name),text=String(value??'');field.setText(text);field.acroField.setDefaultAppearance('/Helv 10 Tf 0 g');const w=field.acroField.getWidgets()[0].getRectangle().width-5;field.setFontSize(Math.min(10,w/Math.max(font.widthOfTextAtSize(text,1),1)));field.enableReadOnly();}
  fill('School Name',data.school);fill('Location Code',data.location_code);fill('Date',data.service_date);
  fill('Hot Entrée',data.menu.entree1);fill('Cold Entrée',data.menu.entree2);fill('Vegan Entrée',data.menu.vegan);
  rows.forEach((row,j)=>{fill(`Room Row${j+1}`,row.room);fill(`Class EnrollmentRow${j+1}`,row.enrollment);for(const [key,,field] of PACKING_ITEMS)fill(`${field}Row${j+1}`,row.items[key]);});
  // Do not present partial totals as complete when any room has an unknown value.
  for(const [key,,field] of PACKING_ITEMS)fill(`${field}Totals`,rows.every(r=>r.items[key]!=null)?rows.reduce((sum,r)=>sum+r.items[key],0):'');
  // Keep signatures blank and preserve the interactive district form.
  form.updateFieldAppearances(font);
  pdf.getPages()[0].drawText(`${campus?campus+' | ':''}Page ${i+1} of ${batches.length} | Totals: this page; blank quantities not recorded.`,{x:17,y:73,size:7,font});
  // Unique field names plus copied widgets retain the AcroForm on every page.
  form.getFields().forEach(field=>field.acroField.setPartialName(`page${i+1}.${field.getName()}`));
  const [page]=await output.copyPages(pdf,[0]);output.addPage(page);
  for(const ref of page.node.Annots()?.asArray()||[]){const widget=output.context.lookup(ref);if(widget.get(PDFName.of('Subtype'))===PDFName.of('Widget'))output.getForm().acroForm.addField(ref);}
 }
 output.setTitle(`BIC Daily Meal Packing Report - ${data.school} - ${data.service_date}`);
 return output.save({updateFieldAppearances:false});
}
