import {supabase} from "../supabaseClient";

export function isFixedStaff(position){
  return /manager|senior/i.test(String(position?.classification_title||""));
}

export async function loadStaffing(supervisorPin){
  const{data,error}=await supabase.rpc("get_staff_management_dataset",{p_supervisor_pin:supervisorPin});
  if(error)throw error;
  return{schools:data?.schools||[],positions:data?.positions||[]};
}

export async function saveStaffingPosition(supervisorPin,position){
  const{data,error}=await supabase.rpc("update_staffing_position",{
    p_supervisor_pin:supervisorPin,p_position_id:position.id,
    p_employee_name:position.employee_name,p_employee_number:position.employee_number||null,
    p_classification_title:position.classification_title,
    p_assigned_daily_hours:Number(position.assigned_daily_hours),
    p_location_id:Number(position.location_id),
    p_allow_fixed_reassignment:Boolean(position.allowFixedReassignment),
  });
  if(error)throw error;
  return data;
}
