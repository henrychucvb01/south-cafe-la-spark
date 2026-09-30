import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const db=new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table locations(id bigint primary key,school_name text,location_code text,labor_type text,budget_labor_hours numeric,active boolean);
insert into locations values(4,'Test School','1234','secondary',20,true),(5,'Willenberg','5678','special',20,true);
create table finish_line_checks(id bigint primary key,location_id bigint,service_date date,status text,submitted_at timestamptz);
create table finish_line_items(finish_line_check_id bigint,item_key text,answer text);
create table spark_excluded_days(location_id bigint,service_date date);
create table meal_counts(location_id bigint,service_date date,breakfast_count numeric,lunch_count numeric,supper_count numeric,supper_status text,created_at timestamptz);
create table labor_hours(location_id bigint,service_date date,additional_worker_hours numeric,manager_overtime_hours numeric);
create table spark_points(location_id bigint,points integer,point_type text,description text,service_date date,source text,unique_key text unique,created_at timestamptz default now());
create table daily_bites_game_progress(location_id bigint,game_type text,service_date date,status text,completed_at timestamptz);
create table ar_training_attempts(location_id bigint,service_date date,is_correct boolean,points_awarded integer,answered_at timestamptz);
create table monitoring_records(location_id bigint,monitoring_type text,monitoring_number integer,school_year text,monitoring_date date,updated_at timestamptz,status text,locked boolean,monitor_role text,perfect_monitoring_override boolean,had_correction_requested boolean);
create table supper_monitoring_sessions(location_id bigint,actor_role text);
create function require_supper_monitoring_session(token text) returns supper_monitoring_sessions language plpgsql as $$
begin if token not in ('school4','school5') or token is null then raise exception 'Invalid session'; end if; return (substring(token from 7)::bigint,'manager')::supper_monitoring_sessions;end;$$;
`);

try {
 for(const file of ['202609250008_finish_line_bonus_reconciliation.sql','202609250009_bingo_card_cycles.sql','202609250010_mystery_pull.sql','202609260001_mystery_pull_prize_bundles.sql','202609300001_digital_pull_rewards.sql']) await db.exec((await readFile('supabase/migrations/'+file,'utf8')).replace(/-- CRON-BEGIN[\s\S]*?-- CRON-END/,''));
 const rpc=async(name,args=[])=>(await db.query(`select mystery_${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
 const admin=(await rpc('open',['0928'])).token;
 const manager=(await rpc('choose_school',[(await rpc('open',['1234'])).token,'1234'])).token;
 const other=(await rpc('choose_school',[(await rpc('open',['1234'])).token,'5678'])).token;
 const change=payload=>rpc('admin',[admin,randomUUID(),payload]);
 let ctx=await rpc('context',[admin]);assert.equal(ctx.prizes.length,7);assert(!ctx.prizes.some(p=>p.retired));
 await change({action:'tokens',location_id:4,delta:30,revision:1});
 const win=async type=>{await db.query('update mystery_prizes set active=(reward_type=$1) where not retired',[type]);const c=await rpc('context',[manager]);return rpc('pull',[manager,randomUUID(),c.revision]);};
 const points=await win('points_pull');assert.equal(points.win.points_awarded,5);assert.equal(points.tokens,30);assert.equal(points.win.status,'received');
 const replay=await rpc('pull',[manager,points.win.request_id,points.revision-1]);assert.deepEqual(replay,points);assert.equal((await db.query("select sum(points) total from spark_points where point_type='mystery_pull_prize'")).rows[0].total,5);
 const candy=(await rpc('context',[admin])).prizes.find(p=>p.reward_type==='candy_bar');await change({action:'stock',id:candy.id,revision:candy.revision,delta:1});
 const candyWin=await win('candy_bar');assert.equal(candyWin.win.status,'waiting');await change({action:'fulfill',id:candyWin.win.id});assert.equal((await rpc('pull_result',[manager,candyWin.win.request_id])).status,'received');
 const double=await win('double_bites');await assert.rejects(change({action:'fulfill',id:double.win.id}),/manager redeems/);await assert.rejects(rpc('redeem',[other,double.win.id,{}]),/not found/);
 const r=await rpc('redeem',[manager,double.win.id,{}]);assert(r.ends_at>r.starts_at);assert.deepEqual(await rpc('redeem',[manager,double.win.id,{}]),r);
 await db.exec(`insert into spark_points(location_id,points,point_type,service_date,unique_key) values(4,3,'daily_bites_word_game',(now() at time zone 'America/Los_Angeles')::date,'double-test'),(5,3,'daily_bites_word_game',(now() at time zone 'America/Los_Angeles')::date,'other-test'),(4,5,'finish_line',(now() at time zone 'America/Los_Angeles')::date,'non-bites');`);
 assert.equal((await db.query("select points from spark_points where unique_key='double-test'")).rows[0].points,6);assert.equal((await db.query("select points from spark_points where unique_key='other-test'")).rows[0].points,3);assert.equal((await db.query("select points from spark_points where unique_key='non-bites'")).rows[0].points,5);
 const second=await win('double_bites');assert.equal(second.win.status,'received');await db.exec("insert into spark_points(location_id,points,point_type,service_date,unique_key) values(4,3,'daily_bites_word_game',(now() at time zone 'America/Los_Angeles')::date,'double-no-stack')");assert.equal((await db.query("select points from spark_points where unique_key='double-no-stack'")).rows[0].points,6);
 await db.exec("insert into finish_line_checks values(99,4,'2026-09-04','complete','2026-09-05T20:00:00Z');insert into spark_points(location_id,points,point_type,service_date,unique_key) values(4,2,'finish_line_late','2026-09-04','late-test');");
 const makeup=await win('late_checklist');assert((await rpc('redemption_options',[manager,makeup.win.id])).dates.includes('2026-09-04'));await rpc('redeem',[manager,makeup.win.id,{date:'2026-09-04'}]);assert.equal((await db.query("select points from spark_points where point_type='mystery_checklist_makeup'")).rows[0].points,3);
 await db.exec("insert into spark_points(location_id,points,point_type,service_date,unique_key) values(4,2,'finish_line_late','2026-09-04','late-retry');");assert.equal((await db.query("select count(*) n from spark_points where unique_key='late-retry'")).rows[0].n,0);
 const shield=await win('streak_shield');await assert.rejects(rpc('redeem',[manager,shield.win.id,{date:'2026-09-06'}]),/qualifying/);await rpc('redeem',[manager,shield.win.id,{date:'2026-09-03'}]);assert.equal((await db.query("select spark_bonus_eligible(4,'2026-09-03','2026-09-04') yes")).rows[0].yes,true);
 const free=await win('bingo_free');let b=(await rpc('redemption_options',[manager,free.win.id])).bingo;let square=b.goals.findIndex((g,i)=>!g.completed&&i!==12);await rpc('redeem',[manager,free.win.id,{card:b.card.id,revision:b.card.revision,square}]);assert((await db.query('select completed_ids from spark_bingo_cards where id=$1',[b.card.id])).rows[0].completed_ids.includes(b.goals[square].id));
 const repick=await win('bingo_change');b=(await rpc('redemption_options',[manager,repick.win.id])).bingo;square=b.goals.findIndex((g,i)=>!g.completed&&i!==12);const goal=b.replacement_goals[0].id;await rpc('redeem',[manager,repick.win.id,{card:b.card.id,revision:b.card.revision,square,goal}]);assert.equal((await db.query('select goal_ids from spark_bingo_cards where id=$1',[b.card.id])).rows[0].goal_ids[square],goal);assert.equal((await db.query('select count(*) n from spark_bingo_repicks')).rows[0].n,0);
 await assert.rejects(change({action:'prize',name:'Old gift',kind:'manual'}),/seven current/);
 await db.exec("update mystery_redemptions set ends_at=now()-interval '1 second' where reward_type='double_bites';insert into spark_points(location_id,points,point_type,service_date,unique_key) values(4,3,'daily_bites_word_game',(now() at time zone 'America/Los_Angeles')::date,'expired-test')");assert.equal((await db.query("select points from spark_points where unique_key='expired-test'")).rows[0].points,3);
 await db.exec('set role anon');await assert.rejects(db.exec('select * from mystery_redemptions'),/permission denied/);await assert.rejects(db.query('select mystery_admin_before_rewards($1,$2,$3)',[admin,randomUUID(),{action:'prize',name:'Bypass'}]),/permission denied/);
 console.log('PASS: seven-prize pool, points/token atomic retry, Candy Bar delivery, school isolation, one-time redemption, one-month doubling, late checklist, shield, Bingo rewards and protected admin functions.');
} finally {await db.close();}
