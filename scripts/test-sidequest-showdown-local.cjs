// Synthetic loopback fixture only. Schema, helpers, schools, votes and ledger writes all roll back.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const base=path.resolve('../spark/.security-runtime'),env={...process.env,PGPASSWORD:fs.readFileSync(path.join(base,'local-password'),'utf8').trim()};
function sql(text,database='spark_mystery_monthly_release'){try{return execFileSync(path.join(base,'postgres/pgsql/bin/psql.exe'),['-X','-qAt','-h','127.0.0.1','-p','55432','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',env,maxBuffer:8*1024*1024}).trim();}catch(e){throw Error(String(e.stderr||e.message).slice(-4000));}}
const migrations=[];
if(sql("select exists(select 1 from information_schema.columns where table_schema='october_live' and table_name='rounds' and column_name='question')")!=='t')migrations.push('20261014173210_mystery_collection_extension.sql','20261014210949_mystery_questions_and_answer_matching.sql','20261014211457_active_mystery_question_edit.sql');
if(sql("select to_regclass('october_live.game_cycles') is not null")!=='t')migrations.push('20261014171038_spark_games_planning.sql','20261014171054_spark_games_automatic_cycles.sql');
if(sql("select to_regclass('october_live.mystery_weeks') is not null")!=='t')migrations.push('20261018044922_mystery_weekly_schedule_pricing.sql');
migrations.push('20261020153852_sidequest_showdown.sql');
const cron=sql("select to_regnamespace('cron') is not null")==='t'?'':`CREATE SCHEMA cron;CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$SELECT 1::bigint$$;`;
const balance=sql("select to_regprocedure('public.spark_bingo_season_balance(bigint)') is not null")==='t'?'':`CREATE FUNCTION public.spark_bingo_season_balance(bigint) RETURNS numeric LANGUAGE sql STABLE SET search_path=pg_catalog AS $$SELECT coalesce(sum(points::numeric),0) FROM public.spark_points WHERE location_id=$1 AND service_date>=make_date(extract(year FROM current_date)::int-CASE WHEN extract(month FROM current_date)<8 THEN 1 ELSE 0 END,8,1) AND service_date<=current_date$$;`;
const setup='BEGIN;\n'+cron+balance+migrations.map(f=>fs.readFileSync('supabase/migrations/'+f,'utf8').replace(/^BEGIN;/i,'').replace(/COMMIT;\s*$/,'').replace(/CREATE EXTENSION IF NOT EXISTS pg_cron(?: WITH SCHEMA pg_catalog)?;/gi,'-- Local fixture uses the scheduler stub above.')).join('\n');
module.exports={setup,sql,base,env};
if(require.main===module)console.log(sql(setup+fs.readFileSync('scripts/test-sidequest-showdown-local.sql','utf8')+'\nROLLBACK;'));
