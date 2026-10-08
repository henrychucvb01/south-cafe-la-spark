import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();let checks=0;
const check=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table locations(id bigint primary key,school_name text,active boolean);insert into locations values(1,'School A',true),(2,'School B',true),(3,'Test High School',true);
 create table supper_monitoring_sessions(location_id bigint,employee_id bigint,actor_role text);
 create function verify_supervisor_pin(text) returns boolean language sql as $$select $1='test-admin'$$;
 create function require_supper_monitoring_session(text) returns supper_monitoring_sessions language plpgsql as $$begin
 if $1='school1' then return (1,11,'manager')::supper_monitoring_sessions;elsif $1='school2' then return (2,22,'manager')::supper_monitoring_sessions;
 elsif $1='covering' then return (1,null,'manager')::supper_monitoring_sessions;elsif $1='test-school' then return (3,33,'manager')::supper_monitoring_sessions;
 else raise exception 'Invalid session';end if;end$$;
 create table spark_points(points int);insert into spark_points values(500);`);
 await db.exec(await readFile('supabase/migrations/202610080001_october_games_development.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/202610080002_october_games_display.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/202610080003_october_first_school_quests.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/202610080004_october_quest_completion_lock.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/202610080005_october_custom_quests.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/202610080006_october_quest_rewards.sql','utf8'));
 const call=async(action,payload={},token='school1',pin=null)=>(await db.query('select october_games_dev($1,$2,$3,$4) r',[action,token,pin,payload])).rows[0].r;
 const admin=(action,payload={})=>call(action,payload,null,'test-admin');
 const fail=async(p,regex)=>{await assert.rejects(p,regex);checks++;};
 const path='00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp';
 const photo={photo_path:path,consent:true,note:'Teacher review: delicious.'};
 let d=await call('list');check(d.schools.length,2);check(d.quests.length,13);check(d.rounds[0].answer,null);check(d.rounds[0].photo_path,null);
 await fail(call('list',{},'forged'),/Invalid session/);await fail(call('settings',{}),/Supervisor/);
 await fail(call('submit',{...photo,quest:1}),/not available/);
 d=await admin('list');const config=async(game,state='active')=>{const current=await admin('list');return admin('settings',{revision:current.settings.revision,game,state});};
 await config('quests');await fail(call('submit',{...photo,quest:13}),/not available/);await fail(call('submit',{...photo,quest:1},'test-school'),/Participating/);
 await fail(call('submit',{...photo,consent:false,quest:1}),/permission/);
 await call('submit',{...photo,quest:1});d=await call('list');let e=d.entries[0];check(e.state,'pending');check(d.rewards.length,0);check((await call('list',{},'school2')).entries.length,0);
 await fail(call('submit',{...photo,quest:1}),/Already/);
 await admin('review',{id:e.id,revision:e.revision,state:'replacement',feedback:'Try again'});
 await fail(call('submit',{...photo,quest:1,revision:1}),/Already/);
 await call('submit',{...photo,quest:1,revision:2});e=(await admin('list')).entries[0];
 d=await admin('review',{id:e.id,revision:e.revision,state:'approved'});check(d.rewards[0].points,10);check(d.unlock_events.length,1);
 await fail(admin('review',{id:e.id,revision:e.revision,state:'approved'}),/changed/);
 e=d.entries[0];d=await admin('review',{id:e.id,revision:e.revision,state:'approved'});check(d.rewards.length,1);check(d.unlock_events.length,1);
 check((await call('list',{},'school2')).entries.length,1);
 await fail(config('mystery'),/Upload all five/);
 for(let id=1;id<=5;id++)await admin('round',{id,revision:1,answer:'Answer '+id,aliases:['  Alternate '+id+'  '],photo_path:path,pieces:Array.from({length:32},()=>[[0,0],[1000,0],[0,1000]])});
 d=await config('mystery');check(d.rounds[0].unlocked,5);check(d.rounds[1].unlocked,0);
 d=await call('list');check(d.rounds[0].answer,null);check(d.rounds[0].aliases,undefined);check(d.rounds[1].photo_path,null);check(d.rounds[1].pieces,null);
 await fail(call('guess',{round:1,guess:'Answer 1'},'covering'),/registered/);
 d=await call('guess',{round:1,guess:'wrong'});check(d.guess_correct,false);await fail(call('guess',{round:1,guess:'Answer 1'}),/already guessed/);
 d=await call('guess',{round:1,guess:' ALTERNATE   1 '},'school2');check(d.guess_correct,true);check(d.current_round,2);check(d.rounds[0].winner,2);check(d.rounds[1].unlocked,0);
 await fail(call('guess',{round:1,guess:'Answer 1'},'school2'),/no longer active/);
 for(let id=2;id<=5;id++)await call('guess',{round:id,guess:'Answer '+id},'school2');
 d=await admin('list');check(d.current_round,null);check(d.rewards.filter(r=>r.event.startsWith('mystery:')).reduce((n,r)=>n+r.points,0),125);
 await fail(admin('round',{id:1,revision:2,answer:'changed'}),/locked/);
 await config('door');await db.exec(`update october_dev.settings set submission_start=now()-interval '1 day',submission_end=now()+interval '1 day',voting_start=now()+interval '2 days',voting_end=now()+interval '3 days'`);
 await call('submit',{...photo,quest:0});await call('submit',{...photo,quest:0},'school2');
 d=await admin('list');for(const entry of d.entries.filter(e=>e.quest===0))await admin('review',{id:entry.id,revision:entry.revision,state:'approved'});
 d=await admin('list');const door1=d.entries.find(e=>e.quest===0&&e.location_id===1),door2=d.entries.find(e=>e.quest===0&&e.location_id===2);
 check(d.unlock_events.length,1);await fail(call('vote',{id:door2.id}),/closed/);
 await db.exec(`update october_dev.settings set submission_end=now()-interval '2 hours',voting_start=now()-interval '1 hour',voting_end=now()+interval '1 hour'`);
 await fail(call('vote',{id:door2.id},'covering'),/registered/);await fail(call('vote',{id:door1.id}),/another school/);
 d=await call('vote',{id:door2.id});check(d.vote,door2.id);check(d.entries.find(e=>e.id===door2.id).votes,null);
 await fail(call('vote',{id:door2.id}),/already recorded/);await fail(admin('review',{id:door1.id,revision:door1.revision,state:'rejected'}),/locked/);
 await fail(admin('champion',{location_id:2}),/Wait/);
 await db.exec(`update october_dev.settings set voting_end=now()-interval '1 minute'`);
 await fail(call('vote',{id:door1.id},'school2'),/closed/);await fail(admin('champion',{location_id:1}),/highest/);
 d=await admin('champion',{location_id:2});check(d.settings.champion,2);check(d.entries.find(e=>e.id===door2.id).votes,1);
 d=await admin('champion',{location_id:2});check(d.rewards.filter(r=>r.event==='door:champion').length,1);
 const reward=d.rewards[0];d=await admin('reward',{event:reward.event,voided:true,reason:'Test correction'});check(d.rewards.find(r=>r.event===reward.event).voided,true);
 d=await admin('reward',{event:reward.event,voided:false,reason:'Restore original'});check(d.rewards.find(r=>r.event===reward.event).voided,false);
 check((await call('list')).new_challenge,true);check((await call('seen')).new_challenge,false);

 // Completed quests lock out other schools, including previously queued submissions.
 await fail(call('submit',{...photo,quest:1},'school2'),/locked/);
 check((await admin('list')).quests.find(x=>x.id===1).first_school,1);
 await call('submit',{...photo,quest:2});await call('submit',{...photo,quest:2},'school2');
 let open=(await admin('list')).entries.filter(x=>x.quest===2);
 let first=open.find(x=>x.location_id===1),second=open.find(x=>x.location_id===2);
 d=await admin('review',{id:first.id,revision:first.revision,state:'approved'});
 second=d.entries.find(x=>x.id===second.id);check(second.state,'rejected');
 await fail(admin('review',{id:second.id,revision:second.revision,state:'approved'}),/locked/);
 check(d.rewards.find(x=>x.event==='quest:first:2').location_id,1);
 check(d.unlock_events.filter(x=>x.entry===first.id).length,1);check(d.unlock_events.filter(x=>x.entry===second.id).length,0);
 await fail(call('submit',{...photo,quest:2,revision:second.revision},'school2'),/locked/);

 // One school may win every distinct quest (including supervisor-assigned BIC/Supper eligibility).
 for(let quest=3;quest<=15;quest++){
  const config=(await admin('list')).quests.find(q=>q.id===quest);
  if(config.eligible!==null)await admin('quest',{...config,eligible:[1]});
  await call('submit',{...photo,quest});const pending=(await admin('list')).entries.find(e=>e.quest===quest&&e.location_id===1);
  await admin('review',{id:pending.id,revision:pending.revision,state:'approved'});
 }
 d=await admin('list');check(d.quests.filter(q=>q.first_school===1).length,15);
 check(d.rewards.filter(r=>r.event.startsWith('quest:first:')&&!r.voided&&r.location_id===1).reduce((sum,r)=>sum+r.points,0),150);
 check(d.unlock_events.length,15);
 check((await db.query('select sum(points) n from spark_points')).rows[0].n,500);
 // New quests are supervisor-only, reject stale retries and retain the same one-school rewards.
 await fail(call('quest_create',{name:'Extra',description:'Photo',revision:d.settings.revision}),/Supervisor/);
 await fail(admin('quest_create',{revision:d.settings.revision,name:' ',description:'Photo'}),/name and instructions/);
 const creation={revision:d.settings.revision,name:'Extra quest',description:'Take a creative photo.',enabled:true,reward_points:25};
 d=await admin('quest_create',creation);check(d.quests.length,16);check(d.quests.find(q=>q.id===16).eligible,null);
 await fail(admin('quest_create',creation),/Refresh/);
 check(d.quests.find(q=>q.id===16).reward_points,25);
 let custom=d.quests.find(q=>q.id===16);
 for(const invalid of [0,-1,1.5,1001,null])await fail(admin('quest',{...custom,reward_points:invalid}),/Reward/);
 await fail(call('quest',{...custom,reward_points:40}),/Supervisor/);
 d=await admin('quest',{...custom,reward_points:40});custom=d.quests.find(q=>q.id===16);check(custom.reward_points,40);
 await call('submit',{...photo,quest:16});const added=(await admin('list')).entries.find(e=>e.quest===16);
 d=await admin('review',{id:added.id,revision:added.revision,state:'approved'});check(d.quests.find(q=>q.id===16).first_school,1);
 check(d.rewards.find(r=>r.event==='quest:first:16').points,40);check(d.unlock_events.filter(u=>u.entry===added.id).length,1);
 await fail(call('submit',{...photo,quest:16},'school2'),/locked/);
 await fail(admin('quest',{...custom,reward_points:50}),/locked/);
 let winner=d.entries.find(e=>e.id===added.id);d=await admin('review',{id:winner.id,revision:winner.revision,state:'rejected'});
 winner=d.entries.find(e=>e.id===added.id);d=await admin('review',{id:winner.id,revision:winner.revision,state:'approved'});
 check(d.rewards.filter(r=>r.event==='quest:first:16'&&!r.voided).length,1);check(d.rewards.find(r=>r.event==='quest:first:16').points,40);
 check(d.unlock_events.filter(u=>u.entry===added.id).length,1);check((await db.query('select sum(points) n from spark_points')).rows[0].n,500);


 // Launch copies artwork/settings once; historical test rewards do not enter the real ledger.
 await db.exec(`alter table spark_points add column location_id bigint,add column point_type text,add column description text,add column service_date date,add column source text,add column unique_key text unique;
 create table spark_monthly_cup_results(month date,location_id bigint,points int,rank int,primary key(month,location_id));
 insert into spark_monthly_cup_results values(date_trunc('month',now()),1,500,1),(date_trunc('month',now()),2,400,2);`);
 await db.exec(await readFile('supabase/migrations/202610080007_october_games_production.sql','utf8'));
 const live=async(action,payload={},token='school1',pin=null)=>(await db.query('select october_games_live($1,$2,$3,$4) r',[action,token,pin,payload])).rows[0].r;
 const liveAdmin=(action,payload={})=>live(action,payload,null,'test-admin');
 let prod=await liveAdmin('list');check(prod.rewards.length,0);check(prod.quests.length,16);check(prod.rounds.filter(r=>r.photo_path===path).length,5);check((await db.query('select sum(points) n from spark_points')).rows[0].n,500);
 await fail(live('quest_create',{revision:prod.settings.revision,name:'bad',description:'bad'}),/Supervisor/);
 prod=await liveAdmin('quest_create',{revision:prod.settings.revision,name:'Live quest',description:'Live task',reward_points:35});
 await live('submit',{...photo,quest:17});let liveEntry=(await liveAdmin('list')).entries.find(e=>e.quest===17);
 prod=await liveAdmin('review',{id:liveEntry.id,revision:liveEntry.revision,state:'approved'});
 check((await db.query("select points from spark_points where unique_key='october-live:quest:first:17'")).rows[0].points,35);
 check((await db.query('select points from spark_monthly_cup_results where location_id=1')).rows[0].points,535);
 await fail(live('submit',{...photo,quest:17},'school2'),/locked/);
 await liveAdmin('reward',{event:'quest:first:17',voided:true,reason:'Correction'});check((await db.query('select sum(points) n from spark_points')).rows[0].n,500);
 await liveAdmin('reward',{event:'quest:first:17',voided:false,reason:'Restore'});await liveAdmin('reward',{event:'quest:first:17',voided:false,reason:'Retry'});
 check((await db.query('select sum(points) n from spark_points')).rows[0].n,535);check((await db.query('select points from spark_monthly_cup_results where location_id=1')).rows[0].points,535);
 // Restoring an imported test award cannot create live points.
 await liveAdmin('reward',{event:'quest:first:1',voided:false,reason:'Old test'});check((await db.query('select sum(points) n from spark_points')).rows[0].n,535);
 // A new live mystery winner receives 25 exactly once; development remains separate.
 await db.exec("delete from october_live.guesses where round=1;delete from october_live.rewards where event='mystery:1';update october_live.rounds set solved_at=null,winner=null where id=1;");
 await live('guess',{round:1,guess:'Answer 1'});check((await db.query("select points from spark_points where unique_key='october-live:mystery:1'")).rows[0].points,25);
 await fail(live('guess',{round:1,guess:'Answer 1'}),/no longer active/);
 const devBefore=(await admin('list')).quests.length;check(devBefore,16);check((await db.query("select count(*)::int n from october_dev.rewards where event='quest:first:17'")).rows[0].n,0);
 await db.exec('set role anon');await fail(live('list'),/permission denied/);await fail(db.exec('select * from october_live.rounds'),/permission denied/);await db.exec('reset role');
 await db.exec('set role anon');await fail(db.exec('select * from october_dev.entries'),/permission denied/);await fail(call('list'),/permission denied/);
 await db.exec('reset role;set role service_role');check((await call('list')).location_id,1);
 console.log(`PASS ${checks} assertions: school isolation, consent, review/resubmission, idempotent rewards/unlocks, hidden answers/photos, identity restrictions, 5 rounds/125 points, vote dates/own-school/duplicate checks, champion, corrections, notifications, live points unchanged, service-only RPC.`);
}catch(e){console.error(e.message,e.internalQuery||'',e.where||'');process.exitCode=1;}finally{await db.close();}
