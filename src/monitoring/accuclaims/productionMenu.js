import {supabase} from '../../supabaseClient';
import {localDate,schoolYear} from '../../supperMonitoring/model';

// Source sites are distinct from the schools to which their totals roll up.
const offsiteSourceIds={
 'roster:avalonhs':'1853101',
 'roster:eagletreehs':'1857801',
 'roster:delatorreellaup':'1231701',
 'roster:doloreseec':'1951401',
 'roster:wilmingtonparkeec':'1958501'
};

function portion(row){
 const cups=[row.milk_cups,row.fruit_cups,row.veg_cups].find(value=>Number(value)>0);
 if(cups)return `${Number(cups)} ${Number(cups)>1?'cups':'cup'}`;
 const ounces=[row.mma_oz_eq,row.grain_oz_eq].find(value=>Number(value)>0);
 return ounces?`${Number(ounces)} oz`:'1';
}

export function formatProductionMenu(rows){
 const items=rows.filter(row=>row.item_name?.trim()).map(row=>`${row.item_name.trim()} (${portion(row)})`);
 return [...new Set(items)].join(', ');
}

export async function loadProductionMenu(supervisorPin,site,date,meal){
 if(!schoolYear(date)||date>localDate()||!site.location_code)return '';
 const sourceId=site.kind==='main'?null:offsiteSourceIds[site.rosterKey||site.key];
 if(sourceId===undefined)return '';
 const {data,error}=await supabase.rpc('get_accuclaims_production_menu',{
  p_supervisor_pin:supervisorPin,
  p_location_code:String(site.location_code),
  p_source_site_id:sourceId,
  p_visit_date:date,
  p_meal_type:meal
 });
 if(error)throw error;
 return formatProductionMenu(data||[]);
}
