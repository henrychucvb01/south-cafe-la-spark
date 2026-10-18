import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export async function rewardsFixture(dataDir){const db=new PGlite(dataDir);if(!(await db.query("select to_regclass('public.locations') as table_name")).rows[0].table_name)await db.exec(`create role anon;create role authenticated;create role service_role;
create table locations(id bigint primary key,school_name text,active boolean);insert into locations values(900001,'Synthetic Preview School',true),(900002,'Second Preview School',true);
create table spark_points(id bigint primary key,location_id bigint,points integer);insert into spark_points values(1,900001,125),(2,900002,80);
create table existing_game_progress(id integer primary key,status text);insert into existing_game_progress values(1,'unchanged');
create function verify_supervisor_pin(text) returns boolean language sql as $$select $1=repeat('a',64)$$;
create function spark_bingo_season_balance(bigint) returns numeric language sql set search_path=public,pg_temp as $$select coalesce(sum(points),0) from public.spark_points where location_id=$1$$;`);
const migration=await readFile('supabase/local/rewards-phase1-development.sql','utf8');
return {db,migration,install:async()=>{await db.exec("set spark.rewards_development='on'");if(!(await db.query("select to_regnamespace('rewards_dev') as ns")).rows[0].ns)await db.exec(migration);if(!(await db.query("select 1 from information_schema.columns where table_schema='rewards_dev' and table_name='settings' and column_name='builder_version'")).rows.length)await db.exec(await readFile('scripts/rewards-builder-schema.sql','utf8'));},rpc:async(action,payload={},pin='a'.repeat(64))=>(await db.query('select spark_rewards_dev($1,$2,null,$3) as data',[action,pin,payload])).rows[0].data};}
