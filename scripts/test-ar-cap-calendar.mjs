import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
const read=p=>readFile(p,'utf8');
try {
 await db.exec(`create role anon; create role authenticated;
 create table test_clock(t timestamptz);insert into test_clock values('2026-10-01T18:00Z');
 create function test_now() returns timestamptz language sql stable as $$select t from test_clock$$;
 create table locations(id bigint primary key,school_name text,location_code text);
 create table spark_points(id bigint generated always as identity primary key,location_id bigint,points integer,point_type text,description text,service_date date,source text,employee_id bigint,employee_name text,unique_key text unique);
 create table spark_excluded_days(location_id bigint,service_date date);
 create table spark_monthly_cup_results(month date,location_id bigint,location_code text,school_name text,points bigint,rank integer,tokens integer);
 create table mystery_redemptions(location_id bigint,service_date date,reward_type text,starts_at timestamptz,ends_at timestamptz);
 insert into locations values(15,'Carson El','2836');
 insert into spark_excluded_days values(15,'2026-09-04'),(15,'2026-09-07'),(15,'2026-10-02');
 insert into spark_monthly_cup_results values('2026-09-01',15,'2836','Carson El',1026,1,2),('2026-09-01',18,'8103','Curtiss',1023,2,2);
 insert into spark_points(location_id,points,point_type,service_date,source,unique_key)
 select 15,case when t='finish_line_late' then 2 else 5 end,t,d::date,'automatic',t||d from unnest(array['2026-09-04','2026-09-07']) d cross join unnest(array['breakfast_meal_count','lunch_meal_count','supper_meal_count','finish_line_late']) t;
 insert into spark_points(location_id,points,point_type,service_date,unique_key) values(15,25,'perfect_week','2026-09-04','week');`);
 const initial=await read('supabase/migrations/202608310002_ar_training.sql');
 await db.exec(initial.slice(0,initial.indexOf('create index')));
 await db.exec(`create table ar_training_questions(id text primary key,bank_order integer,correct_index integer,active boolean default true);
 create table ar_training_location_cycles(location_id bigint primary key,cycle_number integer default 0,batch_index integer default 0,answered_question_ids jsonb default '[]',updated_at timestamptz);
 insert into ar_training_question_keys select 'q'||i,0,'test',true from generate_series(1,50) i;
 insert into ar_training_questions select 'q'||i,i,0,true from generate_series(1,50) i;`);
 // Seed both September and October existing awards; October includes a doubled school.
 for(const date of ['2026-09-30','2026-10-01']) for(const loc of [11,12]) {
  await db.exec(`insert into ar_training_daily_progress(location_id,service_date,points_awarded,awarded_question_ids) values(${loc},'${date}',10,'["q1","q2","q3","q4","q5"]');
  insert into ar_training_attempts(location_id,service_date,question_id,selected_index,is_correct,points_awarded,answered_at)
  select ${loc},'${date}','q'||i,0,true,2,'${date}'::timestamptz+i*interval '1 minute' from generate_series(1,5) i;
  insert into spark_points(location_id,service_date,point_type,points,unique_key)
  select ${loc},'${date}','ar_training',${loc===12?4:2},'ar-training-${loc}-${date}-q'||i from generate_series(1,5) i;`);
 }
 let m=await read('supabase/migrations/202610010001_ar_cap_and_carson_calendar.sql');
 await db.exec(m.replaceAll('now()','test_now()'));
 const scalar=async sql=>Object.values((await db.query(sql)).rows[0])[0];
 assert.equal(await scalar("select points from spark_monthly_cup_results where location_id=15"),992);
 assert.equal(await scalar("select rank from spark_monthly_cup_results where location_id=15"),2);
 assert.equal(await scalar("select sum(tokens) from spark_monthly_cup_results"),4);
 assert.equal(await scalar("select sum(points) from spark_points where location_id=15"),25);
 for(const loc of [11,12]) {
  assert.equal(await scalar(`select sum(points) from spark_points where location_id=${loc} and service_date='2026-09-30'`),loc===12?20:10);
  assert.equal(await scalar(`select sum(points) from spark_points where location_id=${loc} and service_date='2026-10-01'`),loc===12?10:5);
  assert.equal(await scalar(`select sum(points_awarded) from ar_training_attempts where location_id=${loc} and service_date='2026-10-01'`),5);
 }
 const double=await read('supabase/migrations/202609300001_digital_pull_rewards.sql');
 await db.exec(double.slice(double.indexOf('create function public.mystery_double_bites_points()'),double.indexOf('create trigger mystery_double_bites_points')) .replaceAll('now()','test_now()'));
 await db.exec('create trigger mystery_double_bites_points before insert on spark_points for each row execute function mystery_double_bites_points()');
 const answer=async(loc,date,q=1,choice=0)=>(await db.query('select submit_ar_training_answer($1,null,null,$2,$3,$4) r',[loc,date,'q'+q,choice])).rows[0].r;
 for(const [date,loc] of [['2026-10-01',1],['2026-10-02',15],['2026-10-03',2]]) {
  await db.exec(`update test_clock set t='${date}T18:00Z'`);
  assert.equal((await answer(loc,date,1,1)).points_earned,0);
  assert.equal((await answer(loc,date,1)).points_earned,2);
  assert.equal((await answer(loc,date,1)).points_earned,0);
  const rest=await Promise.all([answer(loc,date,2),answer(loc,date,3),answer(loc,date,4)]);
  assert.equal(rest.reduce((sum,r)=>sum+r.points_earned,0),3);
  assert.equal((await answer(loc,date,5)).cap_reached,true);
  assert.equal(await scalar(`select sum(points) from spark_points where location_id=${loc} and service_date='${date}' and point_type='ar_training'`),5);
 }
 await db.exec("update test_clock set t='2026-09-29T18:00Z'");
 for(let i=1;i<=6;i++) await answer(3,'2026-09-29',i);
 assert.equal(await scalar("select points_awarded from ar_training_daily_progress where location_id=3"),10);
 await db.exec("update test_clock set t='2026-10-04T18:00Z';insert into mystery_redemptions values(5,null,'double_bites','2026-10-01','2026-11-01')");
 for(let i=1;i<=4;i++) await answer(5,'2026-10-04',i);
 assert.equal(await scalar('select sum(points) from spark_points where location_id=5'),10);
 // School-day guard applies to insert AND updates, never period bonuses or Daily Bites.
 for(const date of ['2026-09-04','2026-10-03']) for(const type of ['breakfast_meal_count','lunch_meal_count','supper_meal_count','finish_line','finish_line_late','mystery_checklist_makeup','perfect_week','daily_bites_visit','daily_bites_word_game','daily_bites_spark_sort']) {
  const blocked=!['perfect_week','daily_bites_visit','daily_bites_word_game','daily_bites_spark_sort'].includes(type);
  const {rows}=await db.query('insert into spark_points(location_id,points,point_type,service_date) values(15,5,$1,$2) returning id,points',[type,date]);
  assert.equal(rows[0].points,blocked?0:5);
  await db.query('update spark_points set points=5 where id=$1',[rows[0].id]);
  assert.equal(await scalar(`select points from spark_points where id=${rows[0].id}`),blocked?0:5);
 }
 await db.exec("insert into spark_points(location_id,points,point_type,service_date) values(15,5,'finish_line','2026-10-01')");
 assert.equal(await scalar("select sum(points) from spark_points where location_id=15 and service_date='2026-10-01'"),5);
 console.log('PASS: September preserved; October backfill and five-point cap; 2+2+1 awards; wrong/repeated answers; queued answers; weekday/weekend/holiday AR; double prize; school-day insert/update guards; Carson 34-point correction; valid weekly bonus and paid Cup tokens preserved.');
} finally {await db.close();}
