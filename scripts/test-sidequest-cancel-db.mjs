// Isolated in-memory Postgres. Uses the real Showdown migration and RPC handler,
// with synthetic sessions and a minimal legacy list/authorize fixture.
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table public.locations(id bigint primary key,school_name text,active boolean);
 insert into public.locations select n,'School '||n,true from generate_series(1,5)n;
 create table public.supper_monitoring_sessions(location_id bigint,employee_id bigint,actor_role text);
 create function public.require_supper_monitoring_session(text) returns public.supper_monitoring_sessions language plpgsql as $$begin
 case $1 when 'one' then return (1,11,'manager')::public.supper_monitoring_sessions;when 'two' then return (2,22,'manager')::public.supper_monitoring_sessions;when 'three' then return (3,33,'manager')::public.supper_monitoring_sessions;when 'four' then return (4,44,'manager')::public.supper_monitoring_sessions;when 'same-school-other-manager' then return (2,222,'manager')::public.supper_monitoring_sessions;when 'other-school-cover' then return (3,null,'manager')::public.supper_monitoring_sessions;when 'nonmanager' then return (2,null,'covering')::public.supper_monitoring_sessions;when 'cover' then return (2,null,'manager')::public.supper_monitoring_sessions;else raise exception 'Invalid session';end case;end$$;
 create table public.spark_points(location_id bigint,points int);
 create function public.spark_bingo_season_balance(bigint) returns numeric language sql as $$select coalesce(sum(points),0) from public.spark_points where location_id=$1$$;
 create schema cron;create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;`);
 for(const env of ['dev','live']){
  const ns='october_'+env;
  await db.exec(`create schema ${ns};
  create table ${ns}.settings(id boolean primary key,quests_state text);insert into ${ns}.settings values(true,'active');
  create table ${ns}.schools(location_id bigint primary key,participating boolean);insert into ${ns}.schools select id,true from public.locations;
  create table ${ns}.game_cycles(id uuid primary key,month date,state text,closed_at timestamptz);
  create table ${ns}.quests(id int primary key,name text,description text,goal text,eligible bigint[],enabled boolean default true,reward_points int default 10,cycle_id uuid);
  create table ${ns}.entries(id uuid primary key,quest int,location_id bigint,photo_path text,state text);
  create table ${ns}.quest_claims(quest int primary key,entry uuid,location_id bigint);
  create table ${ns}.rewards(event text primary key,location_id bigint,points int,reason text,service_date date default current_date,voided boolean default false);
  create table ${ns}.unlock_credit_events(id bigint generated always as identity primary key,location_id bigint,kind text,credits int,price int,service_date date,request_id uuid,quest_entry uuid,round int,
   constraint unlock_credit_events_kind_check check(kind in('quest')),
   constraint unlock_credit_events_check check(kind='quest' and credits=3));
  create function public.october_games_${env}(p_action text,p_token text default null,p_pin text default null,p_payload jsonb default '{}') returns jsonb language plpgsql as $$
   declare session public.supper_monitoring_sessions;admin boolean:=p_pin='admin';begin
   if not coalesce(admin,false) then session:=public.require_supper_monitoring_session(p_token);end if;
   if p_action not in('authorize','list') then raise exception 'Unexpected legacy action';end if;
   return jsonb_build_object('admin',coalesce(admin,false),'location_id',session.location_id,'identified',true,'participating',true,
    'schools',(select jsonb_agg(to_jsonb(l)) from public.locations l),
    'quests',(select coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('first_school',c.location_id)),'[]') from ${ns}.quests q left join ${ns}.quest_claims c on c.quest=q.id));end$$;`);
 }
 await db.exec(await readFile('supabase/migrations/20261020153852_sidequest_showdown.sql','utf8'));
 const migration=(await readdir('supabase/migrations')).find(f=>f.endsWith('_sidequest_cancel_challenge.sql'));
 await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));
 await db.exec(await readFile('supabase/migrations/20261021160528_showdown_school_manager_cancel.sql','utf8'));
 for(const env of ['dev','live']){
  const ns='october_'+env;
  const rpc=async(action,token='two',payload={},pin=null)=>(await db.query(`select public.october_games_${env}($1,$2,$3,$4) result`,[action,token,pin,payload])).rows[0].result;
  await db.exec(`insert into ${ns}.game_cycles values('00000000-0000-4000-8000-000000000001',date_trunc('month',current_date),'active',null);
  insert into ${ns}.quests(id,name,description,cycle_id) values(7,'Display','Create a display','00000000-0000-4000-8000-000000000001');
  insert into ${ns}.entries values('00000000-0000-4000-8000-000000000002',7,1,'original.webp','approved');
  insert into ${ns}.quest_claims values(7,'00000000-0000-4000-8000-000000000002',1);
  insert into ${ns}.rewards(event,location_id,points) values('quest:first:7',1,10);`);
  const ledger=async()=>JSON.stringify((await db.query(`select (select jsonb_agg(to_jsonb(r)) from ${ns}.rewards r) rewards,(select jsonb_agg(to_jsonb(c)) from ${ns}.unlock_credit_events c) credits,(select jsonb_agg(to_jsonb(p)) from public.spark_points p) points`)).rows);
  const before=await ledger();
  const submit=async(token='two')=>{const id=randomUUID();await rpc('showdown_submit',token,{quest:7,request_id:id,confirmed:true,consent:true,photo_path:randomUUID()+'/'+randomUUID()+'.webp'});return id;};
  const approve=async id=>rpc('showdown_approve',null,{id,revision:1},'admin');
  const cancel=(id,token='two',revision=1,round_revision)=>rpc('showdown_cancel',token,{id,revision,round_revision,confirmed:true});
  const active=async()=> (await rpc('list')).showdowns.rounds.find(r=>['voting','decision'].includes(r.state));
  const pending=await submit();
  assert.equal((await rpc('list')).showdowns.submissions.find(s=>s.id===pending).can_cancel,true);
  assert.equal((await rpc('list','same-school-other-manager')).showdowns.submissions.find(s=>s.id===pending).can_cancel,true);
  await assert.rejects(cancel(pending,'three'),/Only a manager/);
  assert.equal((await rpc('list','cover')).showdowns.submissions.find(s=>s.id===pending).can_cancel,true);
  await assert.rejects(cancel(pending,'other-school-cover'),/Only a manager/);
  await assert.rejects(cancel(pending,'nonmanager'),/Challenging school manager/);
  await assert.rejects(rpc('showdown_cancel',null,{id:pending,confirmed:true},'admin'),/Challenging school manager/);
  await assert.rejects(rpc('showdown_cancel','two',{id:pending,revision:1}),/Confirm cancellation/);
  await assert.rejects(cancel(pending,'two',99),/Challenge changed/);
  await cancel(pending,'cover');await cancel(pending,'cover');
  assert.equal((await db.query(`select count(*)::int n from ${ns}.showdown_audit where action='cancelled'`)).rows[0].n,1);
  await assert.rejects(approve(pending),/Submission changed/);
  const otherManagerPending=await submit();await cancel(otherManagerPending,'same-school-other-manager');
  const a=await submit();await approve(a);let round=await active();
  const photoA=round.photos.find(p=>p.location_id===2).id;
  await rpc('showdown_vote','four',{round_id:round.id,generation:round.generation,photo:photoA});
  await assert.rejects(cancel(a,'two',1,round.revision),/Challenge changed/); // stale pending screen after approval
  const b=await submit('three');await approve(b);round=await active();
  const photoB=round.photos.find(p=>p.location_id===3).id;
  await rpc('showdown_vote','four',{round_id:round.id,generation:round.generation,photo:photoA});
  await rpc('showdown_vote','one',{round_id:round.id,generation:round.generation,photo:photoB});
  await assert.rejects(cancel(a,'two',2,round.revision-1),/Showdown changed/);
  const after=await cancel(a,'cover',2,round.revision);
  let remaining=after.showdowns.rounds.find(r=>r.id===round.id);
  assert.equal(remaining.state,'voting');assert.equal(remaining.generation,round.generation);assert.equal(remaining.closes_at,round.closes_at);
  assert.equal(remaining.photos.length,2);assert.equal(remaining.photos.find(p=>p.id===photoB).votes,1);
  assert.equal(after.showdowns.used.includes(7),false);
  const poll=await rpc('showdown_poll','four');assert.equal(poll.rounds.find(r=>r.id===round.id).my_vote,null);
  assert.equal(poll.rounds.find(r=>r.id===round.id).photos.some(p=>p.id===photoA),false);
  assert.equal(poll.rounds.find(r=>r.id===round.id).revision,remaining.revision);
  await assert.rejects(rpc('showdown_vote','four',{round_id:round.id,generation:round.generation,photo:photoA}),/Choose another/);
  assert.equal((await db.query(`select count(*)::int n from ${ns}.showdown_votes where photo=$1`,[photoA])).rows[0].n,2,'all voting generations retained for audit');
  // The school may correct and resubmit in the still-open competition.
  const retry=await submit();await approve(retry);remaining=await active();assert.equal(remaining.photos.length,3);
  await cancel(retry,'two',2,remaining.revision);remaining=await active();
  // Withdrawal also works after voting closes, until the Supervisor finalizes.
  await db.query(`update ${ns}.showdown_rounds set closes_at=clock_timestamp()-interval '1 second' where id=$1`,[round.id]);
  remaining=await active();assert.equal(remaining.state,'decision');
  await cancel(b,'three',2,remaining.revision);
  const ended=(await rpc('list')).showdowns.rounds.find(r=>r.id===round.id);assert.equal(ended.state,'cancelled');assert.equal(ended.winner,null);
  assert.equal((await rpc('list')).showdowns.champions.length,0);assert.equal(await active(),undefined);
  await assert.rejects(rpc('showdown_finalize',null,{round_id:round.id,photo:photoB,revision:ended.revision,confirmed:true,request_id:randomUUID()},'admin'),/participating photograph/);
  const next=await submit();await approve(next);let nextRound=await active();assert.notEqual(nextRound.id,round.id);
  await db.query(`update ${ns}.showdown_rounds set closes_at=clock_timestamp()-interval '1 second' where id=$1`,[nextRound.id]);nextRound=await active();
  await rpc('showdown_finalize',null,{round_id:nextRound.id,photo:nextRound.photos.find(p=>p.role==='defender').id,revision:nextRound.revision,confirmed:true,request_id:randomUUID()},'admin');
  await assert.rejects(cancel(next,'two',2,nextRound.revision),/already ended/);
  assert.equal(await ledger(),before,'cancellation never changes rewards, points or unlock credits');
  assert.equal((await db.query(`select has_table_privilege('anon','${ns}.showdown_submissions','UPDATE') allowed`)).rows[0].allowed,false);
  assert.equal((await db.query(`select has_function_privilege('authenticated','public.october_games_${env}(text,text,text,jsonb)','EXECUTE') allowed`)).rows[0].allowed,false);
  console.log('PASS '+env+': pending and active withdrawal, school-manager/temporary-manager authorization, confirmation/revision protection, idempotency, preserved competing votes/deadline, removed ballot invalidation, resubmission, sole challenger closure, finalized guard, audit and unchanged ledger.');
 }
}finally{await db.close();}
