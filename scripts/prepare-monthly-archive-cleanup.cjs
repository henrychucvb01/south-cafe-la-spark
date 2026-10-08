// Offline preparation only. Restores the backup into a loopback-only recovery table;
// emits guarded SQL for separate review, never connects to the hosted database.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {sql: localSql} = require('./test-security-auth-local.cjs');
const sql = statement => localSql("set time zone 'UTC';\n" + statement);
const dir = path.resolve(process.argv[2] || '.security-runtime/monthly-backup');
const before = JSON.parse(fs.readFileSync(path.join(dir,'before.json')));
const protectedIds = new Set(JSON.parse(fs.readFileSync(path.join(dir,'protected.json'))).map(r=>r.id));
const files = fs.readdirSync(dir).filter(n=>/^raw-\d+\.json$/.test(n)).sort();
const rows = files.flatMap(name=>JSON.parse(fs.readFileSync(path.join(dir,name))));
assert.equal(rows.length,before.raw_count,'Backup must be complete');
assert.equal(new Set(rows.map(r=>r.id)).size,rows.length,'Duplicate backup page');
const quote = text => "'"+text.replaceAll("'","''")+"'";
sql('drop table if exists public.monthly_recovery_check; create table public.monthly_recovery_check(id bigint primary key,batch_id uuid,source_row_number integer,row_data jsonb,created_at timestamptz);');
for(const file of files) sql(`insert into monthly_recovery_check select * from jsonb_populate_recordset(null::monthly_recovery_check,${quote(fs.readFileSync(path.join(dir,file),'utf8'))}::jsonb);`);
const restoredHash = sql("select md5(string_agg(md5(to_jsonb(r)::text),'' order by id)) from monthly_recovery_check r");
assert.equal(restoredHash,before.raw_hash,'Restored database must exactly match live backup fingerprint');
const sites = new Set(before.mappings.map(m=>m.source_site_id)); // Preserve inactive historical mappings too.
const groups = new Map();
for(const row of rows.filter(r=>Array.isArray(r.row_data))) {
  if(!groups.has(row.batch_id)) groups.set(row.batch_id,[]);
  groups.get(row.batch_id).push(row);
}
const blocks=[];
for(const group of groups.values()) {
  group.sort((a,b)=>a.source_row_number-b.source_row_number);
  let block=null;
  for(const row of group) {
    const pos=row.row_data.findIndex(v=>String(v).trim()==='Site:');
    const site=pos<0?null:row.row_data.slice(pos+1).find(v=>String(v).trim());
    const match=site && String(site).trim().match(/^\((\d+)\)/);
    if(pos>=0 && !match) block=null; // Ambiguous headers are retained, never guessed.
    if(match) { block={site:match[1],rows:[]};blocks.push(block); }
    if(block) block.rows.push(row);
  }
}
// Referenced evidence always wins when selecting the retained copy.
blocks.sort((a,b)=>Number(b.rows.some(r=>protectedIds.has(r.id)))-Number(a.rows.some(r=>protectedIds.has(r.id))));
const seen=new Set(), remove=[], reasons={unrelated:0,duplicate:0};
for(const block of blocks) {
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify(block.rows.map(r=>r.row_data))).digest('hex');
  const protectedBlock=block.rows.some(r=>protectedIds.has(r.id));
  const reason=!sites.has(block.site)?'unrelated':seen.has(fingerprint)?'duplicate':null;
  if(reason && !protectedBlock) {remove.push(...block.rows.map(r=>r.id));reasons[reason]+=block.rows.length;}
  else seen.add(fingerprint);
}
remove.sort((a,b)=>a-b);
const ranges=[];
for(const id of remove) {const last=ranges.at(-1);if(last&&last[1]+1===id)last[1]=id;else ranges.push([id,id]);}
assert.ok(remove.length,'No verified cleanup candidates');
const rawProjection='jsonb_build_object(\'id\',r.id,\'batch_id\',r.batch_id,\'source_row_number\',r.source_row_number,\'row_data\',r.row_data,\'created_at\',r.created_at)';
const cleanup=`begin;
set local time zone 'UTC';
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(hashtextextended('monthly-scorecard-merge-production',0));
select pg_advisory_xact_lock(hashtextextended('monthly-scorecard-merge-cost',0));
do $cleanup$
declare n bigint;
begin
 if (select md5(string_agg(md5(${rawProjection}::text),'' order by id)) from monthly_import_raw_rows r) is distinct from '${before.raw_hash}' then raise exception 'Archive changed since verified backup'; end if;
 if (select md5(string_agg(md5(to_jsonb(p)::text),'' order by id)) from monthly_production_rows p) is distinct from '${before.production_hash}' or
    (select md5(string_agg(md5(to_jsonb(p)::text),'' order by id)) from monthly_production_cost_rows p) is distinct from '${before.cost_hash}' then raise exception 'Report data changed since reconciliation'; end if;
 delete from monthly_import_raw_rows r where jsonb_typeof(row_data)='array'
 and (${ranges.map(([a,b])=>a===b?`r.id=${a}`:`r.id between ${a} and ${b}`).join(' or ')})
 and not exists(select 1 from monthly_production_rows p where p.batch_id=r.batch_id and p.source_row_number=r.source_row_number)
 and not exists(select 1 from monthly_production_cost_rows p where p.batch_id=r.batch_id and p.source_row_number=r.source_row_number);
 get diagnostics n=row_count;
 if n<>${remove.length} then raise exception 'Candidate count changed'; end if;
 if (select md5(string_agg(md5(to_jsonb(p)::text),'' order by id)) from monthly_production_rows p) is distinct from '${before.production_hash}' or
    (select md5(string_agg(md5(to_jsonb(p)::text),'' order by id)) from monthly_production_cost_rows p) is distinct from '${before.cost_hash}' then raise exception 'Report reconciliation failed'; end if;
end $cleanup$;
commit;`;
fs.writeFileSync(path.join(dir,'cleanup.sql'),cleanup);
const compressed=zlib.gzipSync(Buffer.from(JSON.stringify(rows)),{level:9});
fs.writeFileSync(path.join(dir,'raw-archive.json.gz'),compressed);
assert.deepEqual(JSON.parse(zlib.gunzipSync(compressed)),rows);
// Exercise deletion and recovery on the isolated copy, then verify every row again.
assert.ok(remove.every(id=>!protectedIds.has(id)));
sql(`delete from monthly_recovery_check r where (${ranges.map(([a,b])=>a===b?`r.id=${a}`:`r.id between ${a} and ${b}`).join(' or ')});`);
assert.equal(Number(sql('select count(*) from monthly_recovery_check')),rows.length-remove.length);
for(const file of files) sql(`insert into monthly_recovery_check select * from jsonb_populate_recordset(null::monthly_recovery_check,${quote(fs.readFileSync(path.join(dir,file),'utf8'))}::jsonb) on conflict(id) do nothing;`);
assert.equal(sql("select md5(string_agg(md5(to_jsonb(r)::text),'' order by id)) from monthly_recovery_check r"),before.raw_hash);
const manifest={rows:rows.length,restoredHash,sha256:crypto.createHash('sha256').update(compressed).digest('hex'),backupBytes:compressed.length,removeCount:remove.length,reasons};
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest));
