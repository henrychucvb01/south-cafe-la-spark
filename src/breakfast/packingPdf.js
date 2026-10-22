import {PDFDocument,StandardFonts,PDFName} from 'pdf-lib';
import {PACKING_ITEMS} from './packingItems';
export async function buildPackingPdf(template,data){
 if(!data?.rows?.length)throw new Error('No classrooms or saved packing records for this date.');
 if(data.rows.some(r=>r.menu_conflicts?.length))throw new Error('Resolve classroom menu conflicts before printing the packing report.');
 if(new Set(data.rows.map(r=>r.id)).size!==data.rows.length)throw new Error('Duplicate classroom rows. Refresh before printing.');
 for(const row of data.rows)for(const [key] of PACKING_ITEMS)if(row.items[key]!=null&&(!Number.isInteger(row.items[key])||row.items[key]<0||row.items[key]>10000))throw new Error('Invalid packed quantity. Review the classroom before printing.');
 const output=await PDFDocument.create();
 // Keep different campuses and menus identifiable, with 19 rows per district sheet.
 const categories=new Map(),batches=[];
 for(const row of data.rows){const menu=row.menu||data.menu||{},key=JSON.stringify([row.campus||'',row.quantity_source||'Packed',Object.entries(menu).sort(([a],[b])=>a.localeCompare(b))]);if(!categories.has(key))categories.set(key,{campus:row.campus||'',menu,quantitySource:row.quantity_source||'Packed',rows:[]});categories.get(key).rows.push(row);}
 for(const category of categories.values())for(let i=0;i<category.rows.length;i+=19)batches.push({...category,rows:category.rows.slice(i,i+19)});
 const fields=[...new Set(PACKING_ITEMS.map(([, ,field])=>field))];
 function quantity(row,field){const keys=PACKING_ITEMS.filter(([key,,f])=>f===field&&(key!=='milkSpecial'||row.menu?.milkSpecial||row.items.milkSpecial!=null)).map(([key])=>key);if(!keys.length)return null;const relevant=keys.filter(key=>!row.menu||row.menu[key]||row.items[key]!=null);if(!relevant.length)return 0;return relevant.every(key=>row.items[key]!=null)?relevant.reduce((sum,key)=>sum+row.items[key],0):null;}
 for(let i=0;i<batches.length;i++){
  const {campus,rows,menu,quantitySource}=batches[i],pdf=await PDFDocument.load(template),form=pdf.getForm(),font=await pdf.embedFont(StandardFonts.Helvetica);
  function fill(name,value){const field=form.getTextField(name),text=String(value??'');field.setText(text);field.acroField.setDefaultAppearance('/Helv 10 Tf 0 g');const w=field.acroField.getWidgets()[0].getRectangle().width-5;field.setFontSize(Math.min(10,w/Math.max(font.widthOfTextAtSize(text,1),1)));field.enableReadOnly();}
  fill('School Name',data.school);fill('Location Code',data.location_code);fill('Date',data.service_date);
  fill('Hot Entrée',menu.entree1);fill('Cold Entrée',menu.entree2);fill('Vegan Entrée',menu.vegan);
  rows.forEach((row,j)=>{fill(`Room Row${j+1}`,row.room);fill(`Class EnrollmentRow${j+1}`,row.enrollment);for(const field of fields)fill(`${field}Row${j+1}`,quantity(row,field));});
  // Do not present partial totals as complete when any room has an unknown value.
  for(const field of fields)fill(`${field}Totals`,rows.every(r=>quantity(r,field)!=null)?rows.reduce((sum,r)=>sum+quantity(r,field),0):'');
  const special=[menu.other&&`Other: ${menu.other}`,menu.milkSpecial&&`Special milk: ${menu.milkSpecial} (Other column)`].filter(Boolean).join(' | ');
  if(special){let line='',lines=[];for(const word of special.split(' ')){if(font.widthOfTextAtSize((line+' '+word).trim(),7)>570&&line){lines.push(line);line=word;}else line=(line+' '+word).trim();}if(line)lines.push(line);lines.forEach((text,j)=>pdf.getPages()[0].drawText(text,{x:17,y:62-j*9,size:7,font}));}
  // Keep signatures blank and preserve the interactive district form.
  form.updateFieldAppearances(font);
  pdf.getPages()[0].drawText(`${campus?campus+' | ':''}${quantitySource} | Page ${i+1} of ${batches.length} | Totals: this page; blank quantities not recorded.`,{x:17,y:73,size:7,font});
  // Unique field names plus copied widgets retain the AcroForm on every page.
  form.getFields().forEach(field=>field.acroField.setPartialName(`page${i+1}.${field.getName()}`));
  const [page]=await output.copyPages(pdf,[0]);output.addPage(page);
  for(const ref of page.node.Annots()?.asArray()||[]){const widget=output.context.lookup(ref);if(widget.get(PDFName.of('Subtype'))===PDFName.of('Widget'))output.getForm().acroForm.addField(ref);}
 }
 output.setTitle(`BIC Daily Meal Packing Report - ${data.school} - ${data.service_date}`);
 return output.save({updateFieldAppearances:false});
}
