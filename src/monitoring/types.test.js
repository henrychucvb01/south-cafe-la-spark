import { canRestart, slotProgress } from "../supperMonitoring/workflow";
import { recordLabel, hasCurrentPdf, MONITORING_TYPES } from "./types";
const manager={actor_role:"manager",employee_id:11};
const draft={id:"1",source:"generated",monitor_role:"manager",created_by_employee_id:11,status:"draft",locked:false,monitoring_type:"supper",monitoring_site_id:"main",school_year:"2026-27",monitoring_slot:"manager_1"};
test("restart is limited to the owning Manager's editable guided records",()=>{
 expect(canRestart(draft,manager)).toBe(true);
 expect(canRestart({...draft,status:"corrections_requested"},manager)).toBe(true);
 for(const status of ["submitted","accepted","completed","deleted"])expect(canRestart({...draft,status},manager)).toBe(false);
 expect(canRestart({...draft,source:"uploaded"},manager)).toBe(false);
 expect(canRestart({...draft,locked:true},manager)).toBe(false);
 expect(canRestart(draft,{...manager,employee_id:12})).toBe(false);
 expect(canRestart(draft,{actor_role:"supervisor"})).toBe(false);
});
test("progress separates sites and types; abandoned PDFs are not current",()=>{
 const other={...draft,id:"2",monitoring_site_id:"offsite"};
 const breakfast={...draft,id:"3",monitoring_type:"breakfast"};
 expect(slotProgress([draft,other,breakfast],"2026-27","offsite")[0].record.id).toBe("2");
 expect(slotProgress([draft,other,breakfast],"2026-27","main","breakfast")[0].record.id).toBe("3");
 expect(hasCurrentPdf({document_version:2,current_pdf_available:false})).toBe(false);
 expect(hasCurrentPdf({document_version:3,current_pdf_available:true})).toBe(true);
 expect(MONITORING_TYPES.snack.enabled).toBe(false);
 expect(MONITORING_TYPES.breakfast.enabled).toBe(false);expect(MONITORING_TYPES.lunch.enabled).toBe(false);
});

test("Supper sequence is type-specific and future types have no invented slots",()=>{
 expect(slotProgress([],"2026-27").map(p=>p.slot)).toEqual(["manager_1","supervisor","manager_2"]);
 for(const type of ["breakfast","lunch","snack"]){
  expect(slotProgress([],"2026-27","main",type)).toEqual([]);
  expect(recordLabel({...draft,monitoring_type:type,monitoring_number:7,monitoring_site_name:"EEC"})).toBe(`${MONITORING_TYPES[type].label} 7 - EEC`);
 }
 expect(recordLabel({...draft,monitoring_slot:"supervisor",monitoring_site_name:"Offsite"})).toBe("Supper 2 - Offsite");
});
