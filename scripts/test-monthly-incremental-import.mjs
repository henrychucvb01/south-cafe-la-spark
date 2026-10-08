import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite();try{
await db.exec("create role anon;create role authenticated;create table location_information(id bigint primary key);create function verify_supervisor_pin(text) returns boolean language sql as $$select $1='test'$$;");
const base=await readFile('supabase/migrations/202609090001_monthly_scorecard_imports.sql','utf8');await db.exec(base.slice(0,base.indexOf('create table if not exists public.monthly_site_mappings'))+'commit;');
await db.exec("alter table monthly_production_rows add column wasted numeric;create table monthly_site_mappings(source_site_id text,main_location_id bigint,active boolean);create table monthly_excluded_source_sites(source_site_id text,active boolean);insert into location_information values(1);insert into monthly_site_mappings values('1000101',1,true);");
await db.exec(await readFile('supabase/migrations/202610020002_monthly_incremental_import.sql','utf8'));
// The legacy entry point must be revoked by the scoped migration.
await db.exec("create function import_monthly_scorecard_report(text,text,text,date,text,text,text,text,integer,integer,integer,integer,jsonb,jsonb,jsonb) returns void language sql as $$select$$;");
await db.exec(await readFile('supabase/migrations/20261008201844_monthly_scoped_imports.sql','utf8'));
const save=async(rows,type='cost',pin='test')=>db.query('select merge_monthly_scorecard_rows($1,$2,$3,$4,$5,$6,$7)',[pin,type,'test.csv','checksum',100,0,rows]);
const row=(date,cost=100)=>({source_site_id:'1000101',production_date:date,meal_type:'lunch',food_cost:cost,source_row_number:1});
const rows=[row('2026-08-12'),row('2026-09-01'),row('2026-10-01')];await save(rows);await save(rows);
assert.equal((await db.query('select count(*) n from monthly_import_raw_rows')).rows[0].n,3);
assert.equal((await db.query('select count(*) n from monthly_production_cost_rows')).rows[0].n,3);
await save([row('2026-09-01',125),row('2026-09-02',80)]);
assert.equal((await db.query('select count(*) n from monthly_production_cost_rows')).rows[0].n,4);
assert.equal((await db.query("select food_cost from monthly_production_cost_rows where production_date='2026-09-01'")).rows[0].food_cost,'125');
await save([row('2026-06-01')]);assert.equal((await db.query("select school_year from monthly_import_batches where reporting_month='2026-06-01'")).rows[0].school_year,'2025-26');
const prod=(code,n)=>({...row('2026-09-01'),item_name:code,item_code:code,served:n,meals_served:100,wasted:2});await save([prod('A',30),prod('B',40)],'production');await save([prod('A',35)],'production');
assert.equal((await db.query('select count(*) n from monthly_production_rows')).rows[0].n,2);assert.equal((await db.query("select served from monthly_production_rows where item_code='A'")).rows[0].served,'35');
await assert.rejects(save(rows,'cost','wrong'),/authorization/);
await assert.rejects(save([row('bad')]),/date/);assert.equal((await db.query('select count(*) n from monthly_production_cost_rows')).rows[0].n,5);
// Schools outside the mappings never reach normalized or audit storage.
await db.exec("insert into location_information values(2);insert into monthly_site_mappings values('EEC',2,true),('OFFSITE',1,true),('INACTIVE',2,false);insert into monthly_excluded_source_sites values('BLOCKED',true);insert into monthly_site_mappings values('BLOCKED',1,true);");
const scoped=[...['EEC','OFFSITE','DISTRICT','INACTIVE','BLOCKED'].map(source_site_id=>({...row('2026-09-10'),source_site_id}))];
assert.equal((await save(scoped)).rows[0].merge_monthly_scorecard_rows.saved,2);
assert.equal((await db.query("select count(*) n from monthly_import_raw_rows where row_data->>'source_site_id' in ('DISTRICT','INACTIVE','BLOCKED')")).rows[0].n,0);
const before=(await db.query('select count(*) n from monthly_import_raw_rows')).rows[0].n;
await save([row('2026-09-01',100)]);await save([row('2026-09-01',125)]);
assert.equal((await db.query('select count(*) n from monthly_import_raw_rows')).rows[0].n,before);
await assert.rejects(db.query("select get_monthly_import_scope('wrong')"),/authorization/);
assert.equal((await db.query("select has_function_privilege('anon','import_monthly_scorecard_report(text,text,text,date,text,text,text,text,integer,integer,integer,integer,jsonb,jsonb,jsonb)','execute') permitted")).rows[0].permitted,false);
console.log('PASS: cross-month and school-year routing, gap filling, repeat uploads, newer costs, preserving absent dates and production items, authorization and rollback.');
if(process.argv[2]) {
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);const {default:vm}=await import('node:vm');const babel=require('@babel/core');const exports={};
 vm.runInNewContext(babel.transformSync(await readFile('src/monthlyScorecards/monthlyImportParser.js','utf8'),{plugins:['@babel/plugin-transform-modules-commonjs'],babelrc:false,configFile:false}).code,{exports});
 const parsed=exports.parseMonthlyReport(await readFile(process.argv[2],'utf8'),'cost');
 const seen=new Map(parsed.normalizedRows.map(r=>[`${r.source_site_id}|${r.production_date}|${r.meal_type}`,r]));const realRows=[...seen.values()];
 const prior=(await db.query('select source_site_id,production_date::text,meal_type from monthly_production_cost_rows')).rows;
 const expected=new Set([...prior,...realRows].map(r=>`${r.source_site_id}|${r.production_date}|${r.meal_type}`));
 for(const site of new Set(realRows.map(r=>r.source_site_id)))await db.query('insert into monthly_site_mappings select $1,1,true where not exists(select 1 from monthly_site_mappings where source_site_id=$1)',[site]);
 for(let pass=0;pass<2;pass++)for(let i=0;i<realRows.length;i+=250)await save(realRows.slice(i,i+250));
 assert.equal((await db.query("select count(*) n from monthly_production_cost_rows")).rows[0].n,expected.size);
 console.log(`PASS: actual CSV imported twice locally: ${realRows.length} unique records, no duplicate totals.`);
}
}finally{await db.close();}
