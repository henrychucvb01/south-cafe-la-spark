import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;
 create table locations(id bigint primary key,active boolean);create table employees(id bigint primary key,location_id bigint,employee_name text,active boolean);
 insert into locations values(1,true),(2,true);insert into employees values(11,1,'Manager A',true),(22,2,'Manager B',true);
 create function verify_manager_pin(text,text) returns boolean language sql as $$select $2='1234'$$;
 create function verify_covering_pin(text) returns boolean language sql as $$select $1='5678'$$;`);
 await db.exec(await readFile('supabase/migrations/202609230001_supper_monitoring.sql','utf8'));
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const open=async(id=11,pin='1234',school=1,name=null)=>(await q('select open_supper_monitoring_session($1,$2,$3,$4) token',[school,id,pin,name]))[0].token;
 await db.exec('set role anon');
 for(let n=0;n<10;n++)assert.ok(await open());
 assert.equal(await open(),null,'Reproduces the old lockout after successful navigation');
 await db.exec('reset role;truncate supper_monitoring_attempts;');
 await db.exec(await readFile('supabase/migrations/202610070007_manager_session_attempts.sql','utf8'));
 await db.exec('set role anon');
 for(let n=0;n<30;n++){const token=await open();assert.ok(token);await q('select close_supper_monitoring_session($1)',[token]);}
 for(let n=0;n<30;n++)assert.ok(await open(null,'5678',1,'Covering Manager'));
 await db.exec('reset role');assert.equal((await q('select count(*)::int n from supper_monitoring_attempts'))[0].n,0);
 await db.exec('set role anon');
 assert.equal(await open(11,'1234',2),null,'Correct PIN cannot access a different school');
 for(let n=0;n<9;n++)assert.equal(await open(11,'0000'),null);
 assert.ok(await open(),'Nine failures still permit a verified sign-in');
 assert.equal(await open(11,'0000'),null);
 assert.equal(await open(),null,'Ten failed attempts retain lockout');
 assert.ok(await open(22,'1234',2),'Other manager remains unaffected');
 assert.ok(await open(null,'5678',1,'Covering Manager'),'Covering identity remains separate');
 for(let n=0;n<10;n++)assert.equal(await open(null,'0000',1,'Covering Manager'),null);
 assert.equal(await open(null,'5678',1,'Covering Manager'),null);
 await db.exec("reset role;update supper_monitoring_attempts set attempted_at=now()-interval '16 minutes';set role anon;");
 assert.ok(await open(),'Manager recovers after the failed-attempt window');
 assert.ok(await open(null,'5678',1,'Covering Manager'));
 console.log('PASS: reproduced old successful-login lockout; regular/covering repeated access works; failed PIN limit, school isolation, and expiry remain enforced.');
}finally{await db.close();}
