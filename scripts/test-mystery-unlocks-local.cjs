// Dedicated copy of the synthetic loopback fixture. Never uses cloud URLs or credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync, spawn} = require('node:child_process');
const bin = path.resolve('.security-runtime/postgres/pgsql/bin/psql.exe');
const env = {...process.env, PGPASSWORD: fs.readFileSync('.security-runtime/local-password','utf8').trim()};
const args = ['-X','-qAt','-h','127.0.0.1','-p','55432','-U','postgres','-d','spark_unlock_credit_tests','-v','ON_ERROR_STOP=1'];
function sql(text) {
  try { return execFileSync(bin,args,{input:text,env,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']}).trim(); }
  catch (error) { throw new Error(String(error.stderr || error.message).slice(0,2500)); }
}
function concurrent(text) {
  return new Promise(resolve => {
    const child = spawn(bin,args,{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='', error='';
    child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>error+=chunk);
    child.on('error',error=>resolve({code:1,error:error.message}));
    child.on('close',code=>resolve({code,output,error}));child.stdin.end(text);
  });
}
function fingerprints() {
  const tables=['public.locations','public.employees','public.spark_points','public.meal_counts','october_live.rounds','october_live.entries','october_live.unlocks','october_live.guesses','october_live.school_guesses','october_live.guess_purchases','october_live.quest_claims'];
  return tables.map(table=>sql(`select coalesce(md5(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text)),'empty') from ${table} t;`));
}
async function main() {
  if (process.argv.includes('--recreate')) {
    const setupArgs=args.map(value=>value==='spark_unlock_credit_tests'?'postgres':value);
    // This literal database was created solely for this test; the template is never modified.
    for (const statement of ['DROP DATABASE spark_unlock_credit_tests WITH (FORCE);','CREATE DATABASE spark_unlock_credit_tests TEMPLATE spark_security;']) {
      execFileSync(bin,setupArgs,{input:statement,env,stdio:['pipe','pipe','pipe']});
    }
  }
  assert.equal(sql('select current_database()'), 'spark_unlock_credit_tests');
  if (!sql("select to_regclass('october_live.unlock_credit_events') is not null").includes('t')) {
    sql('INSERT INTO october_live.settings(id) VALUES(true) ON CONFLICT DO NOTHING;INSERT INTO october_dev.settings(id) VALUES(true) ON CONFLICT DO NOTHING;');
    const before = fingerprints();
    // Windows PostgreSQL has no pg_cron binary; verify registration with a local SQL stub.
    sql(`CREATE SCHEMA IF NOT EXISTS cron;
      CREATE TABLE IF NOT EXISTS cron.job(jobname text PRIMARY KEY,schedule text,command text);
      CREATE OR REPLACE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE plpgsql AS $$BEGIN
        INSERT INTO cron.job VALUES($1,$2,$3) ON CONFLICT(jobname) DO UPDATE SET schedule=excluded.schedule,command=excluded.command;RETURN 1;END$$;`);
    const file=fs.readdirSync('supabase/migrations').find(name=>name.endsWith('_mystery_unlock_credit_shop.sql'));
    sql(fs.readFileSync(path.join('supabase/migrations',file),'utf8'));
    assert.deepEqual(fingerprints(),before,'migration preserves school data, points, guesses, Side Quests and round progress');
    console.log('PASS migration preserves all existing synthetic records');
  }
  sql(fs.readFileSync('scripts/test-mystery-unlocks-local.sql','utf8'));
  // Existing regression suites run on this copy and roll back all their fixture writes.
  for (const file of ['test-mystery-paid-guesses-local.sql','test-three-unlocks-local.sql','test-custom-prizes-local.sql']) {
    const test=fs.readFileSync('scripts/'+file,'utf8').replaceAll("'spark_security'", "'spark_unlock_credit_tests'");
    sql(test);console.log('PASS existing '+file);
  }
  const token=sql(`SELECT open_supper_monitoring_session(900001,900001,spark_login(p_role=>'employee',p_employee_id=>900001,p_pin=>'3141'),null);`);
  assert.ok(token);
  sql(`DELETE FROM october_live.unlock_credit_events WHERE location_id=900001;
    DELETE FROM public.spark_points WHERE location_id=900001;
    INSERT INTO public.spark_points(location_id,points,point_type,service_date) VALUES(900001,13,'manual',(now() AT TIME ZONE 'America/Los_Angeles')::date);
    INSERT INTO october_live.schools VALUES(900001,true) ON CONFLICT(location_id) DO UPDATE SET participating=true;`);
  const request = () => require('node:crypto').randomUUID();
  const purchase = id => `SELECT public.october_games_live('buy_unlocks','${token}',null,'{"credits":1,"expected_price":5,"confirmed":true,"request_id":"${id}"}');`;
  const results=await Promise.all(Array.from({length:8},()=>concurrent(purchase(request()))));
  assert.equal(results.filter(r=>r.code===0).length,2,'only affordable purchases commit');
  assert.ok(results.filter(r=>r.code!==0).every(r=>r.error.includes('enough SPARK Points')));
  assert.equal(sql('SELECT sum(points) FROM public.spark_points WHERE location_id=900001'), '3');
  assert.equal(sql('SELECT sum(credits) FROM october_live.unlock_credit_events WHERE location_id=900001'), '2');
  sql("INSERT INTO public.spark_points(location_id,points,point_type,service_date) VALUES(900001,10,'manual',(now() AT TIME ZONE 'America/Los_Angeles')::date)");
  const id=request(), duplicate=await Promise.all(Array.from({length:8},()=>concurrent(purchase(id))));
  assert.ok(duplicate.every(r=>r.code===0),JSON.stringify(duplicate));
  assert.equal(sql(`SELECT count(*) FROM public.spark_points WHERE unique_key='mystery-unlock-purchase:${id}'`),'1');
  assert.equal(sql('SELECT sum(points) FROM public.spark_points WHERE location_id=900001'), '8');
  const daily=await Promise.all(Array.from({length:8},()=>concurrent('SELECT october_live.award_daily_unlocks();')));
  assert.ok(daily.every(result=>result.code===0),JSON.stringify(daily));
  assert.equal(sql("SELECT count(*) FROM october_live.unlock_credit_events WHERE location_id=900001 AND kind='daily' AND service_date=(now() AT TIME ZONE 'America/Los_Angeles')::date"),'1');
  console.log('PASS simultaneous scheduled daily awards produce one school/day credit');
  console.log('PASS real concurrent overspending prevention and duplicate requests across independent PostgreSQL sessions');
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={sql};
