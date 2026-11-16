// Real legacy dev/live engines in isolated PostgreSQL; no production sessions or writes.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export async function doorFixture(){
const db=new PGlite();
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

 await db.exec(await readFile('supabase/migrations/20261009052532_october_door_settings.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261009151349_holiday_door_controls.sql','utf8'));
 for(const env of ['dev','live'])await db.exec(`
 alter function public.october_games_${env}(text,text,text,jsonb) set schema october_${env};
 alter function october_${env}.october_games_${env}(text,text,text,jsonb) rename to game_engine;
 create function public.october_games_${env}(p_action text,p_token text default null,p_pin text default null,p_payload jsonb default '{}') returns jsonb language sql security definer as $$select october_${env}.game_engine($1,$2,$3,$4)$$;
 `);
 return db;
}
