import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {doorFixture} from './door-contest-fixture.mjs';
const db=await doorFixture();
try{
 await db.exec((await readFile('supabase/migrations/20261116165934_door_contest_cycles_and_schedule.sql','utf8')).replace(/-- CRON-BEGIN[\s\S]*?-- CRON-END/,''));
 for(const env of ['dev','live'])await db.exec(`create table october_${env}.showdown_submissions(id uuid primary key,quest integer,location_id bigint,photo_path text,state text,consent boolean,submitted_at timestamptz default now());`);
 await db.exec(await readFile('supabase/migrations/20261116174755_supervisor_games_photo_library.sql','utf8'));
 for(const env of ['dev','live']){
  const ns='october_'+env;
  await db.exec(`insert into ${ns}.door_contests(id,settings) values(1,'{"door_title":"Fictional Halloween"}');update ${ns}.settings set door_contest=2,door_title='Fictional Winter';
   insert into ${ns}.entries(location_id,quest,door_contest,photo_path,consent,state) values(1,0,1,'old-door',true,'approved'),(2,0,2,'new-door',true,'approved'),(1,1,0,'approved-quest',true,'approved'),(2,1,0,'pending-quest',true,'pending'),(1,2,0,'rejected-quest',true,'rejected');
   insert into ${ns}.showdown_submissions(id,quest,location_id,photo_path,state,consent) values('00000000-0000-0000-0000-000000000001',1,2,'showdown-approved','approved',true),('00000000-0000-0000-0000-000000000002',1,2,'showdown-private','approved',false),('00000000-0000-0000-0000-000000000003',1,2,'showdown-cancelled','cancelled',true),('00000000-0000-0000-0000-000000000004',1,2,'approved-quest','approved',true);
   update ${ns}.rounds set photo_path='secret-mystery',answer='Secret';`);
  const call=pin=>db.query('select public.spark_games_photo_library($1,$2) photos',[pin,env==='dev']);
  await assert.rejects(call('manager'),/Supervisor authorization/);await assert.rejects(call(null),/Supervisor authorization/);
  const rows=(await call('admin-test')).rows[0].photos;
  assert.equal(rows.length,4);assert.equal(rows.find(p=>p.photo_path==='old-door').contest,'Fictional Halloween');assert.equal(rows.find(p=>p.photo_path==='new-door').contest,'Fictional Winter');assert(rows.some(p=>p.photo_path==='showdown-approved'));
  for(const path of ['secret-mystery','pending-quest','rejected-quest','showdown-private','showdown-cancelled'])assert(!JSON.stringify(rows).includes(path));
  await db.exec('set role anon');await assert.rejects(call('admin-test'),/permission denied/);await db.exec('reset role');
 }
 console.log('PASS DB: supervisor-only dev/live library, historical/current contest names, approved consented submissions, deduplication, private/pending/rejected/cancelled exclusions, mystery privacy and restricted RPC.');
}finally{await db.close();}
