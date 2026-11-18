import {loadMonthlyScorecardDatasetWithRetry} from '../../monthlyScorecards/monthlyScorecardService';
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

export function formatProductionMenu(dataset,site,date,meal){
 const sourceId=site.kind==='main'
  ? dataset.schools?.find(s=>String(s.location_code)===String(site.location_code)&&site.location_code)?.source_site_id
  : offsiteSourceIds[site.rosterKey||site.key];
 if(!sourceId)return '';
 const items=(dataset.production_rows||[])
  .filter(row=>String(row.source_site_id)===String(sourceId)&&row.production_date===date&&row.meal_type===meal)
  .filter(row=>row.item_name?.trim()&&(row.served==null||Number(row.served)>0))
  .sort((a,b)=>a.source_row_number-b.source_row_number)
  .map(row=>`${row.item_name.trim()} (${portion(row)})`);
 return [...new Set(items)].join(', ');
}

export async function loadProductionMenu(supervisorPin,site,date,meal){
 const year=schoolYear(date);
 if(!year||date>localDate())return '';
 const dataset=await loadMonthlyScorecardDatasetWithRetry(supervisorPin,year,`${date.slice(0,7)}-01`);
 return formatProductionMenu(dataset,site,date,meal);
}
