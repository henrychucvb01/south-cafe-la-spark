import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
try {
 await db.exec(`create role anon; create role authenticated;
 create table supper_monitoring_sessions(token_hash text,location_id bigint,actor_role text);
 create table official_meal_counts(location_id bigint,service_date date,breakfast_count int,lunch_count int,supper_count int);
 create table meal_counts(like official_meal_counts);
 create table labor_hours(location_id bigint,service_date date,additional_worker_hours numeric);
 create function require_supper_monitoring_session(p_token text) returns supper_monitoring_sessions language plpgsql as $$
 declare s supper_monitoring_sessions; begin select * into s from supper_monitoring_sessions where token_hash=p_token;
 if s.token_hash is null then raise exception 'Session expired'; end if; return s; end $$;
 insert into supper_monitoring_sessions values('manager-one',1,'manager'),('temporary',1,'manager'),('supervisor',2,'supervisor'),('invalid-role',1,'worker');
 insert into official_meal_counts select i,'2026-09-25',0,243,50 from generate_series(1,28) i;
 insert into meal_counts select i,'2026-09-25',100,163,40 from generate_series(1,28) i;
 insert into labor_hours values(1,'2026-09-25',2),(2,'2026-09-25',5);
 insert into official_meal_counts values(1,'2026-08-01',90,100,20);`);
 await db.exec(await readFile('supabase/migrations/20261117180336_school_meal_analytics_official_counts.sql','utf8'));
 const get=async(token,start='2026-09-01',end='2026-09-30')=>(await db.query('select school_meal_analytics($1,$2,$3) data',[token,start,end])).rows[0].data;
 for(const token of ['manager-one','temporary','supervisor']) {
  const data=await get(token);const id=token==='supervisor'?2:1;
  assert.equal(data.official_rows.length,1);assert.equal(data.official_rows[0].lunch_count,243);
  for(const key of ['official_rows','meal_rows','labor_rows'])assert(data[key].every(r=>r.location_id===id));
 }
 await assert.rejects(get('expired'),/Session expired/);
 await assert.rejects(get('invalid-role'),/School access/);
 await assert.rejects(get('manager-one','2026-10-01','2026-09-01'),/valid date range/);
 await assert.rejects(get('manager-one','2020-01-01','2026-09-01'),/valid date range/);
 const counts=(await db.query('select count(*)::int n,sum(lunch_count)::int lunches from meal_counts')).rows[0];
 assert.deepEqual(counts,{n:28,lunches:28*163});
 assert.deepEqual((await get('manager-one','2026-10-01','2026-10-02')).official_rows,[]);
 console.log('PASS: manager, temporary manager, Supervisor, school isolation, date boundaries, authorization, and all 28 original school records preserved.');
} finally {await db.close();}
