import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();try {
 await db.exec(`create role anon;create role authenticated;
 create table locations(id bigint primary key,active boolean);create table employees(id bigint primary key,location_id bigint,employee_name text,active boolean);
 insert into locations values(1,true),(2,true);insert into employees values(11,1,'Manager A',true),(22,2,'Manager B',true);
 create function verify_manager_pin(text,text) returns boolean language sql as $$select $2='1234'$$;
 create function verify_covering_pin(text) returns boolean language sql as $$select $1='5678'$$;
 create table meal_counts(location_id bigint,breakfast_count int);insert into meal_counts values(1,642);`);
 await db.exec(await readFile('supabase/migrations/202609230001_supper_monitoring.sql','utf8'));
 await db.exec("alter table supper_monitoring_sessions add column actor_role text not null default 'manager';");
 const old=await readFile('supabase/migrations/202609240001_supper_monitoring_review.sql','utf8');const start=old.indexOf('create or replace function public.require_supper_monitoring_session');await db.exec(old.slice(start,old.indexOf('end $$;',start)+7));
 await db.exec(await readFile('supabase/migrations/202610060001_breakfast_foundation.sql','utf8'));

 await db.exec("create table test_clock(value timestamptz);insert into test_clock values('2026-10-06 15:00:00+00');create function test_now() returns timestamptz language sql as $$select value from test_clock$$;");
 // Controlled test clock only; production always uses PostgreSQL clock_timestamp().
 await db.exec((await readFile('supabase/migrations/202610060002_breakfast_teacher.sql','utf8')).replaceAll('clock_timestamp()', 'public.test_now()'));
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 await db.exec('set role anon');
 const token=(await q("select open_supper_monitoring_session(1,11,'1234',null) t"))[0].t;
 const other=(await q("select open_supper_monitoring_session(2,22,'1234',null) t"))[0].t;
 const c=(await q("select breakfast_save_classroom($1,null,null,'S14','Teacher',28,'Main',true) v",[token]))[0].v;
 const qr=(await q('select breakfast_classroom_qr($1,$2) v',[token,c.id]))[0].v;
 const page=async()=>(await q('select breakfast_teacher_page($1) v',[qr]))[0].v;
 const submit=async(count,rev=0,cert=true,date='2026-10-06',comments='')=>(await q('select breakfast_teacher_submit($1,$2,$3,$4,$5,$6) v',[qr,date,count,comments,cert,rev]))[0].v;
 const message=async(body,delivery='until_ack',ack=true,expires=null)=>q('select breakfast_send_message($1,$2,$3,$4,$5,$6)',[token,c.id,body,delivery,ack,expires]);
 const clock=async(value)=>{await db.exec('reset role');await q('update test_clock set value=$1',[value]);await db.exec('set role anon');};
 assert.equal((await page()).service_date,'2026-10-06');assert.equal((await page()).closed,false);assert.equal((await page()).record,null);
 await assert.rejects(q('select breakfast_classroom_qr($1,$2)',[other,c.id]),/not found/);
 await assert.rejects(q("select breakfast_send_message($1,$2,'Bad','today',false,null)",[other,c.id]),/not found/);
 await assert.rejects(q("select breakfast_teacher_page('00000000-0000-0000-0000-000000000000')"),/unavailable/);
 await assert.rejects(submit(3,0,false),/Confirm/);await assert.rejects(submit(-1),/valid count/);await assert.rejects(submit(3,0,true,'2026-10-05'),/service date/);
 await message('Please count at service');let p=await page();const mid=p.messages[0].id;
 await assert.rejects(submit(24),/Acknowledge/);
 await q('select breakfast_teacher_message($1,$2,false)',[qr,mid]);await q('select breakfast_teacher_message($1,$2,false)',[qr,mid]);
 await q('select breakfast_teacher_message($1,$2,true)',[qr,mid]);await q('select breakfast_teacher_message($1,$2,true)',[qr,mid]);assert.equal((await page()).messages.length,0);
 p=await submit(24);assert.equal(p.record.count,24);assert.equal(p.record.revision,1);
 p=await submit(24);assert.equal(p.record.revision,1); // retry is idempotent
 await assert.rejects(submit(25),/another session/);
 p=await submit(23,1,true,'2026-10-06','More fruit tomorrow');assert.equal(p.record.revision,2);
 await db.exec('reset role');const events=await q('select * from breakfast_events order by id');assert.equal(events.filter(e=>e.action==='teacher_submission').length,1);assert.equal(events.filter(e=>e.action==='teacher_correction').length,1);assert.equal(events.filter(e=>e.action==='teacher_acknowledgment').length,1);assert.equal(events.filter(e=>e.action==='teacher_message_displayed').length,1);assert.equal(events.find(e=>e.action==='teacher_correction').before_data.count,24);assert.equal((await q('select breakfast_count from meal_counts'))[0].breakfast_count,642);await db.exec('set role anon');
 for(const table of ['breakfast_settings','breakfast_messages','breakfast_daily_records','breakfast_events'])for(const verb of ['select * from','delete from'])await assert.rejects(q(verb+' '+table),/permission denied/);
 await assert.rejects(q('select breakfast_require_qr($1)',[qr]),/permission denied/);
 await clock('2026-10-06 16:00:00+00');assert.equal((await page()).closed,true);await assert.rejects(submit(22,2),/closed/);assert.equal((await page()).record.count,23);
 await q("select breakfast_manager_settings($1,true,'09:30','','')",[token]);assert.equal((await page()).closed,false);
 await assert.rejects(q("select breakfast_manager_settings($1,true,'09:30','javascript:alert(1)','')",[token]),/check constraint/);
 await message('Next open','next_open',false);const next=(await page()).messages[0];await q('select breakfast_teacher_message($1,$2,false)',[qr,next.id]);
 await message('Expiration','expires',true,'2026-10-06');await clock('2026-10-07 15:00:00+00');assert.equal((await page()).record,null);assert.equal((await page()).messages.length,0);await assert.rejects(submit(23,2),/service date/);
 p=await submit(0,0,true,'2026-10-07');assert.equal(p.record.count,0);
 await q("select breakfast_save_classroom($1,$2,1,'S14','New Teacher',29,'Main',true)",[token,c.id]);
 await db.exec('reset role');assert.equal((await q("select teacher_snapshot from breakfast_daily_records where service_date='2026-10-06'"))[0].teacher_snapshot,'Teacher');await db.exec('set role anon');
 await q("select breakfast_save_classroom($1,$2,2,'S14','New Teacher',29,'Main',false)",[token,c.id]);await assert.rejects(page(),/unavailable/);
 console.log('PASS: QR scope, public table denial, messages/display/ack, certification, counts, duplicate retries, stale revisions, immutable corrections, cutoff boundary/settings, date rollover, snapshots, inactive QR, unchanged official meals.');
}finally{await db.close();}
