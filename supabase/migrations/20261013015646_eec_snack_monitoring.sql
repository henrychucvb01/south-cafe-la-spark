-- DEVELOPMENT ONLY. Reuse protected records and atomic PDF/audit writes. No live data changes.
begin;
alter table public.snp_records add column program text not null default 'snp' check(program in ('snp','eec-snack'));
create index snp_records_program_history on public.snp_records(location_id,program,updated_at desc);
create or replace function public.snp_list(p_token text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.snp_authorize(p_token);
 return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'site_name',r.site_name,'status',r.status,'revision',r.revision,'meal',r.payload->>'meal','visit_date',r.payload->>'visitDate','updated_at',r.updated_at) order by r.updated_at desc),'[]') from public.snp_records r where r.location_id=s.location_id and r.program='snp' and (s.actor_role='supervisor' or r.status='finalized'));
end $$;

create or replace function public.snack_list(p_token text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.snp_authorize(p_token);
 return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'site_name',r.site_name,'status',r.status,'revision',r.revision,'meal',r.payload->>'meal','visit_date',r.payload->>'visitDate','updated_at',r.updated_at) order by r.updated_at desc),'[]') from public.snp_records r where r.location_id=s.location_id and r.program='eec-snack' and (s.actor_role='supervisor' or r.status='finalized'));
end $$;

create or replace function public.snack_sites(p_token text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s public.supper_monitoring_sessions; result jsonb; staff text;
begin
 s:=public.snp_authorize(p_token);
 select coalesce(jsonb_agg(value),'[]') into result from jsonb_array_elements(public.snp_sites(p_token)) where value->>'name' ~* '(EEC|Early Education Center)$';
 select string_agg(employee_name,', ' order by employee_name) into staff from public.employees where location_id=s.location_id and active;
 return result||(select coalesce(jsonb_agg(jsonb_build_object('key','registered:'||m.id,'name',m.name,'staff',coalesce(staff,'')) order by m.name),'[]') from public.monitoring_sites m where m.location_id=s.location_id and m.kind='eec' and not exists(select from jsonb_array_elements(result) x where lower(x->>'name')=lower(m.name)));
end $$;
revoke all on function public.snack_sites(text) from public;
grant execute on function public.snack_sites(text) to anon,authenticated,service_role;

create or replace function public.snp_save(p_token text,p_id uuid,p_revision integer,p_site text,p_payload jsonb,p_section integer) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s public.supper_monitoring_sessions; r public.snp_records; site jsonb; program_key text:=coalesce(p_payload->>'program','snp');
begin
 s:=public.snp_authorize(p_token,true);
 if p_payload is null or p_section is null or program_key not in ('snp','eec-snack') then raise exception 'Invalid monitoring program or draft.'; end if;
 if p_id is null or p_revision is null or p_section not between 0 and 5 or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>150000 then raise exception 'Invalid SNP draft.'; end if;
 select value into site from jsonb_array_elements(case when program_key='eec-snack' then public.snack_sites(p_token) else public.snp_sites(p_token) end) where value->>'key'=p_site;
 if site is null or p_payload->>'siteName' is distinct from site->>'name' then raise exception 'Choose an authorized SNP site.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into r from public.snp_records where id=p_id for update;
 if r.id is not null then
  if r.location_id<>s.location_id or r.site_key<>p_site then raise exception 'SNP monitoring not found for this school.'; end if;
  if r.program<>program_key then raise exception 'The monitoring program cannot change on an existing report.'; end if;
  if r.status<>'draft' then raise exception 'Finalized SNP records cannot be edited.'; end if;
  if r.payload=p_payload and r.section=p_section then return public.snp_get(p_token,p_id); end if;
  if r.revision<>p_revision then raise exception 'Draft changed in another session. Reopen the saved draft.' using errcode='40001'; end if;
  update public.snp_records set payload=p_payload,section=p_section,revision=revision+1,updated_at=now() where id=p_id returning * into r;
 else
  if p_revision<>0 then raise exception 'Draft no longer exists.'; end if;
  insert into public.snp_records(id,location_id,site_key,site_name,payload,section,program) values(p_id,s.location_id,p_site,site->>'name',p_payload,p_section,program_key) returning * into r;
 end if;
 insert into public.snp_events(record_id,revision,action,actor,detail) values(p_id,r.revision,'Draft saved',s.monitor_name,jsonb_build_object('section',p_section));
 return public.snp_get(p_token,p_id);
end $$;


revoke all on function public.snack_list(text) from public;
grant execute on function public.snack_list(text) to anon,authenticated,service_role;
commit;
