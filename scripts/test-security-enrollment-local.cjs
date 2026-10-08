const assert=require('node:assert/strict');
const {sql,request,rpc}=require('./test-security-auth-local.cjs');
async function main(){
  sql("insert into employees(id,location_id,employee_name,active,manager_pin_hash) values(900003,900001,'Synthetic New Manager',true,null) on conflict(id) do update set manager_pin_hash=null,active=true; delete from spark_private.login_limits where identity_key in('enroll:900003','employee:900003','supervisor');");
  assert.equal(await rpc('has_manager_pin',{p_employee_id:'900003'}),false);
  const results=await Promise.all(['1234','5678'].map(p_pin=>rpc('set_manager_pin',{p_employee_id:'900003',p_pin})));
  assert.equal(results.filter(Boolean).length,1,'Exactly one first-time enrollment succeeds');
  const pin=results[0]?'1234':'5678';
  const token=await rpc('spark_login',{p_role:'employee',p_employee_id:900003,p_pin:pin});assert.ok(token);
  assert.equal(await rpc('set_manager_pin',{p_employee_id:'900003',p_pin:'0000'}),false,'Cannot replace an existing PIN');
  assert.ok((await request('/rpc/reset_manager_pin',{p_employee_id:'900003',p_supervisor_pin:token})).status>=400);
  assert.ok((await request('/rpc/reset_manager_pin',{p_employee_id:'900003',p_supervisor_pin:'1618'})).status>=400,'Raw supervisor PIN does not bypass login');
  const supervisor=await rpc('spark_login',{p_role:'supervisor',p_pin:'1618'});
  assert.equal(await rpc('reset_manager_pin',{p_employee_id:'900003',p_supervisor_pin:supervisor}),true);
  assert.equal(await rpc('spark_session_valid',{p_token:token}),false,'Explicit supervisor reset revokes old sessions');
  assert.equal(await rpc('has_manager_pin',{p_employee_id:'900003'}),false);
  assert.equal(await rpc('set_manager_pin',{p_employee_id:'900003',p_pin:'4321'}),true,'Employee creates replacement PIN without supervisor enrollment');
  assert.ok(await rpc('spark_login',{p_role:'employee',p_employee_id:900003,p_pin:'4321'}));
  console.log('PASS: self-service first PIN, concurrent enrollment protection, existing-PIN preservation, authorized supervisor reset, session revocation and self-service replacement.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
