// Real legacy dev/live engines in isolated PostgreSQL; no production sessions or writes.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table locations(id bigint primary key,school_name text,active boolean);insert into locations values(1,'School One',true),(2,'School Two',true),(3,'Nonparticipating',true);
 create table supper_monitoring_sessions(location_id bigint,employee_id bigint,actor_role text);
 create function verify_supervisor_pin(text) returns boolean language sql as $$select $1='admin-test'$$;
 create function require_supper_monitoring_session(text) returns supper_monitoring_sessions language plpgsql as $$begin
 if $1 in('temp-one','different-temp-name') then return (1,null,'manager')::supper_monitoring_sessions;
 elsif $1='named' then return (2,22,'manager')::supper_monitoring_sessions;
 elsif $1='nonparticipating-temp' then return (3,null,'manager')::supper_monitoring_sessions;
 else raise exception 'Invalid session';end if;end$$;
 create table public.spark_points(location_id bigint,points int,point_type text,description text,service_date date,source text,unique_key text unique);
 create table public.spark_monthly_cup_results(month date,location_id bigint,points int,rank int);`);
 for(const file of ['202610080001_october_games_development.sql','202610080002_october_games_display.sql','202610080003_october_first_school_quests.sql','202610080004_october_quest_completion_lock.sql','202610080005_october_custom_quests.sql','202610080006_october_quest_rewards.sql','202610080007_october_games_production.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 await db.exec(await readFile('supabase/migrations/20261021162526_temporary_manager_school_games.sql','utf8'));
 for(const env of ['dev','live']){
  const ns='october_'+env;
  const rpc=async(action,token='temp-one',payload={},pin=null)=>(await db.query(`select public.october_games_${env}($1,$2,$3,$4) result`,[action,token,pin,payload])).rows[0].result;
  await db.exec(`update ${ns}.schools set participating=location_id in(1,2);
  update ${ns}.settings set quests_state='active',door_state='active',mystery_state='active',submission_start=now()-interval '1 day',submission_end=now()+interval '1 day',voting_start=now()-interval '1 hour',voting_end=now()+interval '1 day';
  update ${ns}.quests set eligible=null;
  update ${ns}.rounds set photo_path='00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp',answer='Answer';`);
  assert.equal((await rpc('list')).identified,true,'temporary manager has a usable school game identity');
  await assert.rejects(rpc('list','forged'),/Invalid session/);
  await assert.rejects(rpc('settings','temp-one',{game:'quests',state:'paused'}),/Supervisor/);
  const photo={photo_path:'00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp',consent:true};
  await rpc('submit','temp-one',{quest:1,...photo});
  assert.equal((await db.query(`select location_id from ${ns}.entries where quest=1`)).rows[0].location_id,1);
  await assert.rejects(rpc('submit','nonparticipating-temp',{quest:2,...photo}),/Participating/);
  const other=(await db.query(`insert into ${ns}.entries(quest,location_id,photo_path,consent,state) values(0,2,$1,true,'approved') returning id`,[photo.photo_path])).rows[0].id;
  const own=(await db.query(`insert into ${ns}.entries(quest,location_id,photo_path,consent,state) values(0,1,$1,true,'approved') returning id`,[photo.photo_path])).rows[0].id;
  await assert.rejects(rpc('vote','temp-one',{id:own}),/another school/);
  await rpc('vote','temp-one',{id:other});
  assert.equal((await db.query(`select employee_id from ${ns}.votes where location_id=1`)).rows[0].employee_id,'covering-school:1');
  await assert.rejects(rpc('vote','different-temp-name',{id:other}),/already recorded/);
  await rpc('guess','temp-one',{round:1,guess:'Wrong answer'});
  assert.equal((await db.query(`select employee_id from ${ns}.guesses where location_id=1`)).rows[0].employee_id,'covering-school:1');
  await assert.rejects(rpc('guess','different-temp-name',{round:1,guess:'Another wrong answer'}),/already guessed/);
  await rpc('guess','named',{round:1,guess:'Wrong answer'});
  assert.equal((await db.query(`select employee_id from ${ns}.guesses where location_id=2`)).rows[0].employee_id,'22','named manager identity unchanged');
  const seen=await rpc('seen');assert.equal(seen.new_challenge,false);
  assert.equal((await db.query(`select count(*)::int n from ${ns}.seen where employee_id='covering-school:1'`)).rows[0].n,1);
  console.log('PASS '+env+': temporary upload, door vote, mystery guess, stable shared school limits, self-vote rejection, participation guard, supervisor denial, school badge and unchanged named identity.');
 }
}finally{await db.close();}
