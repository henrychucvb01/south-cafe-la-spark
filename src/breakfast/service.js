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
export const classroomQr=(token,id)=>rpc('breakfast_classroom_qr',{p_token:token,p_id:id});
export const settings=(token,values)=>rpc('breakfast_manager_settings',{p_token:token,...(values?{p_save:true,p_cutoff:values.teacher_cutoff,p_training:values.training_url,p_tips:values.tips_url}:{})});
export const sendMessage=(token,id,values)=>rpc('breakfast_send_message',{p_token:token,p_id:id,p_body:values.body,p_delivery:values.delivery,p_ack:values.require_ack,p_expires:values.delivery==='expires'?values.expires_on:null});
export const teacherPage=qr=>rpc('breakfast_teacher_page',{p_qr:qr});
export const teacherMessage=(qr,id,ack=false)=>rpc('breakfast_teacher_message',{p_qr:qr,p_message:id,p_ack:ack});
export const teacherSubmit=(qr,page,count,comments,certified)=>rpc('breakfast_teacher_submit',{p_qr:qr,p_date:page.service_date,p_count:count,p_comments:comments,p_certified:certified,p_revision:page.record?.revision||0});

export const workerNames=qr=>rpc('breakfast_worker_names',{p_qr:qr});
export const workerLogin=(qr,employee,pin)=>rpc('breakfast_worker_login',{p_qr:qr,p_employee:employee,p_pin:pin});
export const workerPage=(qr,token)=>rpc('breakfast_worker_page',{p_qr:qr,p_token:token});
export const workerSubmit=(qr,token,page,counts,notes,certified)=>rpc('breakfast_worker_submit',{p_qr:qr,p_token:token,p_date:page.service_date,p_counts:counts,p_notes:notes,p_certified:certified,p_revision:page.revision});
export const workerLogout=token=>rpc('breakfast_worker_logout',{p_token:token});
export const setWorkerPin=(token,pin)=>rpc('breakfast_set_worker_pin',{p_token:token,p_pin:pin});
export const breakfastMenu=(token,date,items)=>rpc('breakfast_menu',{p_token:token,p_date:date,...(items?{p_items:items}:{})});
export const breakfastPacking=(token,id,date,values)=>rpc('breakfast_packing',{p_token:token,p_id:id,p_date:date,...(values?{p_save:true,p_sent:values.sent,p_items:values.items,p_revision:values.revision}:{})});

export const packingReport=(token,date)=>rpc('breakfast_packing_report',{p_token:token,p_date:date});
export const workerPackingReport=(qr,token)=>rpc('breakfast_worker_packing_report',{p_qr:qr,p_token:token});
