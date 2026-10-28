import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create table public.monitoring_records(location_id int,monitor_role text,status text,locked boolean);
  insert into public.monitoring_records values(1,'manager','corrections_requested',false),(1,'manager','corrections_requested',true),(1,'supervisor','corrections_requested',false),(1,'manager','submitted',false),(2,'manager','corrections_requested',false),(1,'manager','corrections_requested',null);
  create function public.list_supper_monitorings(p_token text) returns setof public.monitoring_records language plpgsql security definer set search_path=pg_catalog as $$begin
   if p_token not in('one','two') or p_token is null then raise exception 'Session expired';end if;
   return query select * from public.monitoring_records where location_id=case p_token when 'one' then 1 else 2 end;end$$;
  revoke all on function public.list_supper_monitorings(text) from public;grant execute on function public.list_supper_monitorings(text) to anon,authenticated,service_role;`);
 await db.exec(await readFile('supabase/migrations/20261028161908_supper_correction_count.sql','utf8'));
 await db.exec('set role anon');
 assert.equal((await db.query("select public.supper_correction_count('one') n")).rows[0].n,2);
 assert.equal((await db.query("select public.supper_correction_count('two') n")).rows[0].n,1);
 await assert.rejects(db.query("select public.supper_correction_count('invalid')"),/Session expired/);
 await assert.rejects(db.query('select * from public.monitoring_records'),/permission denied/);
 console.log('PASS correction count: original session/school scope, role/status/lock filters, invalid-token rejection and no direct table access.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{await db.close();}
