import { canDeleteDraft } from '../supperMonitoring/workflow';
const manager={actor_role:'manager',employee_id:11};
const draft={status:'draft',locked:false,monitor_role:'manager',created_by_employee_id:11};
test('only an owned unlocked Manager draft offers Delete',()=>{
 expect(canDeleteDraft(draft,manager)).toBe(true);
 for(const status of ['submitted','corrections_requested','accepted','completed']) expect(canDeleteDraft({...draft,status},manager)).toBe(false);
 expect(canDeleteDraft({...draft,locked:true},manager)).toBe(false);
 expect(canDeleteDraft({...draft,monitor_role:'supervisor'},manager)).toBe(false);
 expect(canDeleteDraft({...draft,created_by_employee_id:12},manager)).toBe(false);
 expect(canDeleteDraft(draft,{actor_role:'supervisor'})).toBe(false);
});
