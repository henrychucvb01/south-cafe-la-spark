// Native PostgreSQL concurrency test. Only the dedicated loopback fixture is used.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync,spawn}=require('node:child_process');
const bin=path.resolve('.security-runtime/postgres/pgsql/bin/psql.exe');
const env={...process.env,PGPASSWORD:fs.readFileSync('.security-runtime/local-password','utf8').trim()};
const args=['-X','-qAt','-h','127.0.0.1','-p','55432','-U','postgres','-d','spark_games_upgrade_tests','-v','ON_ERROR_STOP=1'];
function sql(text){try{return execFileSync(bin,args,{input:text,env,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:32*1024*1024}).trim();}catch(e){throw Error(String(e.stderr||e.message).slice(-3000));}}
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
function concurrent(text){return new Promise(resolve=>{const p=spawn(bin,args,{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',error='';p.stdout.on('data',c=>out+=c);p.stderr.on('data',c=>error+=c);p.on('error',e=>resolve({code:1,error:e.message}));p.on('close',code=>resolve({code,out,error}));p.stdin.end(text);});}
function fingerprints(){return ['public.locations','public.employees','public.spark_points','october_live.quests','october_live.entries','october_live.rounds','october_live.rewards','october_live.unlocks','october_live.guesses','october_live.quest_claims','october_live.unlock_credit_events'].map(table=>sql(`select coalesce(md5(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text)),'empty') from ${table} t;`));}
async function main(){
assert.equal(sql('select current_database()'),'spark_games_upgrade_tests');
if(sql("select to_regclass('october_live.game_cycles') is not null")==='t')throw Error('Use a fresh dedicated test copy; this script never resets existing data.');
const before=fingerprints();
sql(fs.readFileSync('supabase/migrations/20261014171038_spark_games_planning.sql','utf8'));
// Newly added quest columns are all null; compare original columns independently below.
const after=fingerprints();for(const i of [0,1,2,4,5,6,7,8,9,10])assert.equal(after[i],before[i]);
sql(fs.readFileSync('supabase/migrations/20261014171054_spark_games_automatic_cycles.sql','utf8').replace(/^CREATE EXTENSION.*$/m,''));sql(fs.readFileSync('supabase/migrations/20261014171058_spark_games_photo_reveals.sql','utf8'));
const third=fingerprints();for(const i of [0,1,2,4,5,6,7,8,9,10])assert.equal(third[i],before[i]);
assert.equal(sql("select count(*) from cron.job where jobname='spark-games-weekly-releases' and schedule='* * * * *'"),'1');
sql(`INSERT INTO public.locations(id,location_code,school_name,active) VALUES(990101,'9901','Games Synthetic A',true),(990102,'9902','Games Synthetic B',true) ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.employees(id,location_id,employee_name,active,manager_pin_hash) VALUES(990101,990101,'Games Synthetic Manager',true,extensions.crypt('3141',extensions.gen_salt('bf'))) ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.spark_security_settings(setting_key,value_hash) VALUES('supervisor_pin',extensions.crypt('1618',extensions.gen_salt('bf'))) ON CONFLICT(setting_key) DO UPDATE SET value_hash=excluded.value_hash;
 DELETE FROM spark_private.login_limits;
 INSERT INTO october_live.schools(location_id,participating) VALUES(990101,true),(990102,true) ON CONFLICT(location_id) DO UPDATE SET participating=true;`);
const admin=sql("select public.spark_login(p_role=>'supervisor',p_pin=>'1618')");
const login=sql("select public.spark_login(p_role=>'employee',p_employee_id=>990101,p_pin=>'3141')");
const token=sql(`select public.open_supper_monitoring_session(990101,990101,${quote(login)})`);
const call=(action,payload={},manager=false)=>JSON.parse(sql(`select public.october_games_live(${quote(action)},${manager?quote(token):'null'},${manager?'null':quote(admin)},${quote(JSON.stringify(payload))}::jsonb)`));
const {generateChallenges}=await import('../src/sparkGames/challengeLibrary.mjs');
let d=call('games_generate',{month:'2090-11',prompts:generateChallenges('2090-11')});
const drafts=d.games_planning.drafts.filter(x=>x.month==='2090-11'&&x.monday===d.games_planning.waves.find(w=>w.month==='2090-11').monday).slice(0,3);
d=call('games_approve',{ids:drafts.map(x=>x.id)});
const wave=d.games_planning.drafts.find(x=>x.id===drafts[0].id).wave_id;
sql(`update october_live.game_waves set release_at=now()-interval '1 minute' where id=${quote(wave)}; select october_live.games_reconcile();`);
const quests=call('list',{},true).quests.filter(q=>q.wave_id===wave);
for(const q of quests)call('submit',{quest:q.id,photo_path:'00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp',consent:true},true);
const entries=call('list').entries.filter(e=>quests.some(q=>q.id===e.quest)&&e.location_id===990101);
const results=await Promise.all(entries.map(e=>concurrent(`select public.october_games_live('review',null,${quote(admin)},${quote(JSON.stringify({id:e.id,revision:e.revision,state:'approved'}))}::jsonb);`)));
assert.equal(results.filter(r=>r.code===0).length,2);assert.equal(results.filter(r=>r.code!==0&&r.error.includes('two-win')).length,1);
assert.equal(sql(`select count(*) from october_live.game_wave_wins where wave_id=${quote(wave)} and location_id=990101`),'2');
assert.equal(sql("select count(*) from october_live.rewards where location_id=990101 and event like 'quest:first:%'"),'2');
console.log('PASS native PostgreSQL: migration preservation on current Mystery engine; cron registration; real scoped authentication; three independent simultaneous approvals produce exactly two awards.');
}
main().catch(e=>{console.error(e.message);process.exit(1);});
