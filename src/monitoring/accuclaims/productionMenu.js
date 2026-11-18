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

const omittedItem=/^(?:special diet\b|ketchup\b|mustard\b|mayonnaise\b|mayo\b|(?:sriracha|taco|tapatio|hot)\b.*\bsauce\b|tajin\b)|\b(?:seasoning packet|condiment packet)\b/i;
const milkItem=/^milk(?:$|\s+(?:white|chocolate|strawberry|non[- ]?fat|fat[- ]?free|low[- ]?fat|[12]%|whole)(?=\s|$))/i;

export function formatProductionMenu(rows){
 const foods=new Map();
 for(const row of rows){
  const original=row.item_name?.trim();
  if(!original||omittedItem.test(original))continue;
  if(milkItem.test(original)||/^soy milk\b/i.test(original)){
   const amount=portion(row);
   if(!foods.has('milk')||foods.get('milk')==='Milk (1)')foods.set('milk',`Milk (${amount})`);
   continue;
  }
  const listedSize=original.match(/\((\d+(?:\.\d+)?\s*(?:oz|cups?))\)\s*$/i);
  const name=original.replace(/\s*\(\d+(?:\.\d+)?\s*(?:oz|cups?)\)\s*$/i,'')
   .replace(/\b(?:NNC|Ind\.\s*(?:Bag|Pkg))\b/gi,'')
   .replace(/\s+,/g,',').replace(/\s{2,}/g,' ').trim();
  if(!name)continue;
  const size=listedSize?.[1]||portion(row);
  const item=`${name} (${size})`;
  foods.set(item.toLowerCase(),item);
 }
 return [...foods.values()].join('\n');
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
