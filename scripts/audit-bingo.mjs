import {readFile,writeFile,mkdir} from 'node:fs/promises';
const config=await readFile('src/supabaseClient.js','utf8');
const base=config.match(/const supabaseUrl = "([^"]+)"/)[1],key=config.match(/const supabaseKey = "([^"]+)"/)[1];
async function rows(table,select,filters=''){
 const result=[];for(let offset=0;;offset+=500){const r=await fetch(`${base}/rest/v1/${table}?select=${select}&${filters}&order=id.asc&offset=${offset}&limit=500`,{headers:{apikey:key}});if(!r.ok)throw Error(table+': '+r.status+' '+await r.text());const data=await r.json();result.push(...data);if(data.length<500)return result;}
}
const dates='service_date=gte.2026-08-01&service_date=lte.2026-12-31';
const [locations,finish,meals,points,labor,excluded]=await Promise.all([
 rows('locations','id,school_name,location_code,labor_type,budget_labor_hours,active'),
 rows('finish_line_checks','id,location_id,service_date,status,submitted_at,finish_line_items(item_key,answer)',dates),
 rows('meal_counts','id,location_id,service_date,breakfast_count,lunch_count,supper_count,supper_status',dates),
 rows('spark_points','id,location_id,points,point_type,description,service_date,source,unique_key',dates),
 rows('labor_hours','id,location_id,service_date,additional_worker_hours,manager_overtime_hours',dates),
 rows('spark_excluded_days','id,location_id,service_date',dates)
]);
const snapshot={locations,finish,meals,points,labor,excluded};
await mkdir('test-results/bingo-audit',{recursive:true});await writeFile('test-results/bingo-audit/snapshot.json',JSON.stringify(snapshot,null,2));
console.log(JSON.stringify({schools:locations.length,rows:Object.fromEntries(Object.entries(snapshot).map(([k,v])=>[k,v.length])),note:'Read-only snapshot saved. Run report-bingo-audit.mjs with the authorized monitoring evidence to compare the captured baseline.'},null,2));
