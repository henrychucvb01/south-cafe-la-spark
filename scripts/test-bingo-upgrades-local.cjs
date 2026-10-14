// Dedicated synthetic PostgreSQL copy; never connects to cloud services.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync,spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const bin=path.resolve('.security-runtime/postgres/pgsql/bin/psql.exe');
const env={...process.env,PGPASSWORD:fs.readFileSync('.security-runtime/local-password','utf8').trim()};
const database='spark_bingo_upgrade_tests';
const args=['-X','-qAt','-h','127.0.0.1','-p','55432','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'];
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const choice=(c,index)=>c.replacement_goals.find(g=>!c.goals.some((old,i)=>i!==index&&old.family===g.family))?.id;
function sql(text,db=database){
 try{return execFileSync(bin,args.map(v=>v===database?db:v),{input:text,env,encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();}
 catch(e){throw Error(String(e.stderr||e.message).slice(0,3000));}
}
function concurrent(text){return new Promise(resolve=>{const child=spawn(bin,args,{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',error='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>error+=c);child.on('error',e=>resolve({code:1,error:e.message}));child.on('close',code=>resolve({code,output,error}));child.stdin.end(text);});}
function initialize(){
 if(sql(`select count(*) from pg_database where datname=${quote(database)}`,'postgres')==='0')sql(`CREATE DATABASE ${database} TEMPLATE spark_unlock_credit_tests;`,'postgres');
 assert.equal(sql('select current_database()'),database);
 if(sql("select count(*) from spark_bingo_goals where id='finish-line-3'")==='0') {
  const catalog=JSON.parse(fs.readFileSync('src/dailyBites/bingoCatalog.json','utf8'));
  sql(`INSERT INTO spark_bingo_goals SELECT value->>'id',value FROM jsonb_array_elements(${quote(JSON.stringify(catalog))}::jsonb) ON CONFLICT(id) DO NOTHING;`);
 }
 if(sql("select to_regclass('public.spark_bingo_purchases') is null")==='t') {
  const tables=['locations','employees','spark_points','spark_bingo_cards','meal_counts'];
  const fingerprints=()=>tables.map(t=>sql(`select coalesce(md5(string_agg(to_jsonb(x)::text,',' order by to_jsonb(x)::text)),'empty') from public.${t} x`));
  const before=fingerprints();sql(fs.readFileSync('supabase/migrations/20261014163617_bingo_upgrades.sql','utf8'));assert.deepEqual(fingerprints(),before);
 }
 if(sql("select to_regprocedure('public.spark_bingo_square_choice(public.spark_bingo_cards,integer,text)') is null")==='t')sql(fs.readFileSync('supabase/migrations/20261014165513_bingo_replacement_family_choices.sql','utf8'));
 if(sql("select position('october-live:quest:first:' in pg_get_functiondef('public.spark_bingo_goal_met(public.spark_bingo_cards,text)'::regprocedure))>0")==='f')sql(fs.readFileSync('supabase/migrations/20261014170823_bingo_sidequest_win_time.sql','utf8'));
 sql("UPDATE spark_bingo_goals SET definition=jsonb_set(definition,'{draw_enabled}','false') WHERE definition->>'evidence' IN ('monitoring','perfect_monitoring','training')");
 sql(`UPDATE locations SET active=true,labor_type='secondary',budget_labor_hours=20 WHERE id=900001;
 UPDATE employees SET active=true WHERE id=900001;DELETE FROM spark_private.login_limits;
 INSERT INTO october_live.schools VALUES(900001,true) ON CONFLICT(location_id) DO UPDATE SET participating=true;
 UPDATE october_live.settings SET quests_state='active',mystery_state='active';
 INSERT INTO october_live.quests(id,name,description,enabled,eligible,reward_points) VALUES(9999,'Synthetic Bingo quest','Local test only',true,null,10) ON CONFLICT(id) DO UPDATE SET enabled=true;
 INSERT INTO october_live.rounds(id) SELECT generate_series(1,5) ON CONFLICT(id) DO NOTHING;
 UPDATE october_live.rounds SET solved_at=null,winner=null,photo_path='synthetic-photo.webp';
 INSERT INTO public.spark_spotlights(id,headline,body,category,published,published_at) VALUES('11111111-1111-4111-8111-111111111111','Synthetic Bingo spotlight','Synthetic fixture only','Announcement',true,now()) ON CONFLICT(id) DO UPDATE SET published=true,published_at=now();`);
 sql("INSERT INTO mystery_prizes(id,name,description,icon,kind,reward_type) VALUES('99999999-9999-4999-8999-999999999999','Synthetic Replacement','Local test only','R','manual','bingo_change') ON CONFLICT(id) DO NOTHING");
 return sql("SELECT open_supper_monitoring_session(900001,900001,spark_login(p_role=>'employee',p_employee_id=>900001,p_pin=>'3141'),null)");
}
async function main(){
 const token=initialize();
 sql(`DELETE FROM spark_bingo_purchases WHERE location_id=900001;
 DELETE FROM spark_bingo_repairs WHERE card_id IN(select id from spark_bingo_cards where location_id=900001);
 DELETE FROM spark_bingo_repicks WHERE location_id=900001;
 DELETE FROM spark_bingo_cards WHERE location_id=900001;
 DELETE FROM spark_points WHERE location_id=900001;
 INSERT INTO spark_points(location_id,points,point_type,service_date) VALUES(900001,25,'manual',(now() AT TIME ZONE 'America/Los_Angeles')::date);`);
 let ctx=JSON.parse(sql(`select spark_bingo_context(${quote(token)})`));
 assert(ctx.replacement_goals.length,sql("select jsonb_build_object('families',(select count(distinct spark_bingo_family(id)) from spark_bingo_eligible(900001,current_date)),'now',spark_bingo_now(),'choices',(select jsonb_agg(id) from spark_bingo_eligible(900001,current_date)))"));
 const square=ctx.goals.findIndex(g=>!g.completed),goal=choice(ctx,square);
 const buy=(id=randomUUID())=>`select spark_bingo_buy_replacement(${quote(token)},${quote(id)},${quote(ctx.card.id)},${ctx.card.revision},${square},${quote(goal)},25,true);`;
 const unlock=(id=randomUUID())=>`select october_games_live('buy_unlocks',${quote(token)},null,${quote(JSON.stringify({credits:1,expected_price:5,confirmed:true,request_id:id}))}::jsonb);`;
 const results=await Promise.all([concurrent(buy()),concurrent(unlock())]);
 assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));
 assert(BigInt(sql("select coalesce(sum(points),0) from spark_points where location_id=900001"))>=0n);
 assert.equal(sql("select count(*) from spark_bingo_purchases where location_id=900001"),results[0].code===0?'1':'0');
 // Lost-response retries from independent connections debit exactly once.
 sql("DELETE FROM spark_points WHERE location_id=900001;INSERT INTO spark_points(location_id,points,point_type,service_date) VALUES(900001,100,'manual',(now() AT TIME ZONE 'America/Los_Angeles')::date)");
 ctx=JSON.parse(sql(`select spark_bingo_context(${quote(token)})`));
 const index=ctx.goals.findIndex(g=>!g.completed),newGoal=choice(ctx,index),request=randomUUID(),price=ctx.paid_shop.price;
 const purchase=`select spark_bingo_buy_replacement(${quote(token)},${quote(request)},${quote(ctx.card.id)},${ctx.card.revision},${index},${quote(newGoal)},${price},true);`;
 const duplicates=await Promise.all(Array.from({length:8},()=>concurrent(purchase)));
 assert(duplicates.every(r=>r.code===0),JSON.stringify(duplicates));
 assert.equal(sql(`select count(*) from spark_bingo_purchases where request_id=${quote(request)}`),'1');
 assert.equal(sql(`select sum(points) from spark_points where location_id=900001`),String(100-Number(price)));
 // Use an actual earned replacement prize through the new manager-scoped entry point.
 ctx=JSON.parse(sql(`select spark_bingo_context(${quote(token)})`));
 const prize=sql(`insert into mystery_wins(request_id,location_id,prize_id,prize_name,prize_description,prize_icon,prize_kind,status)
 select ${quote(randomUUID())},900001,id,name,description,icon,kind,'waiting' from mystery_prizes where reward_type='bingo_change' limit 1 returning id;`);
 assert(prize);
 const before=ctx.paid_shop.count,balance=ctx.paid_shop.balance,free=ctx.repick_available;
 ctx=JSON.parse(sql(`select spark_bingo_redeem_replacement(${quote(token)},${prize},${quote(ctx.card.id)},${ctx.card.revision},${index},${quote(choice(ctx,index))})`));
 assert.equal(ctx.paid_shop.count,before);assert.equal(ctx.paid_shop.balance,balance);assert.equal(ctx.repick_available,free);
 assert.equal(sql(`select status from mystery_wins where id=${prize}`),'received');
 console.log('PASS real PostgreSQL: non-destructive migration, concurrent Mystery Photo/Bingo spending, eight concurrent retries charge once, actual replacement-prize redemption, isolated school accounting.');
}
module.exports={sql,concurrent,initialize,quote};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
