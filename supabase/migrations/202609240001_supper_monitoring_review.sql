begin;
alter table public.supper_monitoring_sessions add column actor_role text not null default 'manager' check(actor_role in ('manager','supervisor'));
alter table public.supper_monitorings drop constraint supper_monitorings_status_check;
alter table public.supper_monitorings add constraint supper_monitorings_status_check check(status in ('draft','submitted','corrections_requested','accepted','completed','deleted'));
alter table public.supper_monitorings
 add column source text not null default 'generated' check(source in ('generated','uploaded')),
 add column monitoring_slot text check(monitoring_slot in ('manager_1','manager_2','supervisor')),
 add column locked boolean not null default false,
 add column review_comments text not null default '',
 add column accepted_at timestamptz,
 add column deleted_at timestamptz,
 add column document_version integer not null default 0;
-- Existing manager submissions enter review; existing supervisor completions stay complete.
update public.supper_monitorings set status='submitted' where status='completed' and monitor_role='manager';
update public.supper_monitorings set locked=(status='completed');
alter table public.supper_monitorings add constraint supper_lock_state check(locked=(status in ('accepted','completed')));
-- Preserve legacy records, including any extra/unassigned monitorings. Never discard them.
with ranked as (select id,monitor_role,row_number() over(partition by location_id,school_year,monitor_role order by monitoring_date,created_at,id) n from public.supper_monitorings where school_year is not null)
update public.supper_monitorings m set monitoring_slot=case when r.monitor_role='supervisor' and n=1 then 'supervisor' when r.monitor_role='manager' and n<=2 then 'manager_'||n::text else null end from ranked r where r.id=m.id;
create unique index supper_unique_active_slot on public.supper_monitorings(location_id,school_year,monitoring_slot) where status<>'deleted' and monitoring_slot is not null;
create table public.supper_monitoring_settings(singleton boolean primary key default true check(singleton),allow_manager_uploads boolean not null default true,updated_at timestamptz not null default now());
insert into public.supper_monitoring_settings(singleton) values(true);
create table public.supper_monitoring_document_versions(
 monitoring_id uuid not null references public.supper_monitorings(id),version integer not null,
 pdf_bytes bytea not null check(octet_length(pdf_bytes) between 100 and 2097152),sha256 text not null,
 created_at timestamptz not null default now(),primary key(monitoring_id,version));
insert into public.supper_monitoring_document_versions(monitoring_id,version,pdf_bytes,sha256) select monitoring_id,1,pdf_bytes,sha256 from public.supper_monitoring_documents;
update public.supper_monitorings set document_version=1 where id in(select monitoring_id from public.supper_monitoring_documents);
create table public.supper_monitoring_events(
 id bigint generated always as identity primary key,monitoring_id uuid references public.supper_monitorings(id),
 action text not null,occurred_at timestamptz not null default now(),actor_name text not null,actor_role text not null,
 actor_employee_id bigint,old_status text,new_status text,comment text not null default '',document_version integer,metadata jsonb not null default '{}'::jsonb);
alter table public.supper_monitoring_settings enable row level security;
alter table public.supper_monitoring_document_versions enable row level security;
alter table public.supper_monitoring_events enable row level security;
revoke all on public.supper_monitoring_settings,public.supper_monitoring_document_versions,public.supper_monitoring_events from public,anon,authenticated;

-- Existing SPARK supervisor PIN authorizes active schools globally, as in the
-- current Command Center RPCs. No new password, identity or authorization store.
create function public.supper_supervisor_overview(p_pin text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if public.verify_supervisor_pin(p_pin) is not true then raise exception 'Supervisor authorization failed.'; end if;
 return jsonb_build_object('schools',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'school_name',school_name,'location_code',location_code) order by school_name),'[]') from public.locations where active=true),
 'records',(select coalesce(jsonb_agg(to_jsonb(m)-'payload'),'[]') from public.supper_monitorings m join public.locations l on l.id=m.location_id where l.active=true),
 'allow_manager_uploads',(select allow_manager_uploads from public.supper_monitoring_settings where singleton));
end $$;
create function public.set_supper_uploads(p_pin text,p_enabled boolean) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if public.verify_supervisor_pin(p_pin) is not true then raise exception 'Supervisor authorization failed.'; end if;
 if p_enabled is null then raise exception 'Choose On or Off.'; end if;
 update public.supper_monitoring_settings set allow_manager_uploads=p_enabled,updated_at=now() where singleton;
 insert into public.supper_monitoring_events(action,actor_name,actor_role,comment) values('Upload setting changed','Supervisor / AFSS','supervisor',case when p_enabled then 'On' else 'Off' end);
 return p_enabled;
end $$;
create function public.open_supper_supervisor_session(p_location_id bigint,p_pin text) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_token text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_location_id::text||':supervisor',0));
 delete from public.supper_monitoring_attempts where attempted_at<now()-interval '1 day';
 if (select count(*) from public.supper_monitoring_attempts where location_id=p_location_id and employee_key='supervisor' and attempted_at>now()-interval '15 minutes')>=10 then return null; end if;
 insert into public.supper_monitoring_attempts(location_id,employee_key) values(p_location_id,'supervisor');
 if public.verify_supervisor_pin(p_pin) is not true or not exists(select 1 from public.locations where id=p_location_id and active=true) then return null; end if;
 v_token:=gen_random_uuid()::text||gen_random_uuid()::text;
 insert into public.supper_monitoring_sessions(token_hash,location_id,monitor_name,actor_role) values(encode(sha256(convert_to(v_token,'UTF8')),'hex'),p_location_id,'Supervisor / AFSS','supervisor');
 return v_token;
end $$;
create or replace function public.require_supper_monitoring_session(p_token text) returns public.supper_monitoring_sessions language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin
 select * into s from public.supper_monitoring_sessions where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now();
 if s.token_hash is null then raise exception 'Session expired. Reconnect using your SPARK sign-in.'; end if;
 if not exists(select 1 from public.locations where id=s.location_id and active=true) then raise exception 'School access is no longer active.'; end if;
 if s.actor_role='manager' and not s.covering and not exists(select 1 from public.employees where id=s.employee_id and location_id=s.location_id and active=true) then raise exception 'Manager is no longer assigned to this school.'; end if;
 return s;
end $$;
create function public.supper_context(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin s:=public.require_supper_monitoring_session(p_token);
 return jsonb_build_object('actor_role',s.actor_role,'employee_id',s.employee_id,'monitor_name',s.monitor_name,'allow_manager_uploads',(select allow_manager_uploads from public.supper_monitoring_settings where singleton)); end $$;
create function public.supper_assert_editor(s public.supper_monitoring_sessions,m public.supper_monitorings) returns void language plpgsql set search_path=public,pg_temp as $$
begin
 if s.actor_role='supervisor' then return; end if;
 if m.monitor_role<>'manager' or (not s.covering and m.created_by_employee_id is distinct from s.employee_id) or (s.covering and (m.created_by_employee_id is not null or m.created_by_name<>s.monitor_name)) then raise exception 'Only the creator or Supervisor can edit this monitoring.'; end if;
end $$;
create function public.supper_metadata(p_date date,p_year text,p_slot text,p_role text) returns void language plpgsql set search_path=public,pg_temp as $$
declare y integer;
begin
 if p_year is null or p_year !~ '^[0-9]{4}-[0-9]{2}$' or right(((left(p_year,4)::integer)+1)::text,2)<>right(p_year,2) then raise exception 'Choose a valid school year.'; end if;
 if p_date is not null then
  y:=extract(year from p_date)::integer-case when extract(month from p_date)<7 then 1 else 0 end;
  if p_year<>y::text||'-'||right((y+1)::text,2) then raise exception 'Monitoring date must be in the selected school year.'; end if;
 end if;
 if p_slot is null or (p_role='manager' and p_slot not in ('manager_1','manager_2')) or (p_role='supervisor' and p_slot<>'supervisor') then raise exception 'Choose a monitoring slot for this role.'; end if;
end $$;
create function public.supper_event(m public.supper_monitorings,s public.supper_monitoring_sessions,p_action text,p_old text,p_comment text default '') returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin insert into public.supper_monitoring_events(monitoring_id,action,actor_name,actor_role,actor_employee_id,old_status,new_status,comment,document_version,metadata)
 values(m.id,p_action,s.monitor_name,s.actor_role,s.employee_id,p_old,m.status,coalesce(p_comment,''),m.document_version,jsonb_build_object('monitoring_date',m.monitoring_date,'school_year',m.school_year,'slot',m.monitoring_slot,'source',m.source)); end $$;
create or replace function public.get_supper_monitoring(p_token text,p_id uuid) returns public.supper_monitorings language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;m public.supper_monitorings;
begin s:=public.require_supper_monitoring_session(p_token);
 select * into m from public.supper_monitorings where id=p_id and location_id=s.location_id and (status<>'deleted' or s.actor_role='supervisor');
 if m.id is null then raise exception 'Monitoring not found for this school.'; end if; return m; end $$;
drop function public.list_supper_monitorings(text);
create function public.list_supper_monitorings(p_token text) returns setof public.supper_monitorings language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin s:=public.require_supper_monitoring_session(p_token);
 return query select * from public.supper_monitorings where location_id=s.location_id and (status<>'deleted' or s.actor_role='supervisor') order by updated_at desc; end $$;
create or replace function public.save_supper_monitoring_draft(p_token text,p_id uuid,p_revision integer,p_section integer,p_payload jsonb) returns public.supper_monitorings language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.supper_monitoring_sessions; v_record public.supper_monitorings; v_date date; v_year integer; v_field text; v_item jsonb; v_signature jsonb; v_stroke jsonb; v_point jsonb; v_role text;
begin
 v_session:=public.require_supper_monitoring_session(p_token);
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>500000 or p_payload->>'schemaVersion' is distinct from '1' then raise exception 'Draft format is not supported.'; end if;
  foreach v_field in array array['monitoringDate','arrivalTime','departureTime','serviceStart','serviceEnd','programName','programType','todayAttendance','todayMeals','weekStart','repeatedFindings','repeatedAction','comments','monitorName','coordinatorName'] loop
    if jsonb_typeof(p_payload->v_field) is distinct from 'string' then raise exception 'Draft field % must contain text.',v_field; end if;
  end loop;
  foreach v_field in array array['answers','correctiveActions','signatures'] loop
    if jsonb_typeof(p_payload->v_field) is distinct from 'object' then raise exception 'Draft section % has an unsupported format.',v_field; end if;
  end loop;
  if jsonb_typeof(p_payload->'history') is distinct from 'array' or jsonb_typeof(p_payload->'menu') is distinct from 'array' then raise exception 'History and menu must be lists.'; end if;
  if jsonb_array_length(p_payload->'history') not in (0,5) or jsonb_array_length(p_payload->'menu')<>7 then raise exception 'Use the five-day history and seven menu categories.'; end if;
  for v_item in select value from jsonb_array_elements(p_payload->'history') loop
    foreach v_field in array array['date','meals','attendance'] loop
      if jsonb_typeof(v_item->v_field) is distinct from 'string' then raise exception 'History entries must contain dates and count text.'; end if;
    end loop;
  end loop;
  for v_item in select value from jsonb_array_elements(p_payload->'menu') loop
    if jsonb_typeof(v_item->'applicable') is distinct from 'boolean' then raise exception 'Confirm whether each menu category applies.'; end if;
    foreach v_field in array array['category','item','serving'] loop
      if jsonb_typeof(v_item->v_field) is distinct from 'string' then raise exception 'Menu entries must contain category, item and serving text.'; end if;
    end loop;
  end loop;
  for v_item in select value from jsonb_each(p_payload->'correctiveActions') loop
    if jsonb_typeof(v_item) is distinct from 'object' then raise exception 'Corrective action format is unsupported.'; end if;
    foreach v_field in array array['description','action','training','followUpPlan','actionDate','followUpDue','followUpDate','followUpNotes'] loop
      if v_item ? v_field and jsonb_typeof(v_item->v_field) <> 'string' then raise exception 'Corrective action entries must be text.'; end if;
    end loop;
  end loop;
  foreach v_field in array array['monitor','coordinator'] loop
    v_signature := p_payload->'signatures'->v_field;
    if v_signature is null then raise exception 'Signature status is missing.'; end if;
    if v_signature <> 'null'::jsonb then
      if jsonb_typeof(v_signature->'strokes') is distinct from 'array' or jsonb_typeof(v_signature->'pages') is distinct from 'array' or jsonb_typeof(v_signature->'printedName') is distinct from 'string' or jsonb_typeof(v_signature->'date') is distinct from 'string' or jsonb_typeof(v_signature->'acceptedAt') is distinct from 'string' then raise exception 'Signature format is unsupported.'; end if;
      if jsonb_array_length(v_signature->'strokes')>80 then raise exception 'Signature has too many strokes.'; end if;
      for v_stroke in select value from jsonb_array_elements(v_signature->'strokes') loop
        if jsonb_typeof(v_stroke)<>'array' then raise exception 'Signature stroke format is unsupported.'; end if;
        if jsonb_array_length(v_stroke)>1500 then raise exception 'Signature stroke is too large.'; end if;
        for v_point in select value from jsonb_array_elements(v_stroke) loop
          if jsonb_typeof(v_point)<>'array' then raise exception 'Signature point format is unsupported.'; end if;
          if jsonb_array_length(v_point)<>2 or jsonb_typeof(v_point->0)<>'number' or jsonb_typeof(v_point->1)<>'number' then raise exception 'Signature point format is unsupported.'; end if;
          if (v_point->>0)::numeric not between 0 and 1 or (v_point->>1)::numeric not between 0 and 1 then raise exception 'Signature points must stay inside the pad.'; end if;
        end loop;
      end loop;
    end if;
  end loop;
  if p_section is null or p_section not between 0 and 9 then raise exception 'Choose a valid section.'; end if;
  if coalesce(p_payload->>'monitoringDate','') <> '' then
    if p_payload->>'monitoringDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Enter a valid monitoring date or leave it blank in the draft.'; end if;
    v_date := (p_payload->>'monitoringDate')::date;
    v_year := extract(year from v_date)::integer - case when extract(month from v_date)<7 then 1 else 0 end;
  end if;

 v_role:=v_session.actor_role;
 if p_id is not null then
  select * into v_record from public.supper_monitorings where id=p_id and location_id=v_session.location_id for update;
  if v_record.id is null then raise exception 'Monitoring not found for this school.'; end if;
  perform public.supper_assert_editor(v_session,v_record);
  if v_record.locked or v_record.status not in ('draft','corrections_requested') or v_record.source<>'generated' then raise exception 'Monitoring is read-only. A Supervisor must unlock it for correction.'; end if;
  if p_revision is distinct from v_record.revision then raise exception 'Draft changed in another session. Reopen before saving.'; end if;
  v_role:=v_record.monitor_role;
 end if;
 perform public.supper_metadata(v_date,p_payload->>'schoolYear',p_payload->>'monitoringSlot',v_role);
 if p_id is null then
  insert into public.supper_monitorings(location_id,created_by_employee_id,created_by_name,monitor_role,current_section,payload,monitoring_date,school_year,monitoring_slot)
   values(v_session.location_id,v_session.employee_id,v_session.monitor_name,v_role,p_section,p_payload,v_date,p_payload->>'schoolYear',p_payload->>'monitoringSlot') returning * into v_record;
  perform public.supper_event(v_record,v_session,'Draft started',null);
 else
  update public.supper_monitorings set payload=p_payload,current_section=p_section,monitoring_date=v_date,school_year=p_payload->>'schoolYear',monitoring_slot=p_payload->>'monitoringSlot',revision=revision+1,updated_at=now() where id=p_id returning * into v_record;
 end if;
 return v_record;
exception when unique_violation then raise exception 'This school-year monitoring slot already exists. Resume it or select another slot.';
end $$;

-- Keep each original/corrected document. Called only by the trusted report RPCs.
create function public.supper_store_pdf(p_id uuid,p_encoded text,p_hash text) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare b bytea;v integer;
begin
 if p_encoded is null or length(p_encoded)>2800000 then raise exception 'PDF must be no larger than 2 MB.'; end if;
 b:=decode(p_encoded,'base64');
 if octet_length(b) not between 100 and 2097152 or substring(b from 1 for 5)<>convert_to('%PDF-','UTF8') or encode(sha256(b),'hex') is distinct from p_hash then raise exception 'PDF integrity check failed.'; end if;
 select document_version+1 into v from public.supper_monitorings where id=p_id for update;
 insert into public.supper_monitoring_document_versions(monitoring_id,version,pdf_bytes,sha256) values(p_id,v,b,p_hash);
 insert into public.supper_monitoring_documents(monitoring_id,pdf_bytes,sha256) values(p_id,b,p_hash) on conflict(monitoring_id) do update set pdf_bytes=excluded.pdf_bytes,sha256=excluded.sha256,created_at=now();
 update public.supper_monitorings set document_version=v,pdf_storage_path='db:supper_monitoring_documents/'||p_id::text,pdf_sha256=p_hash where id=p_id;
 return v;
end $$;
create or replace function public.finalize_supper_monitoring(p_token text,p_id uuid,p_revision integer,p_template_version text,p_pdf_base64 text,p_pdf_sha256 text) returns public.supper_monitorings language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;m public.supper_monitorings;old text;
begin
 s:=public.require_supper_monitoring_session(p_token);
 select * into m from public.supper_monitorings where id=p_id and location_id=s.location_id for update;
 if m.id is null then raise exception 'Monitoring not found for this school.'; end if;
 perform public.supper_assert_editor(s,m);
 if m.status in ('submitted','accepted','completed') then return m; end if;
 if m.locked or m.status not in ('draft','corrections_requested') or m.source<>'generated' then raise exception 'Monitoring is read-only.'; end if;
 if p_revision is distinct from m.revision then raise exception 'Draft revision changed. Reopen before submitting.'; end if;
 if p_template_version is distinct from 'lausd-supper-2022-09-08' then raise exception 'Unverified report template.'; end if;
 perform public.supper_metadata(m.monitoring_date,m.school_year,m.monitoring_slot,m.monitor_role);
 if m.monitoring_date is null then raise exception 'Enter a monitoring date.'; end if;
 old:=m.status;
 perform public.supper_store_pdf(p_id,p_pdf_base64,p_pdf_sha256);
 update public.supper_monitorings set status=case when monitor_role='supervisor' then 'completed' else 'submitted' end,locked=(monitor_role='supervisor'),submitted_at=now(),updated_at=now(),revision=revision+1,template_version=p_template_version,current_section=8 where id=p_id returning * into m;
 perform public.supper_event(m,s,case when old='corrections_requested' then 'Resubmitted' else 'Submitted' end,old);
 return m;
end $$;
create function public.upload_supper_pdf(p_token text,p_id uuid,p_revision integer,p_metadata jsonb,p_pdf_base64 text,p_pdf_sha256 text) returns public.supper_monitorings language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;m public.supper_monitorings;d date;old text;v_role text;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if p_id is null then
  -- OFF blocks new uploads, not corrections to existing uploaded monitorings.
  if s.actor_role='manager' and not (select allow_manager_uploads from public.supper_monitoring_settings where singleton for share) then raise exception 'New manager PDF uploads are turned off. Start a guided monitoring instead.'; end if;
  v_role:=s.actor_role;
 else
  select * into m from public.supper_monitorings where id=p_id and location_id=s.location_id for update;
  if m.id is null then raise exception 'Monitoring not found for this school.'; end if;
  perform public.supper_assert_editor(s,m);
  if m.status='deleted' or (s.actor_role='manager' and (m.locked or m.source<>'uploaded' or m.status not in ('submitted','corrections_requested','draft'))) then raise exception 'This monitoring cannot be replaced. A Supervisor must unlock it.'; end if;
  if p_revision is distinct from m.revision then raise exception 'Monitoring revision changed. Reopen before replacing.'; end if;
  old:=m.status;v_role:=m.monitor_role;
 end if;
 if p_metadata->>'monitoringDate' is null or p_metadata->>'monitoringDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Enter a monitoring date.'; end if;
 d:=(p_metadata->>'monitoringDate')::date;
 perform public.supper_metadata(d,p_metadata->>'schoolYear',p_metadata->>'monitoringSlot',v_role);
 if char_length(trim(coalesce(p_metadata->>'monitorName',''))) not between 1 and 160 then raise exception 'Enter the monitor name.'; end if;
 if p_id is null then
  insert into public.supper_monitorings(location_id,created_by_employee_id,created_by_name,monitor_role,source,status,locked,monitoring_date,school_year,monitoring_slot,payload,template_version,submitted_at)
   values(s.location_id,s.employee_id,s.monitor_name,v_role,'uploaded','draft',false,d,p_metadata->>'schoolYear',p_metadata->>'monitoringSlot',p_metadata,'uploaded-original',now()) returning * into m;
  p_id:=m.id;
 else
  update public.supper_monitorings set payload=p_metadata,source='uploaded',monitoring_date=d,school_year=p_metadata->>'schoolYear',monitoring_slot=p_metadata->>'monitoringSlot',revision=revision+1,updated_at=now() where id=p_id returning * into m;
 end if;
 perform public.supper_store_pdf(p_id,p_pdf_base64,p_pdf_sha256);
 update public.supper_monitorings set status=case when old in ('accepted','completed') and s.actor_role='supervisor' then old when v_role='supervisor' then 'completed' when old is null then 'submitted' else 'corrections_requested' end,
 locked=(v_role='supervisor' or coalesce(old in ('accepted','completed') and s.actor_role='supervisor',false)),template_version='uploaded-original' where id=p_id returning * into m;
 perform public.supper_event(m,s,case when old is null then 'Uploaded' else 'PDF Replaced' end,old);
 if old is null then perform public.supper_event(m,s,'Submitted',null); end if;
 return m;
exception when unique_violation then raise exception 'This school-year monitoring slot already exists. Replace its PDF or select another slot.';
end $$;
create function public.supper_review_action(p_token text,p_id uuid,p_revision integer,p_action text,p_comment text default '') returns public.supper_monitorings language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;m public.supper_monitorings;old text;
begin
 s:=public.require_supper_monitoring_session(p_token);
 select * into m from public.supper_monitorings where id=p_id and location_id=s.location_id for update;
 if m.id is null then raise exception 'Monitoring not found for this school.'; end if;
 if p_revision is distinct from m.revision then raise exception 'Monitoring revision changed. Reopen before continuing.'; end if;
 if m.status='deleted' then raise exception 'Monitoring was deleted.'; end if;
 old:=m.status;
 if length(coalesce(p_comment,''))>4000 then raise exception 'Comment is too long.'; end if;
 if p_action='resubmit' then
  perform public.supper_assert_editor(s,m);
  if m.source<>'uploaded' or m.status<>'corrections_requested' or m.locked or m.document_version=0 then raise exception 'No corrected uploaded PDF is ready to resubmit.'; end if;
  update public.supper_monitorings set status='submitted',submitted_at=now() where id=p_id;
 else
  if s.actor_role<>'supervisor' then raise exception 'Supervisor authorization required.'; end if;
  if p_action in ('return','unlock','delete','comment') and trim(coalesce(p_comment,''))='' then raise exception 'Add a comment explaining this action.'; end if;
  if p_action='accept' then
   if m.monitor_role='supervisor' or m.status<>'submitted' or m.document_version=0 then raise exception 'Only a submitted manager monitoring can be accepted.'; end if;
   update public.supper_monitorings set status='accepted',locked=true,accepted_at=now(),review_comments=coalesce(p_comment,'') where id=p_id;
  elsif p_action in ('return','unlock') then
   if (p_action='return' and m.status<>'submitted') or (p_action='unlock' and not m.locked) then raise exception 'This action is unavailable for the current status.'; end if;
   update public.supper_monitorings set status='corrections_requested',locked=false,review_comments=p_comment,payload=case when source='generated' then jsonb_set(payload,'{signatures}','{"monitor":null,"coordinator":null}') else payload end where id=p_id;
  elsif p_action='delete' then update public.supper_monitorings set status='deleted',locked=false,deleted_at=now(),review_comments=p_comment where id=p_id;
  elsif p_action='comment' then update public.supper_monitorings set review_comments=p_comment where id=p_id;
  else raise exception 'Choose a supported action.'; end if;
 end if;
 update public.supper_monitorings set revision=revision+1,updated_at=now() where id=p_id returning * into m;
 perform public.supper_event(m,s,case p_action when 'accept' then 'Accepted' when 'return' then 'Returned for Correction' when 'unlock' then 'Unlocked' when 'delete' then 'Deleted by Supervisor' when 'resubmit' then 'Resubmitted' else 'Comment added' end,old,p_comment);
 return m;
end $$;
create function public.supper_audit_history(p_token text,p_id uuid) returns setof public.supper_monitoring_events language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin s:=public.require_supper_monitoring_session(p_token); if s.actor_role<>'supervisor' then raise exception 'Supervisor authorization required.'; end if;
 perform public.get_supper_monitoring(p_token,p_id);
 return query select * from public.supper_monitoring_events where monitoring_id=p_id order by id; end $$;
create or replace function public.read_supper_monitoring_pdf(p_token text,p_id uuid) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.supper_monitorings;b bytea;
begin m:=public.get_supper_monitoring(p_token,p_id);
 select pdf_bytes into b from public.supper_monitoring_documents where monitoring_id=p_id;
 if b is null then raise exception 'Stored report is unavailable.'; end if;return encode(b,'base64'); end $$;
create function public.read_supper_pdf_version(p_token text,p_id uuid,p_version integer) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;b bytea;
begin s:=public.require_supper_monitoring_session(p_token);if s.actor_role<>'supervisor' then raise exception 'Supervisor authorization required.';end if;
 perform public.get_supper_monitoring(p_token,p_id);
 select pdf_bytes into b from public.supper_monitoring_document_versions where monitoring_id=p_id and version=p_version;
 if b is null then raise exception 'Stored version is unavailable.';end if;return encode(b,'base64');end $$;

revoke all on function public.supper_assert_editor(public.supper_monitoring_sessions,public.supper_monitorings),public.supper_metadata(date,text,text,text),public.supper_event(public.supper_monitorings,public.supper_monitoring_sessions,text,text,text),public.supper_store_pdf(uuid,text,text) from public,anon,authenticated;
revoke all on function public.supper_supervisor_overview(text),public.set_supper_uploads(text,boolean),public.open_supper_supervisor_session(bigint,text),public.supper_context(text),public.list_supper_monitorings(text),public.supper_review_action(text,uuid,integer,text,text),public.supper_audit_history(text,uuid) from public;
grant execute on function public.supper_supervisor_overview(text),public.set_supper_uploads(text,boolean),public.open_supper_supervisor_session(bigint,text),public.supper_context(text),public.list_supper_monitorings(text),public.supper_review_action(text,uuid,integer,text,text),public.supper_audit_history(text,uuid) to anon,authenticated;
revoke all on function public.upload_supper_pdf(text,uuid,integer,jsonb,text,text),public.read_supper_pdf_version(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.upload_supper_pdf(text,uuid,integer,jsonb,text,text),public.read_supper_pdf_version(text,uuid,integer),public.supper_context(text) to service_role;
commit;
