import {supabase} from '../supabaseClient';
export async function loadSchoolBenefits(locationId) {
 const {data,error}=await supabase.rpc('mystery_school_benefits',{p_location_id:locationId});
 if(error) throw error;
 return {makeup:new Set(data?.makeup_dates||[]),shields:new Set(data?.shield_dates||[]),doubleUntil:data?.double_until};
}
