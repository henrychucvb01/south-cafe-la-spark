// Integration tests use ONLY the schema-only local fixture, never cloud URLs.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('.security-runtime');
const password = fs.readFileSync(path.join(root,'local-password'),'utf8').trim();
function sql(text) {
  return execFileSync(path.join(root,'postgres/pgsql/bin/psql.exe'), ['-X','-qAt','-h','127.0.0.1','-p','55432','-U','postgres','-d','spark_security','-v','ON_ERROR_STOP=1'], {input:text,encoding:'utf8',env:{...process.env,PGPASSWORD:password}}).trim();
}
const base='http://127.0.0.1:55433';
async function request(route,body,token,method,headers={}) {
  const r=await fetch(base+route,{method:method||(body===undefined?'GET':'POST'),headers:{'Content-Type':'application/json',...(token?{'x-spark-session':token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,data:await r.json().catch(()=>null)};
}
async function rpc(name,body) { const r=await request('/rpc/'+name,body); assert.ok([200,204].includes(r.status),`${name}: ${r.status} ${JSON.stringify(r.data)}`);return r.data; }
const manager={p_role:'employee',p_employee_id:900001,p_pin:'3141'};
async function main(){
  assert.equal(sql('select current_database()'),'spark_security');
  sql(`INSERT INTO locations(id,location_code,school_name,active) VALUES(900001,'9001','Synthetic A',true),(900002,'9002','Synthetic B',true) ON CONFLICT(id) DO UPDATE SET active=true;
  INSERT INTO employees(id,location_id,employee_name,active,manager_pin_hash) VALUES(900001,900001,'Synthetic Manager',true,extensions.crypt('3141',extensions.gen_salt('bf'))) ON CONFLICT(id) DO UPDATE SET active=true,manager_pin_hash=excluded.manager_pin_hash;
  INSERT INTO spark_security_settings(setting_key,value_hash) VALUES('covering_manager_pin',extensions.crypt('2718',extensions.gen_salt('bf'))),('supervisor_pin',extensions.crypt('1618',extensions.gen_salt('bf'))) ON CONFLICT(setting_key) DO UPDATE SET value_hash=excluded.value_hash;
  DELETE FROM spark_private.login_limits; DELETE FROM spark_private.sessions;
  NOTIFY pgrst,'reload schema';`);
  // Schema cache reload is asynchronous; bounded readiness check only.
  for(let i=0;i<30;i++){const r=await request('/rpc/spark_session_valid',{p_token:'invalid'});if(r.status===200)break;await new Promise(r=>setTimeout(r,100));}
  const token=await rpc('spark_login',manager);assert.match(token,/^[a-f0-9]{64}$/);
  assert.equal(await rpc('verify_manager_pin',{p_employee_id:'900001',p_pin:token}),true);
  assert.equal(await rpc('verify_manager_pin',{p_employee_id:'900002',p_pin:token}),false);
  assert.equal(await rpc('verify_manager_pin',{p_employee_id:'900001',p_pin:'3141'}),false,'Legacy PIN oracle is closed');
  assert.equal(await rpc('verify_supervisor_pin',{p_pin:'1618'}),false);
  assert.equal(await rpc('verify_covering_pin',{p_pin:'2718'}),false);
  for(const route of ['/employees?select=manager_pin_hash','/employees?select=email']) assert.ok((await request(route)).status>=400,'No employee secrets through anonymous API');
  const directory=await rpc('spark_employee_directory',{p_location_id:900001});
  assert.deepEqual(Object.keys(directory[0]).sort(),['employee_name','id','location_id']);
  const covering=await rpc('spark_login',{p_role:'covering',p_pin:'2718',p_covering_name:'Synthetic Cover'});
  assert.equal(await rpc('verify_covering_pin',{p_pin:covering}),true);
  const supervisor=await rpc('spark_login',{p_role:'supervisor',p_pin:'1618'});
  assert.equal(await rpc('verify_supervisor_pin',{p_pin:supervisor}),true);
  assert.equal(await rpc('verify_supervisor_pin',{p_pin:token}),false,'Employees cannot elevate');
  assert.equal((await request('/rpc/spark_authenticated',{},token)).data,true);
  assert.equal((await request('/rpc/spark_authenticated',{})).data,false);
  assert.equal(await rpc('set_manager_pin',{p_employee_id:'900001',p_pin:'1111'}),false,'Self-enrollment cannot overwrite an existing PIN');
  assert.ok((await request('/rpc/reset_manager_pin',{p_employee_id:'900001',p_supervisor_pin:'1618'})).status>=400);
  await Promise.all(Array.from({length:15},()=>rpc('spark_login',{...manager,p_pin:'0000'})));
  assert.equal(sql("select failures from spark_private.login_limits where identity_key='employee:900001'"),'10','Concurrent attempts cannot exceed the credential limit');
  assert.equal(await rpc('spark_login',manager),null,'Correct PIN cannot bypass active lockout');
  assert.equal(await rpc('spark_session_valid',{p_token:token}),true,'Attacker cannot invalidate an existing session through login failures');
  sql("update spark_private.login_limits set window_started=now()-interval '16 minutes'");
  const renewed=await rpc('spark_login',manager);assert.ok(renewed,'Login recovers after cooldown');
  const otherSchool=await rpc('open_supper_monitoring_session',{p_location_id:900002,p_employee_id:900001,p_pin:renewed});
  assert.ok(otherSchool,'Authorized employee may help another school');
  assert.match(otherSchool,/^[a-f0-9-]{72}$/,'Preserve the deployed monitoring API token format');
  assert.equal(await rpc('open_supper_monitoring_session',{p_location_id:900002,p_employee_id:900001,p_pin:'3141'}),null,'Feature opener cannot bypass login throttling with a raw PIN');
  const coveringSchool=await rpc('open_supper_monitoring_session',{p_location_id:900002,p_employee_id:null,p_pin:covering,p_covering_name:'Forged Name'});
  assert.ok(coveringSchool,'Covering employee may help another school');
  assert.equal(sql("select monitor_name from supper_monitoring_sessions where token_hash=encode(sha256(convert_to('"+coveringSchool+"','UTF8')),'hex')"),'Synthetic Cover','Actor comes from verified session');
  await request('/rpc/spark_logout',{p_token:token});
  assert.equal(await rpc('spark_session_valid',{p_token:token}),false,'Logout revokes token');
  sql("update employees set active=false where id=900001");
  assert.equal(await rpc('spark_session_valid',{p_token:renewed}),false,'Deactivation revokes existing sessions');
  assert.ok((await request('/rpc/supper_context',{p_token:otherSchool})).status>=400,'Deactivation also revokes school-scoped access');
  const another=await rpc('spark_login',{p_role:'covering',p_pin:'2718',p_covering_name:'Another Cover'});
  sql("update spark_private.sessions set expires_at=now()-interval '1 second'");
  assert.equal(await rpc('spark_session_valid',{p_token:another}),false,'Expired session rejected');
  console.log('PASS: local HTTP authentication, regular/covering/supervisor login, role separation, employee secret denial, legacy PIN closure, concurrent throttling, logout and expiry.');
}
module.exports={sql,request,rpc};
if(require.main===module) main().catch(e=>{console.error(e);process.exitCode=1;});
