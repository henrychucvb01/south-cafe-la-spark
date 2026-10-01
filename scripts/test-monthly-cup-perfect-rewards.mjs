import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
const id='00000000-0000-0000-0000-000000000001';
try {
 await db.exec(`create role anon;create role authenticated;
 create table locations(id bigint primary key,school_name text,location_code text,active boolean);
 create table spark_points(id bigint generated always as identity primary key,location_id bigint,points integer,point_type text,description text,service_date date,source text,unique_key text unique,created_at timestamptz default now());
 create table monitoring_records(id uuid primary key,location_id bigint,monitoring_type text,monitoring_number integer,school_year text,monitoring_date date,status text,locked boolean,monitor_role text,perfect_monitoring_override boolean,had_correction_requested boolean);
 create table mystery_balances(location_id bigint primary key,tokens integer default 0 check(tokens between 0 and 1000000),revision integer default 1);
 insert into locations select i,'School '||i,i::text,true from generate_series(1,23) i;
 update locations set school_name='Test High School' where id=22;update locations set active=false where id=23;
 insert into monitoring_records values('${id}',1,'supper',1,'2026-27','2026-09-22','accepted',true,'manager',true,true);
 insert into spark_points(location_id,points,point_type,description,service_date,source,unique_key) values(1,20,'monitoring_supper','Perfect Supper Monitoring','2026-09-25','supervisor_monitoring','old-perfect'),(2,10,'monitoring_supper','Pass Supper Monitoring','2026-08-26','supervisor_monitoring','old-pass');
 `);
 let migration=await readFile('supabase/migrations/202609300002_monthly_cup_perfect_rewards.sql','utf8');
 migration=migration.replace(/-- CRON-BEGIN[\s\S]*?-- CRON-END/,'').replace('select public.spark_close_monthly_cups();','');
 await db.exec(migration);
 const scalar=async sql=>(await db.query(sql)).rows[0];
 assert.equal((await scalar("select count(*) n from spark_points where location_id=1")).n,1);
 assert.equal((await scalar("select service_date::text d from spark_points where location_id=1")).d,'2026-09-25');
 assert.equal((await scalar("select points from spark_points where unique_key='old-pass'")).points,10);
 await db.exec(`update monitoring_records set perfect_monitoring_override=false where id='${id}'`);
 assert.equal((await scalar("select count(*) n from spark_points where location_id=1")).n,0);
 await db.exec(`update monitoring_records set perfect_monitoring_override=true where id='${id}';update monitoring_records set locked=true where id='${id}';`);
 assert.equal((await scalar("select sum(points) n from spark_points where location_id=1")).n,20);
 await db.exec(`update monitoring_records set locked=false where id='${id}'`);
 assert.equal((await scalar("select count(*) n from spark_points where location_id=1")).n,0);
 await db.exec(`update monitoring_records set locked=true,monitor_role='supervisor' where id='${id}'`);
 assert.equal((await scalar("select count(*) n from spark_points where location_id=1")).n,0);
 await db.exec(`update monitoring_records set monitor_role='manager',perfect_monitoring_override=null,had_correction_requested=false where id='${id}'`);
 assert.equal((await scalar("select sum(points) n from spark_points where location_id=1")).n,20);
 await db.exec(`delete from monitoring_records where id='${id}'`);
 assert.equal((await scalar("select count(*) n from spark_points where location_id=1")).n,0);
 // Points strictly descend except ties crossing both reward boundaries.
 await db.exec(`insert into spark_points(location_id,points,point_type,service_date,unique_key)
 select i,case when i=6 then 960 when i=18 then 840 when i=21 then 0 when i>=22 then 9999 else 1010-i*10 end,'test','2026-09-30','score-'||i from generate_series(1,23) i;
 insert into mystery_balances values(1,3,9);`);
 const close=async time=>(await db.query('select spark_close_monthly_cups($1::timestamptz) n',[time])).rows[0].n;
 assert.equal(await close('2026-10-01T06:59:59Z'),0); // Still September in Los Angeles.
 assert.equal(await close('2026-10-01T07:35:00Z'),18);
 assert.equal((await scalar('select tokens from mystery_balances where location_id=1')).tokens,5);
 assert.equal((await scalar('select revision from mystery_balances where location_id=1')).revision,10);
 assert.equal((await scalar('select tokens from mystery_balances where location_id=6')).tokens,2);
 assert.equal((await scalar('select tokens from mystery_balances where location_id=18')).tokens,1);
 assert.equal((await scalar('select count(*) n from mystery_balances where location_id in (19,20,21,22,23)')).n,0);
 assert.equal(await close('2026-10-01T08:35:00Z'),0);
 assert.equal((await scalar("select count(*) n from spark_monthly_cup_months where month<'2026-09-01'")).n,0);
 await db.exec("insert into spark_points(location_id,points,point_type,service_date,unique_key) values(19,10000,'late','2026-09-30','late-correction')");
 assert.equal(await close('2026-10-02T07:35:00Z'),0);
 assert.equal((await scalar("select rank from spark_monthly_cup_results where month='2026-09-01' and location_id=19")).rank,19);
 // Retry after a transaction failure cannot leave a paid/snapshot half-state.
 await db.exec("insert into spark_points(location_id,points,point_type,service_date,unique_key) values(1,5,'test','2026-10-01','oct'); update mystery_balances set tokens=1000000 where location_id=1;");
 await assert.rejects(close('2026-11-01T08:35:00Z'),/check constraint/);
 assert.equal((await scalar("select count(*) n from spark_monthly_cup_months where month='2026-10-01'")).n,0);
 await db.exec('update mystery_balances set tokens=5 where location_id=1');assert.equal(await close('2026-11-01T08:35:00Z'),1);
 // June uses the existing June 7 competition cutoff; July has no Cup.
 await db.exec("insert into spark_points(location_id,points,point_type,service_date,unique_key) values(1,3,'test','2027-06-07','june'),(2,100,'test','2027-06-08','after-season'),(2,100,'test','2027-07-01','july')");
 await close('2027-08-01T07:35:00Z');
 assert.equal((await scalar("select points from spark_monthly_cup_results where month='2027-06-01' and location_id=2")).points,0);
 assert.equal((await scalar("select count(*) n from spark_monthly_cup_months where month='2027-07-01'")).n,0);
 // Public callers can only read standings; rules, token amounts and payouts stay private.
 await db.exec('grant insert,update on spark_points to anon;grant usage on sequence spark_points_id_seq to anon;set role anon');
 const display=(await scalar("select spark_monthly_cup_standings('2026-09-01','2026-09-30') result")).result;
 assert.equal(display.length,21);assert(!JSON.stringify(display).match(/tokens|pull/i));
 await assert.rejects(db.exec('select * from spark_monthly_cup_results'),/permission denied/);
 await assert.rejects(close('2028-01-01T00:00:00Z'),/permission denied/);
 await assert.rejects(db.exec(`select spark_sync_perfect_monitoring('${id}')`),/permission denied/);
 await assert.rejects(db.exec("insert into spark_points(location_id,points,point_type) values(1,10,'monitoring_supper')"),/Monitoring points are automatic/);
 await assert.rejects(db.exec("insert into spark_points(location_id,points,point_type,source) values(1,20,'monitoring_supper','automatic_monitoring')"),/Monitoring points are automatic/);
 console.log('PASS: legacy adoption, 20-point backfill, star/unlock/delete reconciliation, no Pass credits, tied ranks, Los Angeles month boundary, one-time atomic token awards, frozen results, retry rollback, season cutoff and private reward rules.');
} finally {await db.close();}
