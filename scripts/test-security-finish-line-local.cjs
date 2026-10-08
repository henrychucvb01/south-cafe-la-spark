const assert=require('node:assert/strict');
const {sql,request,rpc}=require('./test-security-auth-local.cjs');
async function main(){
  const token=await rpc('spark_login',{p_role:'employee',p_employee_id:900001,p_pin:'3141'});assert.ok(token);
  const date=sql("select (now() at time zone 'America/Los_Angeles')::date");
  sql('delete from finish_line_audit_log where location_id=900002; delete from finish_line_items where finish_line_check_id in(select id from finish_line_checks where location_id=900002); delete from finish_line_checks where location_id=900002;');
  const check={location_id:900002,service_date:date,employee_id:123,employee_name:'Forged',status:'complete',submitted_at:'2000-01-01T00:00:00Z'};
  assert.ok((await request('/finish_line_checks',check)).status>=400,'Anonymous checklist rejected');
  const saved=await request('/finish_line_checks?on_conflict=location_id,service_date',check,token,'POST',{Prefer:'resolution=merge-duplicates,return=representation'});assert.equal(saved.status,201,JSON.stringify(saved));
  const row=saved.data[0];assert.equal(row.employee_id,900001);assert.equal(row.employee_name,'Synthetic Manager');assert.ok(row.submitted_at.startsWith(new Date().toISOString().slice(0,10)),'Server timestamps submission');
  const items=['previous_meal_counts','dairy_order_created','receivers_completed','production_worksheet','production_record','meal_count_entered','reports_reviewed'].map(item_key=>({finish_line_check_id:row.id,item_key,item_label:item_key,answer:'yes',requires_attention:false}));
  const itemResult=await request('/finish_line_items',items,token);assert.equal(itemResult.status,201,JSON.stringify(itemResult));
  const claim={p_location_id:900002,p_service_date:date,p_kind:'finish_line'};
  const reward=await request('/rpc/spark_claim_school_points',claim,token);assert.equal(reward.status,200,JSON.stringify(reward));
  const changed=await request('/finish_line_checks?id=eq.'+row.id,{submitted_at:'2000-01-01T00:00:00Z',comments:'Synthetic correction'},token,'PATCH');assert.equal(changed.status,204,JSON.stringify(changed));
  assert.equal(sql('select submitted_at::text from finish_line_checks where id='+row.id),sql("select '"+row.submitted_at+"'::timestamptz::text"),'Corrections preserve original submission time');
  assert.ok((await request('/finish_line_checks?id=eq.'+row.id,{location_id:900001},token,'PATCH')).status>=400,'Cannot move an old checklist to another school');
  assert.equal((await request('/rpc/spark_claim_school_points',claim,token)).status,200);
  assert.equal(sql("select count(*) from spark_points where unique_key='finish-line-900002-"+date+"'"),'1','Checklist correction does not duplicate points');
  console.log('PASS: Finish Line saves for another school; actor and submission time are server controlled; answers save; rewards remain idempotent; edits preserve streak timing; saved records cannot be reassigned.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
