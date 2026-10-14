const fs=require('fs'),{spawnSync}=require('child_process');
const base=fs.readFileSync('scripts/test-mystery-daily-guesses-local.sql','utf8').replaceAll("'spark_mystery_monthly_release'","'spark_mystery_extension_tests'").replace("answer='synthetic answer',aliases='{}'","answer='Spider Man',aliases=ARRAY['Peter Parker']");
for(const answer of ['SPIDERMAN','  sPiDeR    mAn  ','PETERPARKER']){
 const sql=base.replace("'guess','synthetic answer'",`'guess','${answer}'`);
 const r=spawnSync('../spark/.security-runtime/postgres/pgsql/bin/psql.exe',['-X','-qAt','-h','127.0.0.1','-p','55432','-U','postgres','-d','spark_mystery_extension_tests','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',env:{...process.env,PGPASSWORD:fs.readFileSync('../spark/.security-runtime/local-password','utf8').trim()}});
 if(r.status){console.error(r.stderr);process.exit(r.status);}console.log('PASS case/spacing/alias match:',JSON.stringify(answer),'with award, refund and retry checks');
}
