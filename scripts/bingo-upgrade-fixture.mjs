import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';

export async function bingoFixture(production=false) {
 const db=new PGlite();
 await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create table locations(id bigint primary key,school_name text,location_code text,labor_type text,budget_labor_hours numeric,active boolean);
 create table finish_line_checks(id bigint primary key,location_id bigint,service_date date,status text,submitted_at timestamptz);
 create table finish_line_items(finish_line_check_id bigint,item_key text,answer text);
 create table spark_excluded_days(location_id bigint,service_date date);
 create table meal_counts(location_id bigint,service_date date,breakfast_count numeric,lunch_count numeric,supper_count numeric,supper_status text,created_at timestamptz);
 create table labor_hours(location_id bigint,service_date date,additional_worker_hours numeric,manager_overtime_hours numeric);
 create table spark_points(location_id bigint,points integer,point_type text,description text,service_date date,source text,unique_key text unique,created_at timestamptz default now(),id bigint generated always as identity primary key);
 create table daily_bites_game_progress(location_id bigint,game_type text,service_date date,status text,completed_at timestamptz);
 create table ar_training_attempts(location_id bigint,service_date date,is_correct boolean,points_awarded integer,answered_at timestamptz);
 create table monitoring_records(location_id bigint,monitoring_type text,monitoring_number integer,school_year text,monitoring_date date,updated_at timestamptz,status text,locked boolean,monitor_role text,perfect_monitoring_override boolean,had_correction_requested boolean);
 create table supper_monitoring_sessions(location_id bigint,actor_role text);
 create function require_supper_monitoring_session(token text) returns supper_monitoring_sessions language plpgsql as $$
 begin if token is null or token !~ '^school[0-9]+$' then raise exception 'Invalid session'; end if;
 if not exists(select 1 from locations where id=substring(token from 7)::bigint) then raise exception 'Invalid school';end if;
 return (substring(token from 7)::bigint,'manager')::supper_monitoring_sessions;end;$$;
 create table location_information(id bigint,location_code text,active boolean);
 create table monthly_site_mappings(main_location_id bigint,active boolean,program_type text);
 create schema october_live;
 create table october_live.settings(id boolean primary key,quests_state text,mystery_state text);
 insert into october_live.settings values(true,'active','active');
 create table october_live.schools(location_id bigint,participating boolean);
 create table october_live.quests(id integer primary key,enabled boolean,eligible bigint[]);
 create table october_live.entries(id uuid primary key,location_id bigint,state text,reviewed_at timestamptz);
 create table october_live.quest_claims(quest integer,entry uuid,location_id bigint);
 create table october_live.rounds(id integer,solved_at timestamptz,photo_path text);
 insert into october_live.rounds values(1,null,'synthetic-photo');
 create table october_live.school_guesses(location_id bigint,submitted_at timestamptz);
 create function october_live.guess_history() returns table(location_id bigint,submitted_at timestamptz) language sql as $$select * from october_live.school_guesses;$$;
 create table spark_spotlights(id uuid primary key,published boolean);
 create table spark_spotlight_reactions(post_id uuid,location_id bigint,reacted_at timestamptz);
 insert into spark_spotlights values('11111111-1111-4111-8111-111111111111',true);
 `);
 const snapshot=JSON.parse(await readFile('scripts/fixtures/bingo-preflight-20261014.json','utf8'));
 const locations=production?snapshot.locations:[{id:4,name:'Synthetic School',labor:'secondary',hours:20},{id:5,name:'Willenberg',labor:'special',hours:20},{id:32,name:'Test High School',labor:'secondary',hours:20}];
 for(const l of locations) {
  await db.query('insert into locations values($1,$2,$3,$4,$5,true)',[l.id,l.name,String(l.id),l.labor,l.hours]);
  await db.query('insert into october_live.schools values($1,$2)',[l.id,l.id!==32]);
  if(l.id!==32) {
   await db.query('insert into location_information values($1,$2,true)',[l.id,String(l.id)]);
   await db.query("insert into monthly_site_mappings values($1,true,'main')",[l.id]);
  }
 }
 const files=['202609250008_finish_line_bonus_reconciliation.sql','202609250009_bingo_card_cycles.sql','202609250010_mystery_pull.sql','202609260001_mystery_pull_prize_bundles.sql','202609300001_digital_pull_rewards.sql','202610010002_makeup_school_days.sql','20261014163617_bingo_upgrades.sql','20261014165513_bingo_replacement_family_choices.sql','20261014170823_bingo_sidequest_win_time.sql'];
 for(const file of files)await db.exec((await readFile('supabase/migrations/'+file,'utf8')).replace(/-- CRON-BEGIN[\s\S]*?-- CRON-END/,''));
 if(production) {
  await db.exec('delete from spark_bingo_cards');
  for(const c of snapshot.cards)await db.query('insert into spark_bingo_cards(id,location_id,cycle,goal_ids,started_at,started_on,completed_ids,revision,blackout_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[c.id,c.location_id,c.cycle,c.goal_ids,c.started_at,c.started_on,c.completed_ids,c.revision,c.blackout_at]);
 }
 return db;
}
