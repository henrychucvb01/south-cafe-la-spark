import { supabase } from '../supabaseClient';
// Reuse SPARK's school-scoped PIN session; no second login or PIN storage.
export { openSession, closeSession } from '../supperMonitoring/service';
async function rpc(name, args) {
 const {data,error}=await supabase.rpc(name,args);
 if(error) throw new Error(error.code==='42883' || /function.*does not exist|schema cache/i.test(error.message) ? 'Breakfast setup is not installed in this database yet. Contact your SPARK administrator.' : error.message);
 return data;
}
export const listClassrooms=token=>rpc('breakfast_list_classrooms',{p_token:token});
export const saveClassroom=(token,record,values)=>rpc('breakfast_save_classroom',{p_token:token,p_id:record?.id||null,p_revision:record?.revision||null,p_room:values.room_code.trim(),p_teacher:values.teacher_name.trim(),p_enrollment:Number(values.enrolled_students),p_campus:values.campus_label.trim(),p_active:values.active});
export const classroomHistory=(token,id,beforeEvent=null,beforeDate=null)=>rpc('breakfast_classroom_history',{p_token:token,p_id:id,p_before_event:beforeEvent,p_before_date:beforeDate});
export const addNote=(token,id,note)=>rpc('breakfast_add_note',{p_token:token,p_id:id,p_note:note.trim()});
