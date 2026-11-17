import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;
 create function verify_supervisor_pin(text) returns boolean language sql as $$select $1='test'$$;
 create table locations(id bigint primary key,location_code text,school_name text,active boolean);
 create table location_information(id bigint primary key,location_code text,school_name text,active boolean);
 create table monthly_site_mappings(source_site_id text,main_location_id bigint,program_type text,active boolean);
 create table spark_excluded_days(location_id bigint,service_date date);
 insert into locations values(9,'8575','Carson HS',true);
 insert into location_information values(99,'8575','Carson HS',true);
 insert into monthly_site_mappings values('1857501',99,'main',true),('1857801',99,'offsite',true),('1951401',99,'EEC',true);
 insert into spark_excluded_days values(9,'2026-09-07'),(9,'2026-09-04');
 create table official_meal_counts(location_id bigint,service_date date,breakfast_count integer,lunch_count integer,supper_count integer,source_label text,source_filename text,imported_at timestamptz,updated_at timestamptz,primary key(location_id,service_date));
 insert into official_meal_counts(location_id,service_date,breakfast_count) values(9,'2026-09-05',3);`);
 await db.exec(await readFile('supabase/migrations/202610020001_official_meal_rollups.sql','utf8'));
 const upload=async(rows,pin='test')=>db.query('select import_official_meal_counts($1,$2,$3)',[pin,'test.csv',rows]);
 const row=(date,n,site='1857501')=>({location_id:9,source_site_id:site,service_date:date,breakfast_count:n,lunch_count:n*2,supper_count:n*3});
 const totals=async()=> (await db.query('select service_date::text,breakfast_count,lunch_count,supper_count from official_meal_counts order by service_date')).rows;
 const rows=[row('2026-09-11',100),row('2026-09-12',10),row('2026-09-13',20),row('2026-09-11',5,'1857801'),row('2026-09-11',7,'1951401'),row('2026-09-07',8),row('2026-09-04',4)];
 await upload(rows);let before=await totals();
 assert.deepEqual(before,[{service_date:'2026-08-28',breakfast_count:4,lunch_count:8,supper_count:12},{service_date:'2026-09-04',breakfast_count:11,lunch_count:16,supper_count:24},{service_date:'2026-09-11',breakfast_count:142,lunch_count:284,supper_count:426}]);
 await upload(rows);assert.deepEqual(await totals(),before);
 await upload([row('2026-09-11',0)]);assert.deepEqual(await totals(),before);
 await upload([row('2026-09-11',110)]);assert.equal((await totals())[2].breakfast_count,152);
 await upload([row('2026-09-12',12)]);assert.equal((await totals())[2].breakfast_count,154);
 await upload([row('2026-09-12',12)]);assert.equal((await totals())[2].breakfast_count,154);
 await assert.rejects(upload(rows,'bad'),/authorization/);
 await assert.rejects(upload([row('2026-09-11',1,'unknown')]),/Unknown/);
 assert.equal((await db.query("select jsonb_array_length(get_official_meal_count_mappings('test')) n")).rows[0].n,3);
 // Upgrade an existing database containing the old combined Friday totals.
 await db.exec('create table meal_counts(location_id bigint,service_date date,lunch_count integer); insert into meal_counts values(9,\'2026-09-11\',999)');
 await db.exec(await readFile('supabase/migrations/20261117183146_official_meal_service_dates.sql','utf8'));
 let exact=await totals();
 const day=date=>exact.find(r=>r.service_date===date);
 assert.equal(day('2026-09-11').breakfast_count,122); // main + offsite + EEC, same date only
 assert.equal(day('2026-09-12').breakfast_count,12);
 assert.equal(day('2026-09-13').breakfast_count,20);
 assert.equal(day('2026-09-07').breakfast_count,8);
 assert.equal(day('2026-09-04').breakfast_count,4);
 assert.equal(day('2026-09-05').breakfast_count,3);
 assert(!day('2026-08-28')); // obsolete shifted-date artifact is backed up, then removed
 assert((await db.query('select count(*)::int n from official_meal_date_repair_backup')).rows[0].n>0);
 const stable=await totals();await upload([row('2026-09-12',12)]);assert.deepEqual(await totals(),stable);
 await upload([row('2026-09-11',0)]);exact=await totals();assert.equal(day('2026-09-11').breakfast_count,12);
 await upload([{location_id:9,source_site_id:'1857501',service_date:'2026-09-11',lunch_count:50}]);
 exact=await totals();assert.equal(day('2026-09-11').breakfast_count,12);assert.equal(day('2026-09-11').lunch_count,74);
 await upload([row('2026-09-12',0)]);exact=await totals();assert.equal(day('2026-09-12').breakfast_count,0);
 assert.equal((await db.query('select lunch_count from meal_counts')).rows[0].lunch_count,999);
 await assert.rejects(upload([row('2026-09-12',100)],'bad'),/authorization/);
 await assert.rejects(upload([row('2026-09-12',100,'unknown')]),/Unknown/);
 await db.exec('set role anon');await assert.rejects(db.exec('select * from official_meal_count_sources'),/permission denied/);
 await assert.rejects(db.exec('select * from official_meal_date_repair_backup'),/permission denied/);
 console.log('PASS: legacy upgrade repair, exact service dates including weekends/holidays, same-date offsite/EEC totals, backup, repeat/overlapping uploads, zero corrections, partial meals, authorization and manager history preservation.');
}finally{await db.close();}
