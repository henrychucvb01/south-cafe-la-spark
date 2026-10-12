-- DEVELOPMENT ONLY: additive SNP records. No changes to Supper, imports, assignments or points.
begin;
create table public.snp_records (
 id uuid primary key, location_id bigint not null references public.locations(id),
 site_key text not null, site_name text not null, payload jsonb not null,
 status text not null default 'draft' check(status in ('draft','finalized')),
 revision integer not null default 1, section integer not null default 0 check(section between 0 and 5),
 followups jsonb not null default '{}', created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), finalized_at timestamptz,
 check(jsonb_typeof(payload)='object'), check(octet_length(payload::text)<=150000)
);
create index snp_records_school_history on public.snp_records(location_id,updated_at desc);
create table public.snp_documents (record_id uuid primary key references public.snp_records(id),pdf bytea not null,sha256 text not null);
create table public.snp_events (
 id bigint generated always as identity primary key,record_id uuid not null references public.snp_records(id),
 revision integer not null,action text not null,actor text not null,at timestamptz not null default now(),
 detail jsonb not null,unique(record_id,revision)
);
alter table public.snp_records enable row level security;
alter table public.snp_documents enable row level security;
alter table public.snp_events enable row level security;
revoke all on public.snp_records,public.snp_documents,public.snp_events from public,anon,authenticated;
revoke all on sequence public.snp_events_id_seq from public,anon,authenticated;

create function public.snp_authorize(p_token text,p_write boolean default false)
returns public.supper_monitoring_sessions language plpgsql security definer set search_path=pg_catalog as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if p_write and s.actor_role<>'supervisor' then raise exception 'Supervisor authorization required.' using errcode='42501'; end if;
 -- SNP read access is assigned-school or covering-school access. Other SPARK helping workflows are unchanged.
 if s.actor_role<>'supervisor' and not s.covering and not exists(select from public.employees where id=s.employee_id and location_id=s.location_id and active) then
  raise exception 'SNP reports are available for your assigned school or authorized covering school.' using errcode='42501';
 end if;
 if exists(select from public.locations where id=s.location_id and lower(school_name) in ('hawthorne academy','peary ms')) then raise exception 'School is not in the SNP roster.'; end if;
 return s;
end $$;

create function public.snp_sites(p_token text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s public.supper_monitoring_sessions; result jsonb; parent text; staff text;
begin
 s:=public.snp_authorize(p_token);
 select school_name into parent from public.locations where id=s.location_id;
 select string_agg(employee_name,', ' order by employee_name) into staff from public.employees where location_id=s.location_id and active;
 result:=jsonb_build_array(jsonb_build_object('key','main','name',parent,'staff',coalesce(staff,'')));
 -- Explicit supervisor-confirmed parents. Monthly import mappings are intentionally not used.
 if lower(parent) in ('dolores el','dolores elementary') then result:=result||jsonb_build_array(jsonb_build_object('key','dolores-eec','name','Dolores EEC','staff',coalesce(staff,'')));
 elsif lower(parent) in ('wilmington park el','wilmington park elementary') then result:=result||jsonb_build_array(jsonb_build_object('key','wilmington-park-eec','name','Wilmington Park EEC','staff',coalesce(staff,'')));
 elsif lower(parent)='banning hs' then result:=result||jsonb_build_array(jsonb_build_object('key','avalon-hs','name','Avalon HS','staff',coalesce(staff,'')));
 elsif lower(parent)='carson hs' then result:=result||jsonb_build_array(jsonb_build_object('key','eagle-tree-hs','name','Eagle Tree HS','staff',coalesce(staff,''))); end if;
 return result;
end $$;

create function public.snp_list(p_token text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.snp_authorize(p_token);
 return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'site_name',r.site_name,'status',r.status,'revision',r.revision,'meal',r.payload->>'meal','visit_date',r.payload->>'visitDate','updated_at',r.updated_at) order by r.updated_at desc),'[]') from public.snp_records r where r.location_id=s.location_id and (s.actor_role='supervisor' or r.status='finalized'));
end $$;

create function public.snp_get(p_token text,p_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s public.supper_monitoring_sessions; r public.snp_records;
begin
 s:=public.snp_authorize(p_token);
 select * into r from public.snp_records where id=p_id and location_id=s.location_id and (s.actor_role='supervisor' or status='finalized');
 if r.id is null then raise exception 'SNP monitoring not found for this school.' using errcode='42501'; end if;
 return to_jsonb(r)||jsonb_build_object('history',(select coalesce(jsonb_agg(jsonb_build_object('action',action,'at',at,'actor',actor,'revision',revision) order by revision),'[]') from public.snp_events where record_id=p_id));
end $$;

create function public.snp_save(p_token text,p_id uuid,p_revision integer,p_site text,p_payload jsonb,p_section integer) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s public.supper_monitoring_sessions; r public.snp_records; site jsonb;
begin
 s:=public.snp_authorize(p_token,true);
 if p_id is null or p_revision is null or p_section not between 0 and 5 or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>150000 then raise exception 'Invalid SNP draft.'; end if;
 select value into site from jsonb_array_elements(public.snp_sites(p_token)) where value->>'key'=p_site;
 if site is null or p_payload->>'siteName' is distinct from site->>'name' then raise exception 'Choose an authorized SNP site.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into r from public.snp_records where id=p_id for update;
 if r.id is not null then
  if r.location_id<>s.location_id or r.site_key<>p_site then raise exception 'SNP monitoring not found for this school.'; end if;
  if r.status<>'draft' then raise exception 'Finalized SNP records cannot be edited.'; end if;
  if r.payload=p_payload and r.section=p_section then return public.snp_get(p_token,p_id); end if;
  if r.revision<>p_revision then raise exception 'Draft changed in another session. Reopen the saved draft.' using errcode='40001'; end if;
  update public.snp_records set payload=p_payload,section=p_section,revision=revision+1,updated_at=now() where id=p_id returning * into r;
 else
  if p_revision<>0 then raise exception 'Draft no longer exists.'; end if;
  insert into public.snp_records(id,location_id,site_key,site_name,payload,section) values(p_id,s.location_id,p_site,site->>'name',p_payload,p_section) returning * into r;
 end if;
 insert into public.snp_events(record_id,revision,action,actor,detail) values(p_id,r.revision,'Draft saved',s.monitor_name,jsonb_build_object('section',p_section));
 return public.snp_get(p_token,p_id);
end $$;

-- Only the server renderer can finalize. It validates every response, finding,
-- content-bound signature and template hash before calling this transaction.
create function public.snp_finalize(p_token text,p_id uuid,p_revision integer,p_pdf text,p_sha256 text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s public.supper_monitoring_sessions; r public.snp_records; bytes bytea;
begin
 s:=public.snp_authorize(p_token,true);
 select * into r from public.snp_records where id=p_id and location_id=s.location_id for update;
 if r.id is null then raise exception 'SNP monitoring not found for this school.'; end if;
 if r.status='finalized' then return public.snp_get(p_token,p_id); end if;
 if r.revision<>p_revision then raise exception 'Draft changed. Preview the saved draft again.' using errcode='40001'; end if;
 bytes:=decode(p_pdf,'base64');
 if octet_length(bytes)>5000000 or substring(bytes from 1 for 5)<>convert_to('%PDF-','UTF8') or encode(sha256(bytes),'hex')<>p_sha256 then raise exception 'Invalid official PDF.'; end if;
 insert into public.snp_documents(record_id,pdf,sha256) values(p_id,bytes,p_sha256);
 update public.snp_records set status='finalized',revision=revision+1,finalized_at=now(),updated_at=now() where id=p_id returning * into r;
 insert into public.snp_events(record_id,revision,action,actor,detail) values(p_id,r.revision,'Finalized',s.monitor_name,jsonb_build_object('sha256',p_sha256));
 return public.snp_get(p_token,p_id);
end $$;

create function public.snp_pdf(p_token text,p_id uuid) returns text language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform public.snp_get(p_token,p_id);
 return (select encode(pdf,'base64') from public.snp_documents where record_id=p_id);
end $$;

create function public.snp_followup(p_token text,p_id uuid,p_revision integer,p_finding text,p_note text,p_completed date) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s public.supper_monitoring_sessions; r public.snp_records; f jsonb;
begin
 s:=public.snp_authorize(p_token,true);
 select * into r from public.snp_records where id=p_id and location_id=s.location_id for update;
 if r.id is null or r.status<>'finalized' then raise exception 'Choose a finalized SNP report.'; end if;
 if r.revision<>p_revision then raise exception 'Report changed. Reopen before recording follow-up.' using errcode='40001'; end if;
 f:=r.payload->'observations'->p_finding;
 if f is null then select value into f from jsonb_array_elements(r.payload->'additional') where value->>'id'=p_finding; end if;
 if f is null or coalesce((f->>'followup')::boolean,false) is not true then raise exception 'Choose an outstanding follow-up finding.'; end if;
 if length(trim(p_note))<1 or length(p_note)>4000 or p_completed is null or p_completed<(r.payload->>'visitDate')::date or p_completed>(now() at time zone 'America/Los_Angeles')::date then raise exception 'Enter a follow-up note and valid completion date.'; end if;
 f:=jsonb_build_object('note',p_note,'completed',p_completed,'recorded_at',now());
 update public.snp_records set followups=jsonb_set(followups,array[p_finding],f),revision=revision+1,updated_at=now() where id=p_id returning * into r;
 insert into public.snp_events(record_id,revision,action,actor,detail) values(p_id,r.revision,'Follow-up completed',s.monitor_name,jsonb_build_object('finding',p_finding,'entry',f));
 return public.snp_get(p_token,p_id);
end $$;

revoke all on function public.snp_authorize(text,boolean) from public,anon,authenticated;
revoke all on function public.snp_finalize(text,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.snp_finalize(text,uuid,integer,text,text) to service_role;
do $$ declare r record; begin
 for r in select oid::regprocedure fn from pg_proc where pronamespace='public'::regnamespace and proname in ('snp_sites','snp_list','snp_get','snp_save','snp_pdf','snp_followup') loop
  execute format('revoke all on function %s from public',r.fn);
  execute format('grant execute on function %s to anon,authenticated,service_role',r.fn);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
