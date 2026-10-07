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
 await db.exec('set role anon');
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const open=async(loc,id,pin='1234',name=null)=>(await q('select open_supper_monitoring_session($1,$2,$3,$4) token',[loc,id,pin,name]))[0].token;
 const a=await open(1,11),b=await open(2,22),cover=await open(1,null,'5678','Covering Manager');assert.equal(await open(2,11),null);
 const save=async(token=a,id=null,rev=null,room='B-203',teacher='Ms. Garcia',count=28,campus='',active=true)=>(await q('select breakfast_save_classroom($1,$2,$3,$4,$5,$6,$7,$8) value',[token,id,rev,room,teacher,count,campus,active]))[0].value;
 const history=async(token,id,event=null)=>(await q('select breakfast_classroom_history($1,$2,$3,null) value',[token,id,event]))[0].value;
 const list=async token=>(await q('select breakfast_list_classrooms($1) value',[token]))[0].value;
 const c=await save();assert.equal(c.room_code,'B-203');assert.equal(c.location_id,1);assert.equal(c.qr_token,undefined);assert.equal((await list(b)).length,0);
 await assert.rejects(save(a,null,null,' b-203 '),/already exists/);assert.notEqual((await save(a,null,null,'B-203','Ms. Other',12,'EEC')).id,c.id);
 await assert.rejects(save(a,null,null,'S14','Name',-1),/whole-number/);await assert.rejects(save(a,null,null,'S14','   ',10),/whole-number/);
 await assert.rejects(save(b,c.id,1),/not found/);await assert.rejects(history(b,c.id),/not found/);await assert.rejects(q('select breakfast_add_note($1,$2,$3)',[b,c.id,'wrong school']),/not found/);
 for(const table of ['breakfast_classrooms','breakfast_daily_records','breakfast_events']){await assert.rejects(q('select * from '+table),/permission denied/);await assert.rejects(q('delete from '+table),/permission denied/);}
 await assert.rejects(q('select breakfast_require_manager($1)',[a]),/permission denied/);
 await db.exec('reset role');const qr=(await q('select qr_token from breakfast_classrooms where id=$1',[c.id]))[0].qr_token;
 const day=(loc,date)=>q(`insert into breakfast_daily_records(classroom_id,location_id,service_date,room_snapshot,teacher_snapshot,enrollment_snapshot) values($1,$2,$3,'B-203','Ms. Garcia',28)`,[c.id,loc,date]);
 await day(1,'2026-10-06');await assert.rejects(day(2,'2026-10-07'),/foreign key/);await assert.rejects(day(1,'2026-10-06'),/unique/);
 await db.exec('set role anon');const edited=await save(cover,c.id,1,'S14','Mr. New',30);assert.equal(edited.id,c.id);assert.equal(edited.revision,2);await assert.rejects(save(a,c.id,1),/another session/);
 assert.equal((await save(a,c.id,2,'S14','Mr. New',30,'',false)).active,false);await save(a,c.id,3,'S14','Mr. New',30,'',true);
 await q('select breakfast_add_note($1,$2,$3)',[a,c.id,'Follow up.']);const h=await history(a,c.id);assert.equal(h.days[0].teacher_snapshot,'Ms. Garcia');assert.equal(h.events.length,5);assert.equal(h.events[3].actor_name,'Covering Manager');assert(h.events.every(e=>!e.after_data?.qr_token));
 for(let i=0;i<52;i++)await q('select breakfast_add_note($1,$2,$3)',[a,c.id,'Note '+i]);const p1=await history(a,c.id),p2=await history(a,c.id,p1.events[49].id);assert.equal(p1.events.length,51);assert.equal(p2.events.length,7);assert(!p2.events.some(e=>p1.events.slice(0,50).some(f=>f.id===e.id)));
 await db.exec('reset role');assert.equal((await q('select qr_token from breakfast_classrooms where id=$1',[c.id]))[0].qr_token,qr);assert.equal((await q('select breakfast_count from meal_counts'))[0].breakfast_count,642);
 await db.exec('update employees set active=false where id=11;set role anon');await assert.rejects(list(a),/no longer assigned/);
 await db.exec("reset role;update supper_monitoring_sessions set expires_at=now()-interval '1 minute';set role anon");await assert.rejects(list(cover),/Session expired/);
 console.log('PASS: persistence, rooms, scoped manager/covering access, expired/revoked sessions, table denial, concurrent edits, activation, stable QR, snapshots, history pagination, notes, and unchanged meal counts.');
}finally{await db.close();}
