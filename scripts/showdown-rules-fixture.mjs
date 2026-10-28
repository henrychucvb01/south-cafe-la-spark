import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export async function createFixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table public.locations(id bigint primary key,school_name text,active boolean);
 insert into public.locations select n,'School '||n,true from generate_series(1,8)n;
 create table public.supper_monitoring_sessions(location_id bigint,employee_id bigint,actor_role text);
 create function public.require_supper_monitoring_session(text) returns public.supper_monitoring_sessions language plpgsql as $$begin
  case $1 when 'one' then return (1,11,'manager')::public.supper_monitoring_sessions;when 'two' then return (2,22,'manager')::public.supper_monitoring_sessions;when 'three' then return (3,33,'manager')::public.supper_monitoring_sessions;when 'four' then return (4,44,'manager')::public.supper_monitoring_sessions;when 'cover' then return (2,null,'manager')::public.supper_monitoring_sessions;when 'other-manager' then return (2,222,'manager')::public.supper_monitoring_sessions;else raise exception 'Invalid session';end case;end$$;
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
   constraint unlock_credit_events_kind_check check(kind in('quest')),constraint unlock_credit_events_check check(kind='quest' and credits=3));
  create function public.october_games_${env}(p_action text,p_token text default null,p_pin text default null,p_payload jsonb default '{}') returns jsonb language plpgsql as $$
   declare session public.supper_monitoring_sessions;admin boolean:=p_pin='admin';begin
   if not coalesce(admin,false) then session:=public.require_supper_monitoring_session(p_token);end if;
   if p_action not in('authorize','list') then raise exception 'Unexpected legacy action';end if;
   return jsonb_build_object('admin',coalesce(admin,false),'location_id',session.location_id,'identified',true,'participating',true,
    'schools',(select jsonb_agg(to_jsonb(l)) from public.locations l),'quests',(select coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('first_school',c.location_id)),'[]') from ${ns}.quests q left join ${ns}.quest_claims c on c.quest=q.id));end$$;`);
 }
 for(const file of ['20261020153852_sidequest_showdown.sql','20261021151935_sidequest_cancel_challenge.sql','20261021160528_showdown_school_manager_cancel.sql','20261021162526_temporary_manager_school_games.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 return db;
}
