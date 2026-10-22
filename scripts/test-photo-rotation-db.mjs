import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 const id='00000000-0000-4000-8000-000000000001',path='00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003.webp',next='00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000004.webp';
 // Minimal wrapper fixture: the migration patches the same authorized branch in
 // the production wrappers. No storage, account, or live school data is used.
 for(const env of ['dev','live'])await db.exec(`create schema october_${env};create table october_${env}.entries(id uuid primary key,photo_path text,state text,revision integer,note text,reviewed_at timestamptz);insert into october_${env}.entries values('${id}','${path}','pending',1,'Original note',null);
 create function public.october_games_${env}(p_action text,p_token text default null,p_pin text default null,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='pg_catalog' as $$declare admin boolean:=coalesce(p_pin='admin',false);begin
 IF p_action='showdown_poll' THEN RETURN '{}';END IF;
 return jsonb_build_object('entries',(select jsonb_agg(to_jsonb(e)) from october_${env}.entries e));end$$;revoke all on function public.october_games_${env}(text,text,text,jsonb) from public,anon,authenticated;grant execute on function public.october_games_${env}(text,text,text,jsonb) to service_role;`);
 await db.exec(await readFile('supabase/migrations/20261022152442_supervisor_photo_rotation.sql','utf8'));
 for(const env of ['dev','live']){
  const payload={id,revision:1,angle:90,expected_photo_path:path,photo_path:next};
  const call=(v=payload,pin='admin')=>db.query(`select public.october_games_${env}('photo_rotate',null,$1,$2) result`,[pin,v]);
  await assert.rejects(call(payload,'manager'),/Supervisor/);
  await assert.rejects(call({...payload,angle:45}),/quarter-turn/);
  await assert.rejects(call({...payload,photo_path:'arbitrary'}),/rotated photo/);
  await assert.rejects(call({...payload,expected_photo_path:'stale'}),/Submission changed/);
  await assert.rejects(call({...payload,revision:0}),/Submission changed/);
  const row=(await call()).rows[0].result.entries[0];assert.equal(row.photo_path,next);assert.equal(row.revision,2);assert.equal(row.state,'pending');assert.equal(row.note,'Original note');assert.equal(row.reviewed_at,null);
  await assert.rejects(call(),/Submission changed/);
  await db.exec(`update october_${env}.entries set state='approved'`);
  await assert.rejects(call({...payload,revision:2,expected_photo_path:next}),/Submission changed/);
  const audit=(await db.query(`select * from october_${env}.photo_rotation_audit`)).rows;assert.equal(audit.length,1);assert.equal(audit[0].old_photo,path);assert.equal(audit[0].new_photo,next);
  await db.exec('set role anon');await assert.rejects(db.query(`select * from october_${env}.photo_rotation_audit`),/permission denied/);await db.exec('reset role');
 }
 console.log('PASS: dev/live rotation persists with audit, pending-only, supervisor-only, stale photo/revision rejection, unchanged submission state/notes and private audit access.');
}finally{await db.close();}
