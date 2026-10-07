import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import marks from './mealCountMarks.json';
export function weekDates(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Choose a date in the reporting week.');
 const d=new Date(value+'T12:00:00Z');if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==value)throw new Error('Choose a valid date.');
 d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
 return Array.from({length:5},(_,i)=>new Date(d.getTime()+i*86400000).toISOString().slice(0,10));
}
export async function buildMealCountPdf(template,{location,record,days,week}){
 const dates=weekDates(week),submitted=days.filter(d=>dates.includes(d.service_date)&&d.teacher_submitted_at&&d.teacher_certified);
 if(!submitted.length)throw new Error('No submitted teacher counts for this classroom in the selected week.');
 if(new Set(submitted.map(d=>d.service_date)).size!==submitted.length)throw new Error('Duplicate service dates found. Refresh before printing.');
 if(submitted.some(d=>d.classroom_id!==record.id))throw new Error('The report contains a different classroom.');
 const rooms=new Set(submitted.map(d=>d.room_snapshot));if(rooms.size>1)throw new Error('The room changed during this week. Review the classroom history before preparing this form.');
 for(const day of submitted)if(!Number.isInteger(day.teacher_meal_count)||day.teacher_meal_count<0||day.teacher_meal_count>40)throw new Error('The supplied district form has 40 numbered boxes per day. A saved count is outside that range; it has not been changed or truncated.');
 const pdf=await PDFDocument.load(template),form=pdf.getForm(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.getPages()[0];
 function fill(name,value){const field=form.getTextField(name),text=String(value??'');field.setText(text);field.acroField.setDefaultAppearance('/Helv 11 Tf 0 g');const width=field.acroField.getWidgets()[0].getRectangle().width-5;field.setFontSize(Math.min(11,width/Math.max(font.widthOfTextAtSize(text,1),1)));field.enableReadOnly();}
 fill('Text1',location.school_name);fill('Text3',location.location_code);fill('Text4',submitted[0].room_snapshot);
 const totalFields=['Text5','Todays Total Student Meals','Todays Total Student Meals_2','Todays Total Student Meals_3','Todays Total Student Meals_4'];
 dates.forEach((date,i)=>{
  fill(`Text${7+i*3}`,`${date.slice(5,7)}/${date.slice(8,10)}/${date.slice(0,4)}`);
  const day=submitted.find(d=>d.service_date===date);if(!day)return;
  fill(totalFields[i],day.teacher_meal_count);
  marks[i].slice(0,day.teacher_meal_count).forEach(([x,y])=>page.drawLine({start:{x:x-5,y:y-5},end:{x:x+5,y:y+5},thickness:1,color:rgb(0,0,0)}));
 });
 // Uncollected attendance/adult meals/preorders/designee/signatures remain blank.
 // Keep the supplied AcroForm interactive; do not invent a teacher signature.
 form.updateFieldAppearances(font);
 pdf.setTitle(`Breakfast Meal Count - ${submitted[0].room_snapshot} - ${dates[0]}`);
 return pdf.save();
}
