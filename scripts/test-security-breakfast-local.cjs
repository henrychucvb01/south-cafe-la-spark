// Real authorization and existing Breakfast RPCs against synthetic localhost data only.
const assert=require('node:assert/strict');
const {sql,request,rpc}=require('./test-security-auth-local.cjs');
async function main(){
 const manager=await rpc('spark_login',{p_role:'employee',p_employee_id:900001,p_pin:'3141'});
 const supervisor=await rpc('spark_login',{p_role:'supervisor',p_pin:'1618'});
 const token=await rpc('open_supper_monitoring_session',{p_location_id:900001,p_employee_id:900001,p_pin:manager});
 const other=await rpc('open_supper_monitoring_session',{p_location_id:900002,p_employee_id:900001,p_pin:manager});
 const ctx=await rpc('supper_context',{p_token:other});assert.equal(ctx.monitor_name,'Synthetic Manager');assert.equal(ctx.actor_role,'manager');
 const initial=await rpc('breakfast_rollout_settings',{p_pin:supervisor});
 const enabled=initial.find(x=>x.id===900001).enabled;
 await rpc('breakfast_rollout_settings',{p_pin:supervisor,p_changes:[{id:900001,previous:enabled,enabled:true}]});
 assert.equal(await rpc('breakfast_manager_enabled',{p_token:token}),true);
 assert.equal(await rpc('breakfast_manager_enabled',{p_token:other}),false);
 assert.ok((await request('/rpc/breakfast_rollout_settings',{p_pin:manager,p_changes:[{id:900002,previous:false,enabled:true}]})).status>=400);
 const classroom=await rpc('breakfast_save_classroom',{p_token:token,p_id:null,p_revision:null,p_room:'Security-'+Date.now(),p_teacher:'Synthetic Teacher',p_enrollment:30,p_campus:'',p_active:true});
 const qr=await rpc('breakfast_classroom_qr',{p_token:token,p_id:classroom.id});
 await rpc('breakfast_manager_settings',{p_token:token,p_save:true,p_cutoff:'23:59:59',p_training:'',p_tips:''});
 const teacher=await rpc('breakfast_teacher_page',{p_qr:qr});const date=teacher.service_date;
 assert.equal(teacher.teacher,'Synthetic Teacher');assert.equal(teacher.closed,false);
 const menu={entree1:'Toast',fruit:'Apple',milk1:'1% white milk'};
 await rpc('breakfast_menu',{p_token:token,p_date:date,p_items:menu});
 const names=await rpc('breakfast_worker_names',{p_qr:qr});assert.ok(JSON.stringify(names).includes('Synthetic Manager'));
 const worker=(await rpc('breakfast_worker_login',{p_qr:qr,p_employee:'employee:900001',p_pin:'9999'})).token;assert.ok(worker);
 const packed=await rpc('breakfast_worker_pack',{p_qr:qr,p_token:worker,p_date:date,p_sent:null,p_items:{entree1:30,fruit:30,milk1:30},p_menu:menu,p_certified:true,p_revision:0});
 assert.equal(packed.packing_revision,1);
 // Teachers still submit directly with the bag QR; no SPARK session header.
 const submitted=await rpc('breakfast_teacher_submit',{p_qr:qr,p_date:date,p_count:24,p_comments:'Synthetic note',p_certified:true,p_revision:0});assert.equal(submitted.record.count,24);
 await rpc('breakfast_teacher_adult_meal',{p_qr:qr,p_date:date,p_received:true,p_revision:0});
 await rpc('breakfast_teacher_preorder',{p_qr:qr,p_date:date,p_for_date:teacher.preorder_date,p_entree:'Toast',p_count:25,p_revision:0});
 const returned=await rpc('breakfast_worker_submit',{p_qr:qr,p_token:worker,p_date:date,p_counts:{entree1:6,fruit:5,milk1:4},p_notes:'Synthetic return',p_certified:true,p_revision:0});assert.equal(returned.revision,1);
 const dashboard=await rpc('breakfast_daily_dashboard',{p_token:token,p_date:date});assert.ok(dashboard.total>=24);
 const row=dashboard.rows.find(x=>x.classroom_id===classroom.id);assert.equal(row.record.teacher_comments,'Synthetic note');assert.equal(row.record.adult_meal_received,true);
 const total=await rpc('breakfast_finish_line_total',{p_token:token,p_date:date});assert.equal(total.total,dashboard.total);
 const report=await rpc('breakfast_packing_report',{p_token:token,p_date:date});assert.deepEqual(report.menu,menu);
 assert.ok((await request('/rpc/breakfast_classroom_qr',{p_token:other,p_id:classroom.id})).status>=400,'Other school session cannot read QR');
 await rpc('breakfast_rollout_settings',{p_pin:supervisor,p_changes:[{id:900001,previous:true,enabled:false}]});
 assert.equal(await rpc('breakfast_qr_enabled',{p_qr:qr}),false);
 assert.ok((await request('/rpc/breakfast_teacher_page',{p_qr:qr})).status>=400);
 await rpc('breakfast_rollout_settings',{p_pin:supervisor,p_changes:[{id:900001,previous:false,enabled:true}]});
 assert.equal((await rpc('breakfast_teacher_page',{p_qr:qr})).record.count,24,'Disable/re-enable preserves records and QR');
 // Rehearse safe release pause and recovery without changing school records.
 const before=sql('select count(*) from breakfast_daily_records');
 try{
  sql('update spark_private.security_release set available=false');
  assert.deepEqual(await rpc('spark_security_ready',{}),{version:1,ready:false});
  assert.equal(await rpc('spark_session_valid',{p_token:manager}),false);
  assert.equal(await rpc('spark_login',{p_role:'employee',p_employee_id:900001,p_pin:'3141'}),null);
  assert.ok((await request('/rpc/supper_context',{p_token:token})).status>=400);
  assert.ok((await request('/meal_counts',{location_id:900001,service_date:date,breakfast_count:24},manager)).status>=400);
  assert.equal((await rpc('breakfast_teacher_page',{p_qr:qr})).record.count,24,'Public QR remains available during core release pause');
 }finally{sql('update spark_private.security_release set available=true');}
 assert.equal(await rpc('spark_session_valid',{p_token:manager}),true);
 assert.equal((await rpc('supper_context',{p_token:token})).monitor_name,'Synthetic Manager');
 assert.equal(sql('select count(*) from breakfast_daily_records'),before);
 console.log('PASS: Breakfast rollout isolation, manager/worker/teacher flows, packing/returns, adult meal, preorder, dashboard/report/Finish Line totals, data preservation and release pause/recovery.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
