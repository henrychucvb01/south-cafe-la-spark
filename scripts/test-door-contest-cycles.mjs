import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {doorFixture} from './door-contest-fixture.mjs';
const db=await doorFixture();
const migration='supabase/migrations/20261116165934_door_contest_cycles_and_schedule.sql';
try{
 const photo='00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp';
 for(const env of ['dev','live'])await db.exec(`insert into october_${env}.entries(location_id,quest,photo_path,consent,state) values(2,0,'${photo}',true,'approved');insert into october_${env}.votes values(11,1,(select id from october_${env}.entries where quest=0),now());update october_${env}.settings set champion=2,door_state='ended';insert into october_${env}.rewards(event,location_id,points) values('door:champion',2,20);`);
 await db.exec((await readFile(migration,'utf8')).replace(/-- CRON-BEGIN[\s\S]*?-- CRON-END/,''));
 await db.exec(await readFile('supabase/migrations/20261116173611_door_contest_stale_screen_guard.sql','utf8'));
 for(const env of ['dev','live']){
  const ns='october_'+env,rpc=async(action,payload={},admin=true)=>(await db.query(`select public.october_games_${env}($1,$2,$3,$4) r`,[action,admin?null:'named',admin?'admin-test':null,{...payload,door_contest:(await db.query(`select door_contest from october_${env}.settings`)).rows[0].door_contest}])).rows[0].r;
  const snapshot=async()=>JSON.stringify((await db.query(`select (select jsonb_agg(to_jsonb(e) order by id) from ${ns}.entries e) entries,(select jsonb_agg(to_jsonb(v) order by employee_id) from ${ns}.votes v) votes,(select jsonb_agg(to_jsonb(r) order by event) from ${ns}.rewards r) rewards`)).rows);
  const before=await snapshot();let data=await rpc('list');const revision=data.settings.revision;
  const v={revision,door_title:'Fictional Thanksgiving',door_theme:'autumn',door_border_style:'double',door_border_color:'#d79032',door_background:'#59321d',door_participation_points:20,door_champion_points:50,opens_local:'2099-11-18T08:00',submission_local:'2099-11-23T15:00',voting_local:'2099-11-25T15:00',scheduled:true};
  await assert.rejects(rpc('door_next_save',v,false),/Supervisor/);
  await assert.rejects(rpc('door_settings',{...v,submission_end:'2099-11-23',voting_end:'2099-11-25',door_state:'active'}),/Completed contest/);
  await assert.rejects(rpc('settings',{revision,game:'door',state:'active'}),/Completed contest/);
  await assert.rejects(rpc('door_next_save',{...v,revision:-1}),/changed/);
  await assert.rejects(rpc('door_next_save',{...v,door_participation_points:-2}),/whole SPARK/);
  await assert.rejects(rpc('door_next_save',{...v,voting_local:'2099-11-17T15:00'}),/Opening/);
  data=await rpc('door_next_save',v);assert.equal(await snapshot(),before,'planning preserves all original evidence and rewards');assert.equal(data.settings.champion,2);assert.equal(data.door_next.scheduled,true);assert.equal(new Date(data.door_next.settings.submission_start).toISOString(),'2099-11-18T16:00:00.000Z');
  await assert.rejects(rpc('door_next_cancel',{revision:data.settings.revision}),/Confirm/);
  data=await rpc('door_next_cancel',{revision:data.settings.revision,confirmed:true});assert.equal(data.door_next,null);
  data=await rpc('door_next_save',{...v,revision:data.settings.revision,scheduled:false});
  const savedRevision=data.settings.revision;
  await assert.rejects(rpc('door_next_start',{revision:savedRevision}),/Confirm/);
  data=await rpc('door_next_start',{revision:savedRevision,confirmed:true});
  assert.equal(data.settings.door_contest,2);assert.equal(data.settings.champion,null);assert.equal(data.settings.door_title,'Fictional Thanksgiving');assert.equal(data.entries.filter(e=>e.quest===0).length,0);assert.equal(data.vote,null);assert.equal(data.door_history.length,1);assert.equal(await snapshot(),before);
  const history=await rpc('door_history',{contest:1});assert.equal(history.door_history_detail.settings.champion,2);assert.equal(history.door_history_detail.entries.length,1);assert.equal(history.door_history_detail.entries[0].votes,1);
  const old=history.door_history_detail.entries[0];await assert.rejects(rpc('review',{id:old.id,revision:old.revision,state:'rejected'}),/read-only/);
  await assert.rejects(rpc('photo_rotate',{id:old.id}),/read-only/);
  await assert.rejects(rpc('vote',{id:old.id},false),/another school/);
  await assert.rejects(db.query(`select public.october_games_${env}('vote','named',null,$1)`,[{id:old.id,door_contest:1}]),/contest changed/);
  // A manager can enter again, and the same voter can vote in a new contest.
  const call=async(action,token,payload)=>(db.query(`select public.october_games_${env}($1,$2,null,$3) r`,[action,token,{...payload,door_contest:(await db.query(`select door_contest from ${ns}.settings`)).rows[0].door_contest}]));
  await db.exec(`update ${ns}.settings set submission_end=now()+interval '1 day',voting_end=now()+interval '2 days',voting_start=now()-interval '1 minute';`);
  // Fixture's two registered identities use real production submit and vote branches.
  await db.exec(`create or replace function public.require_supper_monitoring_session(text) returns public.supper_monitoring_sessions language plpgsql as $$begin if $1='one' then return (1,11,'manager')::public.supper_monitoring_sessions;elsif $1='named' then return (2,22,'manager')::public.supper_monitoring_sessions;else raise exception 'Invalid session';end if;end$$;`);
  await call('submit','named',{quest:0,consent:true,photo_path:photo});
  data=await rpc('list');const entry=data.entries.find(e=>e.quest===0);assert.notEqual(entry.id,old.id);
  await rpc('review',{id:entry.id,revision:entry.revision,state:'approved'});await call('vote','one',{id:entry.id});
  await assert.rejects(call('vote','one',{id:entry.id}),/already recorded/);
  await db.exec(`update ${ns}.settings set voting_end=now()-interval '1 minute'`);await rpc('champion',{location_id:2});
  assert.equal((await db.query(`select count(*)::int n from ${ns}.rewards where event in ('door:champion','door:contest:2:champion')`)).rows[0].n,2,'distinct champion awards');
  assert.equal((await db.query(`select count(*)::int n from ${ns}.votes where employee_id='11'`)).rows[0].n,2,'historical vote retained');
  data=await rpc('list');data=await rpc('door_next_save',{...v,revision:data.settings.revision,door_title:'Fictional Winter'});
  // Advance only fictional plan time to exercise the same cron activation function.
  await db.exec(`update ${ns}.door_next set settings=jsonb_set(settings,'{submission_start}',to_jsonb(now()-interval '1 minute'));`);
  assert.equal((await db.query(`select ${ns}.door_activate_next(false) ok`)).rows[0].ok,true);
  assert.equal((await db.query(`select ${ns}.door_activate_next(false) ok`)).rows[0].ok,false,'activation idempotent');
  assert.equal((await rpc('list')).settings.door_contest,3);
  data=await rpc('list');await db.exec(`insert into ${ns}.entries(location_id,quest,door_contest,photo_path,consent) values(1,0,3,'${photo}',true)`);
  data=await rpc('door_next_save',{...v,revision:data.settings.revision,door_title:'Fictional Next',opens_local:'2099-12-01T08:00',submission_local:'2099-12-05T15:00',voting_local:'2099-12-06T15:00'});
  await db.exec(`update ${ns}.door_next set settings=jsonb_set(settings,'{submission_start}',to_jsonb(now()-interval '1 minute'));`);
  assert.equal((await db.query(`select ${ns}.door_activate_next(false) ok`)).rows[0].ok,false,'unfinished contest never silently replaced');
  await assert.rejects(rpc('door_next_start',{revision:data.settings.revision,confirmed:true}),/Confirm the current contest winner/);
  await db.exec(`update ${ns}.settings set submission_start=now()+interval '1 day',voting_start=now()+interval '1 day',submission_end=now()+interval '2 days',voting_end=now()+interval '3 days'`);
  await assert.rejects(call('submit','named',{quest:0,consent:true,photo_path:photo}),/submissions are closed/);
  await assert.rejects(call('vote','named',{id:old.id}),/Voting is closed/);
  await db.exec('set role anon');await assert.rejects(db.query(`select * from ${ns}.door_next`),/permission denied/);await assert.rejects(db.query(`select ${ns}.door_activate_next(true)`),/permission denied/);await db.exec('reset role');
 }
 console.log('PASS dev/live: completed contest protection, separate draft/schedule, timezone, revision/authorization checks, history, repeated school entries and votes, reward isolation, scheduled activation, cancellation, idempotency and private tables.');
}finally{await db.close();}
