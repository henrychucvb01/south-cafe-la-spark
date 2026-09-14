import {supabase} from "../supabaseClient";

export const STAFFING_GROUPS=[
  ["worker","Worker"],["senior_worker","Senior Worker"],
  ["manager_i","Manager I"],["manager_ii","Manager II"],
  ["manager_iii","Manager III"],["manager_iv","Manager IV"],
  ["manager_v","Manager V"],["manager_vi","Manager VI"],["manager_vii","Manager VII"],
];

export function staffingGroupLabel(key){return STAFFING_GROUPS.find(([value])=>value===key)?.[1]||key;}
export function isFixedStaff(position){return position?.classification_key!=="worker";}

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
    p_classification_key:position.classification_key,
    p_assigned_daily_hours:Number(position.assigned_daily_hours),
    p_location_id:Number(position.location_id),p_movable:Boolean(position.movable),
  });
  if(error)throw error;
  return data;
}
