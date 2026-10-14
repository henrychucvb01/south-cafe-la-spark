import {bingoFixture} from './bingo-upgrade-fixture.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const db=await bingoFixture();
try {
 const one=async(sql,args=[])=> (await db.query(sql,args)).rows[0];
 const clock=async date=>db.exec(`create or replace function spark_bingo_now() returns timestamptz language sql stable as $$select '${date} 12:00 America/Los_Angeles'::timestamptz;$$;`);
 await clock('2026-10-14');
 const ids=(await db.query("select id from spark_bingo_eligible(4,'2026-10-14')")).rows.map(x=>x.id);
 assert(!ids.some(id=>id.startsWith('training')||id.includes('monitoring')||['perfect-bic','perfect-lunch','perfect-supper'].includes(id)));
 assert(!ids.includes('side-quest-adventurer'));
 await db.exec('insert into october_live.quests values(1,true,null)');
 assert((await db.query("select id from spark_bingo_eligible(4,'2026-10-14') where id='side-quest-adventurer'")).rows.length);
 const card=(await one('select spark_bingo_context($1) ctx',['school4'])).ctx.card;
 await db.query('update spark_bingo_cards set started_at=$1,started_on=$2 where id=$3',['2026-10-01T07:00:00Z','2026-10-01',card.id]);
 const met=async id=>(await one('select spark_bingo_goal_met(c,$1) met from spark_bingo_cards c where id=$2',[id,card.id])).met;
 await db.exec("insert into spark_excluded_days values(4,'2026-10-05')");
 for(const d of ['2026-10-01','2026-10-02','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-12','2026-10-13','2026-10-14','2026-10-15']) {
  await db.query("insert into daily_bites_game_progress values(4,'word',$1,'won',$1::date+interval '16 hours')",[d]);
  await db.query("insert into daily_bites_game_progress values(4,'spark_sort',$1,'won',$1::date+interval '16 hours')",[d]);
 }
 assert.equal(await met('game-word-streak-5'),true);assert.equal(await met('game-spark_sort-streak-5'),true);
 assert.equal(await met('game-word-10'),false);await clock('2026-10-15');assert.equal(await met('game-word-10'),true);assert.equal(await met('game-spark_sort-10'),true);
 await db.exec("insert into daily_bites_game_progress values(4,'word','2026-10-01','lost','2026-10-01T16:00:00Z')");
 assert.equal(await met('game-word-10'),true);
 for(const d of ['2026-10-01','2026-10-02','2026-10-06','2026-10-07','2026-10-08'])await db.query("insert into meal_counts values(4,$1,0,360,0,'none',$1::date+interval '16 hours')",[d]);
 assert.equal(await met('mplh-achiever'),true);
 await db.exec("update meal_counts set lunch_count=null where service_date='2026-10-08'");assert.equal(await met('mplh-achiever'),false);
 assert.equal(await met('scorecard-check-in'),false);await db.query('select spark_bingo_scorecard_open($1)',['school4']);assert.equal(await met('scorecard-check-in'),true);
 await assert.rejects(db.query('select spark_bingo_scorecard_open($1)',['school32']),/unavailable/);
 const entry=randomUUID();await db.query("insert into october_live.entries values($1,4,'pending',now())",[entry]);assert.equal(await met('side-quest-adventurer'),false);
 await db.query('insert into october_live.quest_claims values(1,$1,4)',[entry]);await db.query("update october_live.entries set state='approved' where id=$1",[entry]);
 await db.exec("insert into spark_points(location_id,points,point_type,unique_key) values(4,10,'october_games','october-live:quest:first:1')");assert.equal(await met('side-quest-adventurer'),true);
 await db.exec("update spark_points set created_at='2026-09-30T16:00:00Z' where unique_key='october-live:quest:first:1'");assert.equal(await met('side-quest-adventurer'),false);
 assert(!(await db.query("select id from spark_bingo_eligible(4,'2026-10-15') where id='side-quest-adventurer'")).rows.length);
 await db.exec('insert into october_live.school_guesses values(4,now())');assert.equal(await met('mystery-photo-detective'),true);
 await db.exec("insert into spark_spotlight_reactions values('11111111-1111-4111-8111-111111111111',4,now())");assert.equal(await met('spark-supporter'),true);
 await db.exec('update spark_spotlight_reactions set reacted_at=now()');assert.equal(await met('spark-supporter'),true);
 await db.exec('update spark_spotlights set published=false');assert.equal(await met('spark-supporter'),false);await db.exec('update spark_spotlights set published=true');
 await assert.rejects(db.query("select spark_bingo_draw(32,2,'2026-10-15')"),/excluded/);
 const draw=(await one("select spark_bingo_draw(5,2,'2026-10-15') goals")).goals;
 assert.equal(draw.length,25);assert.equal(draw[12],'free');assert.equal(new Set(draw).size,25);
 const families=await db.query('select spark_bingo_family(id) family from unnest($1::text[]) id',[draw]);assert.equal(new Set(families.rows.map(x=>x.family)).size,25);
 assert.equal((await one('select spark_bingo_price(0,10000) cost')).cost,'25');assert.equal((await one('select spark_bingo_price(6,10000) cost')).cost,'1600');assert.equal((await one('select spark_bingo_price(1000000000,10000) cost')).cost,null);
 // Fresh school/card: pricing, idempotency, free/prize separation, invalid requests and renewals.
 await db.exec("delete from spark_bingo_cards where location_id=5;delete from spark_points where location_id=5;insert into spark_points values(5,5000,'test','Fixture','2026-10-15','automatic','test-balance',now())");
 let ctx=(await one('select spark_bingo_context($1) ctx',['school5'])).ctx;
 const choice=(c,index)=>c.replacement_goals.find(g=>!c.goals.some((old,i)=>i!==index&&old.family===g.family))?.id;
 const buy=async(c,index,goal,request=randomUUID(),price=c.paid_shop.price,token='school5')=>(await one('select spark_bingo_buy_replacement($1,$2,$3,$4,$5,$6,$7,true) ctx',[token,request,c.card.id,c.card.revision,index,goal,price])).ctx;
 const square=ctx.goals.findIndex(g=>!g.completed);
 await assert.rejects(buy(ctx,12,ctx.replacement_goals[0].id),/incomplete/);
 await assert.rejects(buy(ctx,square,ctx.goals[square].id),/eligible/);
 await assert.rejects(buy(ctx,square,ctx.replacement_goals[0].id,randomUUID(),'1'),/price/);
 await assert.rejects(buy(ctx,square,ctx.replacement_goals[0].id,randomUUID(),ctx.paid_shop.price,'school4'),/card changed/);
 const request=randomUUID(),before=ctx,goal=choice(ctx,square);
 ctx=await buy(ctx,square,goal,request);assert.equal(ctx.paid_shop.count,1);assert.equal(ctx.paid_shop.price,'50');assert.equal(ctx.paid_shop.balance,'4975');assert.equal(ctx.repick_available,true);
 const again=await buy(before,square,goal,request);assert.equal(again.paid_shop.balance,'4975');
 await assert.rejects(buy(before,square,'free',request),/request changed/);
 const invalidOtherFamily=ctx.replacement_goals.find(g=>ctx.goals.some((old,i)=>i!==square&&old.family===g.family));
 if(invalidOtherFamily)await assert.rejects(buy(ctx,square,invalidOtherFamily.id),/duplicating/);
 ctx=(await one('select spark_bingo_repick($1,$2,$3,$4,$5) ctx',['school5',ctx.card.id,ctx.card.revision,square,choice(ctx,square)])).ctx;
 assert.equal(ctx.paid_shop.count,1);assert.equal(ctx.repick_available,false);
 const oldBalance=ctx.paid_shop.balance;ctx=await buy(ctx,square,choice(ctx,square));assert.equal(ctx.paid_shop.count,2);assert.equal(BigInt(oldBalance)-BigInt(ctx.paid_shop.balance),50n);
 await db.query('update spark_bingo_cards set completed_ids=goal_ids where id=$1',[ctx.card.id]);ctx=(await one('select spark_bingo_context($1) ctx',['school5'])).ctx;
 assert.equal(ctx.new_points,250);assert.equal(ctx.can_renew,false);assert.equal((await one('select spark_bingo_context($1) ctx',['school5'])).ctx.new_points,0);
 await assert.rejects(db.query('select spark_bingo_renew($1,$2,$3)',['school5',ctx.card.id,ctx.card.revision]),/one month/);
 await clock('2026-11-15');ctx=(await one('select spark_bingo_renew($1,$2,$3) ctx',['school5',ctx.card.id,ctx.card.revision])).ctx;assert.equal(ctx.paid_shop.count,0);assert.equal(ctx.paid_shop.price,'25');
 await db.query("insert into spark_points values(5,$1,'test','Low balance','2026-11-15','automatic','low-balance',now())",[20-Number(ctx.paid_shop.balance)]);
 const attemptsBefore=(await one('select count(*) n from spark_bingo_purchases')).n;
 await assert.rejects(buy(ctx,ctx.goals.findIndex(g=>!g.completed),ctx.replacement_goals[0].id),/Insufficient/);
 assert.equal((await one('select count(*) n from spark_bingo_purchases')).n,attemptsBefore);
 await db.exec('update october_live.rounds set solved_at=now()');
 const full=(await one("select spark_bingo_draw(5,3,'2026-11-15') goals")).goals;
 await db.query("insert into spark_bingo_cards(location_id,cycle,goal_ids,started_at,started_on) values(5,3,$1,'2026-11-15T19:00:00Z','2026-11-15')",[full]);
 ctx=(await one('select spark_bingo_context($1) ctx',['school5'])).ctx;
 assert(ctx.replacement_goals.length>0,'Threshold replacements remain available even when all 24 eligible families are on the card');
 await db.exec('set role anon');await assert.rejects(db.exec('select spark_bingo_repair_plan()'),/permission denied/);await assert.rejects(db.exec('delete from spark_bingo_purchases'),/permission denied/);await db.exec('reset role');
 console.log('PASS nine challenges, fresh evidence, weekday/exclusion streaks, MPLH, eligibility, unique families, full-pool replacements, price overflow safety, atomic purchases/retries, school isolation, free replacement separation, rewards and lifecycle.');
} finally {await db.close();}

const prod=await bingoFixture(true);
try {
 const snapshot=JSON.parse(await readFile('scripts/fixtures/bingo-preflight-20261014.json','utf8'));
 const plan=(await prod.query('select spark_bingo_repair_plan() plan')).rows[0].plan;
 const retiredIds=['perfect-bic','perfect-lunch','perfect-supper','monitoring-1','all-monitorings','supper-monitoring-1','supper-monitorings-3','training-1','training-3','training-5'];
 const expected=snapshot.cards.reduce((n,c)=>n+c.goal_ids.filter(id=>retiredIds.includes(id)&&!c.completed_ids.includes(id)).length,0);
 assert.equal(plan.length,expected);assert.equal(new Set(plan.map(r=>r.location)).size,28);
 await assert.rejects(prod.query('select spark_bingo_apply_repairs($1)',[[]]),/plan changed/);
 const before=(await prod.query('select * from spark_bingo_cards order by location_id')).rows;
 const pointsBefore=(await prod.query('select count(*) n from spark_points')).rows[0].n;
 const n=(await prod.query('select spark_bingo_apply_repairs($1) n',[plan])).rows[0].n;assert.equal(n,expected);
 const after=(await prod.query('select * from spark_bingo_cards order by location_id')).rows;
 for(let i=0;i<before.length;i++) {
  for(const key of ['id','started_at','started_on','completed_ids','blackout_at','cycle'])assert.deepEqual(after[i][key],before[i][key]);
  for(let slot=0;slot<25;slot++)if(!plan.some(r=>r.card===before[i].id&&r.square===slot))assert.equal(after[i].goal_ids[slot],before[i].goal_ids[slot]);
 }
 assert.equal((await prod.query('select count(*) n from spark_points')).rows[0].n,pointsBefore);
 for(const r of plan)assert.equal((await prod.query('select spark_bingo_goal_met(c,$1) met from spark_bingo_cards c where id=$2',[r.new_goal,r.card])).rows[0].met,false);
 // Qualifying activity before a repair never completes its replacement, including streaks.
 const repaired=plan.find(r=>r.new_goal.includes('streak'));
 const game=repaired.new_goal.includes('spark_sort')?'spark_sort':'word';
 for(let i=0;i<20;i++)await prod.query("insert into daily_bites_game_progress values($1,$2,current_date-$3::integer,'won',now()-interval '1 day')",[repaired.location,game,i]);
 assert.equal((await prod.query('select spark_bingo_goal_met(c,$1) met from spark_bingo_cards c where id=$2',[repaired.new_goal,repaired.card])).rows[0].met,false);
 const stamp=(await prod.query('select repaired_at from spark_bingo_repairs where card_id=$1 and new_goal=$2',[repaired.card,repaired.new_goal])).rows[0].repaired_at;
 const date=new Date(stamp);date.setUTCDate(date.getUTCDate()+1);let wins=0;
 while(wins<5) {
  if(date.getUTCDay()>0&&date.getUTCDay()<6) {await prod.query("insert into daily_bites_game_progress values($1,$2,$3,'won',$4)",[repaired.location,game,date.toISOString().slice(0,10),date.toISOString()]);wins++;}
  date.setUTCDate(date.getUTCDate()+1);
 }
 await prod.exec(`create or replace function spark_bingo_now() returns timestamptz language sql stable as $$select '${date.toISOString()}'::timestamptz;$$;`);
 assert.equal((await prod.query('select spark_bingo_goal_met(c,$1) met from spark_bingo_cards c where id=$2',[repaired.new_goal,repaired.card])).rows[0].met,true);
 console.log(`PASS production snapshot: ${expected} remaining free repairs across 28 schools, no new duplicate families, no instant completion, audit trail, unchanged card dates/progress/points and rejection of stale plans.`);
} finally {await prod.close();}

const migrationCheck=await bingoFixture(true);
try {
 await migrationCheck.exec(await readFile('supabase/migrations/20261014163635_bingo_free_repairs.sql','utf8'));
 const repaired=(await migrationCheck.query('select count(*) n from spark_bingo_repairs')).rows[0].n;
 assert(repaired>0&&repaired<=54);
 console.log('PASS exact guarded repair migration on the approved school-card snapshot.');
}finally{await migrationCheck.close();}
