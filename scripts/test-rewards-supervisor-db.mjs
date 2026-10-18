import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {rewardsFixture} from './rewards-fixture.mjs';
const {db}=await rewardsFixture();
const rpc=async(action,payload={},pin='a'.repeat(64))=>(await db.query('select public.spark_rewards_supervisor($1,$2,$3) as data',[action,pin,payload])).rows[0].data;
try{
 const existing=async()=>JSON.stringify((await db.query('select * from spark_points order by id')).rows)+JSON.stringify((await db.query('select * from locations order by id')).rows)+JSON.stringify((await db.query('select * from existing_game_progress order by id')).rows);
 const before=await existing();await db.exec(await readFile('supabase/migrations/20261017150105_rewards_supervisor_only.sql','utf8'));
 assert.equal((await db.query("select to_regnamespace('rewards_dev') as ns")).rows[0].ns,null);assert.equal(await existing(),before);
 assert.deepEqual(await rpc('capabilities',{},null),{supervisor_available:true,manager_enabled:false,protocol_version:1});
 let data=await rpc('context',{location_id:900001});assert.equal(data.environment,'production');assert.equal(data.supervisor_only,true);assert.equal(data.manager_enabled,false);assert.equal(data.launch_ready,false);assert.equal(data.balance,'125');assert.equal(data.catalog.length,11);assert(data.catalog.every(r=>r.status==='draft'&&!r.active&&Object.keys(r.config).length===0));
 for(const pin of [null,'invalid','b'.repeat(64)])await assert.rejects(rpc('context',{},pin),/Supervisor authorization/);
 for(const action of ['manager_context','contribute','claim','bid','refund','spin','use_spin','start_session','settle','cancel_claim','preview_spin','wheel_save'])await assert.rejects(rpc(action,{},'a'.repeat(64)),/not enabled/);
 await assert.rejects(rpc('settings',{manager_enabled:true,meeting_spin_limit:1,revision:1}),/locked/);
 const reward=data.catalog.find(r=>r.type==='fixed');data=await rpc('save',{...reward,config:{price:50},active:true,status:'published'});let saved=data.catalog.find(r=>r.id===reward.id);assert.equal(saved.config.price,50);assert.equal(saved.active,true);assert.equal(data.manager_enabled,false);await assert.rejects(rpc('save',{...reward,name:'stale'}),/changed/);
 data=await rpc('duplicate',{id:reward.id});const copy=data.catalog.find(r=>r.name===reward.name+' (copy)');assert(copy);assert.equal(copy.status,'draft');assert.equal(copy.active,false);
 data=await rpc('settings',{manager_enabled:false,meeting_spin_limit:1,revision:data.settings.revision});assert.equal(data.settings.manager_enabled,false);
 const wheel={name:'Supervisor wheel',description:'A meeting wheel.',type:'wheel',status:'published',active:true,config:{goal:100,wheel_type:'punishment',session_limit:1,segments:[{id:'a',label:'Tell a joke',color:'#0f766e',enabled:true,approved:true,outcome:'challenge',value:0},{id:'b',label:'Wear a funny hat',color:'#be123c',enabled:true,approved:true,outcome:'challenge',value:0}]}};
 data=await rpc('save',wheel);assert(data.catalog.some(r=>r.name===wheel.name));assert.equal(data.manager_enabled,false);assert(data.history.length>=4);
 await assert.rejects(rpc('save',{...wheel,config:{...wheel.config,segments:wheel.config.segments.map(s=>({...s,approved:false}))}}),/Approve every/);
 await assert.rejects(rpc('context',{location_id:999999}),/active school/);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.exec('select * from spark_rewards.catalog'),/permission denied/);await assert.rejects(db.exec("select public.spark_rewards_supervisor('capabilities')"),/permission denied/);await db.exec('reset role');}
 await db.exec('set role service_role');assert.equal((await rpc('capabilities',{},null)).manager_enabled,false);await assert.rejects(rpc('context',{},'b'.repeat(64)),/Supervisor authorization/);await db.exec('reset role');
 assert.equal((await db.query("select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='spark_rewards' and c.relkind='r' and c.relrowsecurity")).rows[0].count,3);
 assert.equal(await existing(),before);console.log('PASS production Supervisor schema: eleven inactive/unpriced seeds, existing auth, private RLS tables, stale edits/audit, four reward types, immutable manager lock, no point/school/game mutations and denied manager/award routes.');
}finally{await db.close();}
