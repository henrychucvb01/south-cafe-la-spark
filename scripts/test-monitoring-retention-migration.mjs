import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../api/supper-monitoring.js';
import {makeFixture,signFixture} from './supper-monitoring-fixture.mjs';
import {slotProgress} from '../src/supperMonitoring/workflow.js';
const db=new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table locations(id bigint primary key,active boolean,school_name text,location_code text);
 create table employees(id bigint primary key,location_id bigint,employee_name text,active boolean);
 insert into locations values(1,true,'Test School','1001'),(2,true,'Other School','1002'),(3,false,'Inactive','1003');
 insert into employees values(11,1,'Monitor One',true),(12,1,'Colleague',true),(22,2,'Monitor Two',true);
 create function verify_manager_pin(text,text) returns boolean language sql as $$select $2='1234'$$;
 create function verify_covering_pin(text) returns boolean language sql as $$select $1='5678'$$;
 create function verify_supervisor_pin(text) returns boolean language sql as $$select $1='9999'$$;`);
 for(const file of ['202609230001_supper_monitoring.sql','202609230002_supper_monitoring_reports.sql','202609240001_supper_monitoring_review.sql','202609240002_supper_pdf_review_workspace.sql','202609240003_monitoring_types_sites_restart.sql','202609240004_monitoring_current_records.sql']) {
  if(file.startsWith('202609240001')) await db.exec(`
   insert into supper_monitorings(location_id,created_by_employee_id,created_by_name,school_year,monitoring_date,status,submitted_at,template_version,pdf_storage_path,pdf_sha256)
   select 2,22,'Legacy Manager','2025-26','2026-06-01','completed',now(),'lausd-supper-2022-09-08','legacy','test' from generate_series(1,3);
   insert into supper_monitoring_documents(monitoring_id,pdf_bytes,sha256) select id,convert_to(repeat('old PDF',30),'UTF8'),'test' from supper_monitorings;
  `);
  if(file.startsWith('202609240004')) {
   await db.exec(`create table unrelated_application_audit(message text);insert into unrelated_application_audit values('Keep me');
    update supper_monitorings set status='accepted',locked=true where monitoring_slot='manager_1';
    update supper_monitorings set status='completed',locked=true where monitoring_slot='manager_2';
    update supper_monitorings set status='deleted' where monitoring_slot is null;
    insert into supper_monitoring_document_versions(monitoring_id,version,pdf_bytes,sha256) select id,2,convert_to(repeat('current PDF',30),'UTF8'),'current' from supper_monitorings where status='accepted';
    update supper_monitoring_documents set pdf_bytes=convert_to(repeat('current PDF',30),'UTF8'),sha256='current' where monitoring_id in(select id from supper_monitorings where status='accepted');
    update supper_monitorings set document_version=2,pdf_sha256='current' where status='accepted';
    insert into supper_pdf_reviews(monitoring_id,document_version,record_revision,page_count,annotations,comments,actor_name)
     select id,1,1,2,'[]','old markup','Supervisor' from supper_monitorings where status='accepted';
    insert into supper_pdf_reviews(monitoring_id,document_version,record_revision,page_count,annotations,comments,actor_name)
     select id,2,2,2,'[]','current markup','Supervisor' from supper_monitorings where status='accepted';`);
  }
  await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 }
 const records=(await db.query('select * from monitoring_records')).rows;
 assert.equal(records.length,2);assert.ok(records.every(r=>r.locked && r.school_year==='2025-26'));
 assert.deepEqual(records.map(r=>r.status).sort(),['accepted','completed']);
 const docs=(await db.query("select encode(pdf_bytes,'base64') as bytes,sha256 from monitoring_documents")).rows;
 assert.equal(docs.length,2);assert.equal(Buffer.from(docs.find(d=>d.sha256==='current').bytes,'base64').toString(),'current PDF'.repeat(30));
 const reviews=(await db.query('select * from monitoring_pdf_review')).rows;
 assert.equal(reviews.length,1);assert.equal(reviews[0].comments,'current markup');
 for(const table of ['supper_monitoring_events','supper_monitoring_document_versions'])assert.equal((await db.query('select to_regclass($1) as value',[table])).rows[0].value,null);
 assert.equal((await db.query('select * from unrelated_application_audit')).rows[0].message,'Keep me');
 console.log('PASS: migration keeps historical accepted/completed records, exact current PDF bytes and latest current markup; drops obsolete copies and deleted records; unrelated audit untouched.');
} finally {await db.close();}
