import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table public.locations(id bigint primary key);insert into locations values(1),(2);
 create table supper_monitoring_sessions(location_id bigint,actor_role text);
 create function verify_supervisor_pin(text) returns boolean language sql as $$select $1='admin-test'$$;
 create function require_supper_monitoring_session(text) returns supper_monitoring_sessions language plpgsql as $$begin
 if $1='school1' then return (1,'manager')::supper_monitoring_sessions;elsif $1='school2' then return (2,'manager')::supper_monitoring_sessions;else raise exception 'Invalid session';end if;end$$;
 create table spark_points(points integer);`);
 await db.exec(await readFile('supabase/migrations/202610010004_spotlight.sql','utf8'));
 const manage=async(action,id=null,revision=null,payload={},pin='admin-test')=>(await db.query('select spotlight_manage($1,$2,$3,$4,$5) r',[pin,action,id,revision,payload])).rows[0].r;
 const list=async(token='school1',pin=null,limit=20,offset=0)=>(await db.query('select spotlight_list($1,$2,$3,$4) r',[token,pin,offset,limit])).rows[0].r;
 const react=async(id,reaction,token='school1')=>(await db.query('select spotlight_react($1,$2,$3) r',[token,id,reaction])).rows[0].r;
 const payload={headline:'September Cup',body:'Congratulations!',category:'SPARK Cup',published:false};
 await assert.rejects(manage('save',null,null,payload,'wrong'),/Supervisor/);
 let {post}=await manage('save',null,null,payload);assert.equal((await list()).length,0);assert.equal((await list(null,'admin-test')).length,1);
 await assert.rejects(react(post.id,'love'),/no longer published/);
 ({post}=await manage('publish',post.id,post.revision));assert.equal((await list()).length,1);
 await react(post.id,'love');await react(post.id,'awesome');await react(post.id,'awesome');await react(post.id,'awesome','school2');
 let visible=(await list())[0];assert.deepEqual(visible.counts,{awesome:2});assert.equal(visible.mine,'awesome');
 await assert.rejects(react(post.id,'fake'),/check constraint/);await assert.rejects(react(post.id,'love','forged'),/Invalid session/);
 const photo='00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.jpg';
 ({post}=await manage('save',post.id,post.revision,{...payload,published:true,headline:'Winner updated',photo_path:photo}));assert.equal(post.photo_path,photo);
 await assert.rejects(manage('save',post.id,1,payload),/changed/);
 const removed=await manage('save',post.id,post.revision,{...payload,published:true,photo_path:null});assert.equal(removed.old_photo,photo);post=removed.post;
 ({post}=await manage('unpublish',post.id,post.revision));assert.equal((await list()).length,0);await assert.rejects(react(post.id,'love'),/no longer published/);
 ({post}=await manage('publish',post.id,post.revision));
 for(let i=0;i<4;i++){const p=(await manage('save',null,null,{...payload,headline:'Post '+i,published:true})).post;await db.query("update spark_spotlights set published_at='2026-10-01'::timestamptz+$1*interval '1 day' where id=$2",[i,p.id]);}
 const all=await list();assert.equal(all.length,5);assert.equal((await list('school1',null,3)).length,3);assert.equal((await list('school1',null,3,3)).length,2);
 assert(all.every((p,i)=>!i||new Date(all[i-1].published_at)>=new Date(p.published_at)));
 await manage('delete',post.id,post.revision);assert.equal((await db.query('select count(*) n from spark_spotlight_reactions')).rows[0].n,0);
 assert.equal((await db.query('select count(*) n from spark_points')).rows[0].n,0);
 await db.exec('set role anon');await assert.rejects(db.exec("insert into spark_spotlights(headline,body,category) values('hack','hack','Recognition')"),/permission denied/);await assert.rejects(db.exec('select * from spark_spotlights'),/permission denied/);await assert.rejects(manage('delete',post.id,post.revision,{},'wrong'),/Supervisor/);
 console.log('PASS: supervisor-only CRUD, text/photo paths, revision protection, unpublished isolation, location-bound replacement reactions/counts, zero points, newest-first/3-post pagination, deletion cascade and direct-table restrictions.');
}finally{await db.close();}
