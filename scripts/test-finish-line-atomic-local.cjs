// Fixed loopback fixture only. Never submits anything to a hosted database.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {sql,request,rpc}=require('./test-security-auth-local.cjs');
async function main(){
 const token=await rpc('spark_login',{p_role:'employee',p_employee_id:900001,p_pin:'3141'});
 const covering=await rpc('spark_login',{p_role:'covering',p_pin:'2718',p_covering_name:'Synthetic Cover'});
 assert.ok(token);assert.ok(covering);
 const loc=900002, day='2026-10-01';
 sql(`delete from spark_private.finish_line_requests; delete from finish_line_audit_log where location_id=${loc}; delete from finish_line_items where finish_line_check_id in(select id from finish_line_checks where location_id=${loc}); delete from finish_line_checks where location_id=${loc}; delete from meal_counts where location_id=${loc}; delete from spark_points where location_id=${loc};`);
 const keys=['previous_meal_counts','dairy_order_created','receivers_completed','production_worksheet','production_record','meal_count_entered','reports_reviewed','thursday_orders_complete'];
 const payload={location_id:loc,service_date:day,expected_check_version:null,expected_meal_version:null,comments:'Synthetic submission',closing:{equipment:true,prepAreas:true,floors:true,trash:true,kitchenReady:true},meals:{breakfast:11,lunch:20,supper:null},items:Object.fromEntries(keys.map(k=>[k,{answer:'yes',label:k,comment:''}]))};
 payload.items.dairy_order_created={answer:'no',label:'Dairy',comment:'Synthetic explanation'};
 const submit=(body,id=randomUUID(),session=token)=>request('/rpc/spark_submit_finish_line',{p_request_id:id,p_payload:body},session);
 const snapshot=()=>sql(`select jsonb_build_object('checks',(select jsonb_agg(to_jsonb(x)) from finish_line_checks x where location_id=${loc}),'items',(select jsonb_agg(to_jsonb(x)) from finish_line_items x where finish_line_check_id in(select id from finish_line_checks where location_id=${loc})),'meals',(select jsonb_agg(to_jsonb(x)) from meal_counts x where location_id=${loc}),'audit',(select jsonb_agg(to_jsonb(x)) from finish_line_audit_log x where location_id=${loc}),'points',(select jsonb_agg(to_jsonb(x)) from spark_points x where location_id=${loc}))`);
 const before=snapshot();assert.ok((await submit(payload,randomUUID(),null)).status>=400);assert.equal(snapshot(),before);
 for(const table of ['finish_line_items','meal_counts','finish_line_audit_log','spark_points']){
  sql(`create or replace function public.synthetic_fail() returns trigger language plpgsql as $$ begin raise exception 'Synthetic ${table} failure'; end $$; create trigger synthetic_failure before insert on public.${table} for each row execute function public.synthetic_fail();`);
  try {assert.ok((await submit(payload)).status>=400,table+' failure reaches caller');assert.equal(snapshot(),before,table+' failure rolls back every record');}
  finally{sql(`drop trigger synthetic_failure on public.${table}; drop function public.synthetic_fail();`);}
 }
 const id=randomUUID();const results=await Promise.all([submit(payload,id),submit(payload,id)]);results.forEach(r=>assert.equal(r.status,200,JSON.stringify(r)));assert.deepEqual(results[0].data,results[1].data);
 const check=results[0].data.check;assert.equal(check.employee_id,900001);assert.equal(check.status,'attention');
 assert.equal(sql(`select answer from finish_line_items where finish_line_check_id=${check.id} and item_key='dairy_order_created_comment'`),'Synthetic explanation');
 assert.equal(sql(`select count(*) from spark_points where location_id=${loc} and service_date='${day}' and point_type in('breakfast_meal_count','lunch_meal_count','finish_line_late')`),'3');
 const after=snapshot();assert.equal((await submit(payload,id)).status,200);assert.equal(snapshot(),after,'Response-loss retry changes nothing');
 assert.ok((await submit({...payload,comments:'Different'},id)).status>=400);
 assert.equal((await submit({...payload,comments:'Stale'})).status,409,'Reject a different stale save');assert.equal(snapshot(),after);
 const updated={...payload,expected_check_version:check.updated_at,expected_meal_version:sql(`select updated_at from meal_counts where location_id=${loc} and service_date='${day}'`),meals:{breakfast:12,lunch:20,supper:4},items:{...payload.items,dairy_order_created:{answer:'na',comment:'New synthetic explanation'}}};
 const correction=await submit(updated,randomUUID(),covering);assert.equal(correction.status,200,JSON.stringify(correction));assert.equal(correction.data.check.submitted_at,check.submitted_at);assert.equal(correction.data.check.employee_name,'Synthetic Cover');
 assert.equal(sql(`select count(*) from spark_points where location_id=${loc} and service_date='${day}' and unique_key like 'finish-line-%'`),'1');
 assert.equal(sql(`select old_value||'>'||new_value from finish_line_audit_log where location_id=${loc} and field_name='Breakfast meal count' order by id desc limit 1`),'11>12');
 assert.equal(sql(`select old_value||'>'||new_value from finish_line_audit_log where location_id=${loc} and field_name='dairy_order_created_comment' order by id desc limit 1`),'Synthetic explanation>New synthetic explanation');
 const fresh={...updated,expected_check_version:correction.data.check.updated_at,expected_meal_version:sql(`select updated_at from meal_counts where location_id=${loc} and service_date='${day}'`)};
 for(const invalid of [{...fresh,closing:{}},{...fresh,items:{}},{...fresh,meals:{breakfast:-1,lunch:20}},{...fresh,items:{...fresh.items,dairy_order_created:{answer:'no',comment:''}}}])assert.ok((await submit(invalid)).status>=400);
 const concurrent=await Promise.all([submit({...fresh,comments:'First'}),submit({...fresh,comments:'Second'})]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
 assert.ok((await request('/finish_line_checks',{location_id:loc,service_date:day},token)).status>=400,'Legacy split writes denied');
 console.log('PASS: atomic rollback at answers/meals/audit/points; No/N/A explanations and meal history; repeat/concurrent retries; stale edits; cross-school regular/covering managers; unchanged submission time; unique rewards; invalid/anonymous/legacy saves denied.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

