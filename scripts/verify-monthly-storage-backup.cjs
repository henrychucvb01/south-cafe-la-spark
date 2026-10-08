// Recovery and compaction tests only: the SQL helper is fixed to loopback PostgreSQL.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),zlib=require('node:zlib');
const {sql:run}=require('./test-security-auth-local.cjs');
const sql=query=>run("set time zone 'UTC';\n"+query);
const dir=path.resolve(process.argv[2]||'../backups/storage-optimization-2026-10-08');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
const quote=s=>"'"+s.replaceAll("'","''")+"'";
sql('create schema if not exists storage_recovery');
for(const table of ['monthly_production_rows','monthly_production_cost_rows']) {
  const expected=manifest[table];assert.equal(expected.rows,expected.exported);
  sql(`drop table if exists storage_recovery.${table};create table storage_recovery.${table}(like public.${table} including all);`);
  const all=[];
  for(let page=0;page<expected.pages;page++) {
    const text=fs.readFileSync(path.join(dir,`${table}-${page}.json`),'utf8');
    all.push(...JSON.parse(text));
    sql(`insert into storage_recovery.${table} overriding system value select * from jsonb_populate_recordset(null::storage_recovery.${table},${quote(text)}::jsonb);`);
  }
  const hash=()=>sql(`select md5(string_agg(md5(to_jsonb(t)::text),'' order by id)) from storage_recovery.${table} t`);
  assert.equal(hash(),expected.hash,'Exact restored data must match the source');
  sql(`begin;set local lock_timeout='5s';set local statement_timeout='60s';set local enable_sort=off;cluster storage_recovery.${table} using ${table}_pkey;analyze storage_recovery.${table};commit;`);
  assert.equal(hash(),expected.hash,'Compaction must preserve every value and ID');
  const file=path.join(dir,`${table}.json.gz`);
  fs.writeFileSync(file,zlib.gzipSync(Buffer.from(JSON.stringify(all)),{level:9}));
  const bytes=fs.readFileSync(file);
  assert.deepEqual(JSON.parse(zlib.gunzipSync(bytes)),all);
  expected.backup_sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  expected.verified=true;
}
fs.writeFileSync(path.join(dir,'verified-manifest.json'),JSON.stringify(manifest,null,2));
console.log('PASS: all calculation records restored exactly; local compaction preserved every record; compressed backups verified.');
