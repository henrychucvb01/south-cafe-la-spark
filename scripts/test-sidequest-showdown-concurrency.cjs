const {setup,sql,base,env}=require('./test-sidequest-showdown-local.cjs');
const {spawn}=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const database='spark_showdown_'+Date.now();
if(!/^spark_showdown_\d+$/.test(database))throw Error('Invalid isolated database name');
let admin;
function action(action,payload,school=4,supervisor=false){return new Promise(resolve=>{
 const args=['-X','-qAt','-h','127.0.0.1','-p','55432','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-v','action='+action,'-v','payload='+JSON.stringify(payload),'-v','token='+(supervisor?'':'show-school-'+school),'-v','pin='+(supervisor?admin:'')];
 const child=spawn(path.join(base,'postgres/pgsql/bin/psql.exe'),args,{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',error='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>error+=x);child.on('error',e=>resolve({ok:false,error:e.message}));child.on('close',code=>resolve({ok:code===0,error,out}));child.stdin.end("select public.october_games_live(:'action',nullif(:'token',''),nullif(:'pin',''),:'payload'::jsonb);");
});}
async function main(){sql(`CREATE DATABASE ${database} TEMPLATE spark_mystery_monthly_release;`,'postgres');try{
 sql(setup+`
 CREATE OR REPLACE FUNCTION public.require_supper_monitoring_session(p_token text) RETURNS public.supper_monitoring_sessions LANGUAGE plpgsql AS $$BEGIN IF p_token!~'^show-school-[1-4](-b)?$' THEN RAISE EXCEPTION 'Invalid fixture session';END IF;RETURN jsonb_populate_record(NULL::public.supper_monitoring_sessions,jsonb_build_object('location_id',900000+substring(p_token FROM 'show-school-([1-4])')::int,'employee_id',CASE WHEN p_token LIKE '%-b' THEN 900002 ELSE 900001 END,'actor_role','manager','expires_at',now()+interval '1 day'));END$$;
 INSERT INTO public.locations(id,location_code,school_name,active) VALUES(900003,'9903','Synthetic Three',true),(900004,'9904','Synthetic Four',true) ON CONFLICT(id) DO UPDATE SET active=true;
 INSERT INTO october_live.schools SELECT n,true FROM generate_series(900001,900004)n ON CONFLICT(location_id) DO UPDATE SET participating=true;
 UPDATE october_live.settings SET quests_state='active' WHERE id;
 INSERT INTO october_live.game_cycles(month,state) VALUES(date_trunc('month',now() AT TIME ZONE 'America/Los_Angeles')::date,'active') ON CONFLICT(month) DO UPDATE SET state='active',closed_at=NULL;
 INSERT INTO october_live.quests(id,name,description,enabled,reward_points,cycle_id) SELECT 990001,'Concurrent fixture','Synthetic only',true,10,id FROM october_live.game_cycles WHERE state='active';
 WITH e AS(INSERT INTO october_live.entries(quest,location_id,photo_path,consent,state) VALUES(990001,900001,gen_random_uuid()||'/'||gen_random_uuid()||'.webp',true,'approved') RETURNING id) INSERT INTO october_live.quest_claims SELECT 990001,id,900001 FROM e;
 INSERT INTO october_live.rewards(event,location_id,points) VALUES('quest:first:990001',900001,10);
 INSERT INTO public.spark_points(location_id,points,point_type,description,service_date,source,unique_key) SELECT 900001,(3-public.spark_bingo_season_balance(900001))::int,'test','Synthetic prior spending',current_date,'test','showdown-concurrency-balance';
 DELETE FROM spark_private.login_limits;
 COMMIT;`,database);
 admin=sql("select public.spark_login(p_role=>'supervisor',p_pin=>'1618');",database);
 const requests=[2,3,4].map(school=>({school,id:randomUUID()}));
 const submitted=await Promise.all(requests.map(x=>action('showdown_submit',{quest:990001,request_id:x.id,confirmed:true,consent:true,photo_path:randomUUID()+'/'+randomUUID()+'.webp'},x.school)));assert(submitted.every(r=>r.ok),JSON.stringify(submitted));
 const approved=await Promise.all(requests.map(x=>action('showdown_approve',{id:x.id,revision:1},4,true)));assert.equal(approved.filter(r=>r.ok).length,2);assert(approved.find(r=>!r.ok).error.includes('full'));
 const r=JSON.parse(sql("select row_to_json(r) from october_live.showdown_rounds r where quest=990001",database));assert.equal(r.generation,2);assert.equal(sql(`select count(*) from october_live.showdown_photos where round_id='${r.id}'`,database),'3');
 const photos=JSON.parse(sql(`select json_agg(p) from october_live.showdown_photos p where round_id='${r.id}' and location_id<>900004`,database));
 const votes=await Promise.all([action('showdown_vote',{round_id:r.id,generation:r.generation,photo:photos[0].id},4),action('showdown_vote',{round_id:r.id,generation:r.generation,photo:photos[1].id},'4-b')]);assert(votes.every(x=>x.ok),JSON.stringify(votes));assert.equal(sql(`select count(*) from october_live.showdown_votes where round_id='${r.id}' and location_id=900004`,database),'1');
 const winner=JSON.parse(sql(`select row_to_json(p) from october_live.showdown_photos p where round_id='${r.id}' and role='challenger' limit 1`,database));
 sql(`update october_live.showdown_rounds set closes_at=clock_timestamp()-interval '1 second' where id='${r.id}';select october_live.expire_showdowns();`,database);
 const revision=Number(sql(`select revision from october_live.showdown_rounds where id='${r.id}'`,database)),payload={round_id:r.id,photo:winner.id,revision,confirmed:true,request_id:randomUUID()};
 const decisions=await Promise.all([action('showdown_finalize',payload,4,true),action('showdown_finalize',payload,4,true)]);assert(decisions.every(x=>x.ok),JSON.stringify(decisions));
 assert.equal(sql(`select count(*) from october_live.rewards where event like 'showdown:${r.id}:%'`,database),'2');assert.equal(sql(`select count(*) from october_live.unlock_credit_events where showdown_round='${r.id}'`,database),'1');assert.equal(sql('select public.spark_bingo_season_balance(900001)',database),'0');assert.equal(sql(`select points_shortfall from october_live.showdown_rounds where id='${r.id}'`,database),'7');
 console.log('PASS true concurrent PostgreSQL sessions: three competing approvals admit exactly two challengers, two managers produce one school vote, duplicate final decisions post one debit/award pair and one credit award, zero-floor remains intact.');
 }finally{sql(`DROP DATABASE ${database} WITH(FORCE);`,'postgres');}}
main().catch(e=>{console.error(e);process.exitCode=1;});
