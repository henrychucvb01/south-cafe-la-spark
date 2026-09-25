import { canEdit, canDeleteDraft } from '../supperMonitoring/workflow';
const covering={actor_role:'manager',covering:true,employee_id:null,monitor_name:'Covering Manager'};
const returned={monitoring_type:'supper',source:'uploaded',monitor_role:'manager',status:'corrections_requested',locked:false,created_by_employee_id:11};
test('covering Manager can correct a returned uploaded Supper PDF',()=>{
 expect(canEdit(returned,covering)).toBe(true);
 expect(canEdit({...returned,uploaded_on_behalf:true,manager_employee_id:11},covering)).toBe(true);
 for(const status of ['draft','submitted','accepted','completed']) expect(canEdit({...returned,status},covering)).toBe(false);
 expect(canEdit({...returned,locked:true},covering)).toBe(false);
 expect(canEdit({...returned,source:'generated'},covering)).toBe(false);
 expect(canEdit({...returned,monitor_role:'supervisor'},covering)).toBe(false);
 expect(canEdit(returned,{...covering,covering:false})).toBe(false);
 expect(canDeleteDraft(returned,covering)).toBe(false);
});
