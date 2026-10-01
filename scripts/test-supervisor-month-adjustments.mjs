import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;
 create table spark_points(id bigint generated always as identity primary key,location_id bigint,service_date date,point_type text,source text,points integer,unique_key text unique);
 create table spark_monthly_cup_results(month date,location_id bigint,points bigint,rank integer,tokens integer);
 insert into spark_monthly_cup_results values('2026-09-01',1,100,1,2),('2026-09-01',2,90,2,2),('2026-08-01',1,50,1,2);
 `);
 await db.exec(await readFile('supabase/migrations/202610010003_supervisor_month_adjustments.sql','utf8'));
 const add=(date,points,key,type='supervisor_adjustment')=>db.query("insert into spark_points(location_id,service_date,point_type,source,points,unique_key) values(2,$1,$2,'supervisor',$3,$4)",[date,type,points,key]);
 const rows=async()=> (await db.query("select location_id,points,rank,tokens from spark_monthly_cup_results where month='2026-09-01' order by location_id")).rows;
 await add('2026-09-01',15,'sept');
 assert.deepEqual(await rows(),[{location_id:1,points:100,rank:2,tokens:2},{location_id:2,points:105,rank:1,tokens:2}]);
 await assert.rejects(add('2026-09-01',15,'sept'),/unique constraint/);
 assert.equal((await rows())[1].points,105);
 await add('2026-09-01',-5,'correction');
 assert.deepEqual((await rows()).map(r=>r.rank),[1,1]);
 await add('2026-10-01',100,'october');
 await add('2026-09-01',100,'unrelated','daily_bites_visit');
 assert.equal((await rows())[1].points,100);
 assert.equal((await db.query("select points from spark_monthly_cup_results where month='2026-08-01'")).rows[0].points,50);
 assert.equal((await db.query('select sum(tokens) n from spark_monthly_cup_results')).rows[0].n,6);
 console.log('PASS: selected month only; add/subtract; reranking and ties; duplicate insert rollback; open month and unrelated awards do not rewrite closed Cups; issued tokens preserved.');
} finally {await db.close();}
