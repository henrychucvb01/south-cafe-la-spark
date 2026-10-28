import {createFixture} from './showdown-rules-fixture.mjs';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const db=await createFixture();
try{
 await db.exec(await readFile('supabase/migrations/20261028161856_showdown_automatic_weekdays_limits.sql','utf8'));
 for(const env of ['dev','live']){
  const ns='october_'+env;
  const rpc=async(action,token='two',payload={},pin=null)=>(await db.query(`select public.october_games_${env}($1,$2,$3,$4) result`,[action,token,pin,payload])).rows[0].result;
  await db.exec(`insert into ${ns}.game_cycles values('00000000-0000-4000-8000-000000000001',date_trunc('month',current_date),'active',null);
   insert into ${ns}.quests(id,name,description,goal,cycle_id) select n,'Prompt '||n,'A display','Goal','00000000-0000-4000-8000-000000000001' from generate_series(1,9)n;
   insert into ${ns}.entries select gen_random_uuid(),id,1,'original.webp','approved' from ${ns}.quests;
   insert into ${ns}.quest_claims select quest,id,location_id from ${ns}.entries;
   insert into ${ns}.rewards(event,location_id,points) select 'quest:first:'||id,1,10 from ${ns}.quests;`);
  const query=async(sql,args=[])=>(await db.query(sql,args)).rows;
  // Boundary checks use explicit UTC instants spanning local midnight and DST.
  for(const [at,allowed] of [['2026-10-30T06:59:59Z',true],['2026-10-30T07:00:00Z',false],['2026-10-31T20:00:00Z',false],['2026-11-01T20:00:00Z',false],['2026-11-02T07:59:59Z',false],['2026-11-02T08:00:00Z',true]]){
   assert.equal((await query(`select ${ns}.showdown_start_day($1) allowed`,[at]))[0].allowed,allowed,at);
  }
  // Private test-only override; no caller-controlled clock exists in production.
  await db.exec(`create or replace function ${ns}.showdown_start_day(p_at timestamptz) returns boolean language sql as $$select false$$;`);
  const submit=async(quest,token='two',id=randomUUID())=>({id,result:await rpc('showdown_submit',token,{quest,request_id:id,confirmed:true,consent:true,photo_path:randomUUID()+'/'+randomUUID()+'.webp'})});
  await assert.rejects(submit(1),/Monday through Thursday/);
  assert.equal((await query(`select count(*)::int n from ${ns}.showdown_submissions`))[0].n,0,'Friday rejection rolls back the entire submission');
  await db.exec(`create or replace function ${ns}.showdown_start_day(p_at timestamptz) returns boolean language sql as $$select true$$;`);
  const ledgerBefore=JSON.stringify(await query(`select * from ${ns}.rewards order by event`));
  const first=await submit(1,'cover');let round=first.result.showdowns.rounds.find(r=>r.quest===1);
  assert.equal(round.state,'voting');assert.equal(round.photos.length,2);assert.equal(first.result.showdowns.submissions.find(s=>s.id===first.id).state,'approved');
  assert.equal(first.result.showdowns.policy.remaining,4);
  assert.equal((await query(`select round(extract(epoch from closes_at-started_at))::int seconds from ${ns}.showdown_rounds where id=$1`,[round.id]))[0].seconds,86400);
  await rpc('showdown_submit','cover',{quest:1,request_id:first.id,confirmed:true,consent:true,photo_path:'duplicate.webp'});
  assert.equal((await query(`select count(*)::int n from ${ns}.showdown_photos where submission=$1`,[first.id]))[0].n,1,'replay is idempotent');
  await assert.rejects(submit(1,'other-manager'),/used its challenge|already challenged/);
  // A second school joins the same comparison; preserves the existing 3-photo rule.
  await db.exec(`create or replace function ${ns}.showdown_start_day(p_at timestamptz) returns boolean language sql as $$select false$$;`);
  await assert.rejects(submit(1,'three'),/Monday through Thursday/);
  assert.equal((await rpc('list')).showdowns.rounds.find(r=>r.id===round.id).generation,1,'Friday cannot restart an existing round');
  await db.exec(`create or replace function ${ns}.showdown_start_day(p_at timestamptz) returns boolean language sql as $$select true$$;`);
  const third=await submit(1,'three');round=third.result.showdowns.rounds.find(r=>r.quest===1);assert.equal(round.photos.length,3);assert.equal(round.generation,2);
  await assert.rejects(submit(1,'four'),/current showdown|full/);
  await assert.rejects(rpc('showdown_remove','two',{id:first.id,revision:2,round_revision:round.revision,confirmed:true}),/Supervisor authorization/);
  await assert.rejects(rpc('showdown_remove',null,{id:first.id,revision:99,round_revision:round.revision,confirmed:true},'admin'),/Submission changed/);
  const removed=await rpc('showdown_remove',null,{id:first.id,revision:2,round_revision:round.revision,confirmed:true},'admin');
  assert.equal(removed.showdowns.rounds.find(r=>r.id===round.id).photos.length,2);
  assert.equal((await rpc('list')).showdowns.policy.remaining,4,'removal does not restore monthly credit');
  await assert.rejects(submit(1),/used its challenge|already challenged/);
  await db.query(`update ${ns}.showdown_rounds set closes_at=clock_timestamp()-interval '1 second' where id=$1`,[round.id]);
  const decision=(await rpc('list')).showdowns.rounds.find(r=>r.id===round.id);
  await rpc('showdown_finalize',null,{round_id:round.id,photo:decision.photos.find(p=>p.role==='defender').id,revision:decision.revision,confirmed:true,request_id:randomUUID()},'admin');
  await assert.rejects(submit(1,'three'),/used its challenge|already challenged/,'a losing challenger cannot try the same prompt again');
  for(const quest of [2,3,4,5])await submit(quest);
  await assert.rejects(submit(6),/all 5 challenges/);
  await assert.rejects(submit(6,'other-manager'),/all 5 challenges/);
  assert.equal((await rpc('list')).showdowns.policy.remaining,0);
  // Cancellation still withdraws, but cannot provide another attempt.
  const list=await rpc('list');const s=list.showdowns.submissions.find(s=>s.quest===2);const r=list.showdowns.rounds.find(r=>r.quest===2);
  await rpc('showdown_cancel','cover',{id:s.id,revision:s.revision,round_revision:r.revision,confirmed:true});
  await assert.rejects(submit(2),/already challenged/);
  assert.equal((await rpc('list')).showdowns.used.includes(2),true);
  assert.equal((await rpc('list')).showdowns.policy.remaining,0);
  // Next month's budget resets; the same prompt still cannot be challenged twice.
  await db.exec(`update ${ns}.showdown_submissions set reviewed_at=date_trunc('month',clock_timestamp() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles'-interval '1 day' where location_id=2;`);
  assert.equal((await rpc('list')).showdowns.policy.remaining,5);
  await assert.rejects(submit(2),/already challenged/);await submit(6);
  // Closing voting does not choose a winner. Supervisor choice remains necessary.
  await db.query(`update ${ns}.showdown_rounds set closes_at=clock_timestamp()-interval '1 second' where quest=6`);
  let closed=(await rpc('list')).showdowns.rounds.find(r=>r.quest===6);assert.equal(closed.state,'decision');assert.equal(closed.winner,null);
  const finalist=closed.photos.find(p=>p.role==='defender');
  await rpc('showdown_finalize',null,{round_id:closed.id,photo:finalist.id,revision:closed.revision,confirmed:true,request_id:randomUUID()},'admin');
  assert.equal(JSON.stringify(await query(`select * from ${ns}.rewards order by event`)),ledgerBefore,'starting, withdrawing and defender wins preserve existing awards');
  const finalSubmission=(await rpc('list')).showdowns.submissions.find(s=>s.quest===6);
  await assert.rejects(rpc('showdown_remove',null,{id:finalSubmission.id,revision:finalSubmission.revision,round_revision:closed.revision,confirmed:true},'admin'),/already ended/);
  assert.equal((await query(`select has_function_privilege('anon','${ns}.start_showdown(uuid,integer,boolean)','EXECUTE') allowed`))[0].allowed,false);
  assert.equal((await query(`select has_function_privilege('authenticated','public.october_games_${env}(text,text,text,jsonb)','EXECUTE') allowed`))[0].allowed,false);
  console.log('PASS '+env+': automatic start, LA weekday/DST boundaries, 24-hour timer, school/month cap, one prompt ever, idempotency, capacity, removal authorization, cancellation, monthly reset, supervisor decision, unchanged awards, private helpers.');
 }
}catch(e){console.error(e.message,e.where||'',e.stack?.split('\n').filter(l=>l.includes('test-showdown-automatic')).join('\n')||'');process.exitCode=1;}finally{await db.close();}
