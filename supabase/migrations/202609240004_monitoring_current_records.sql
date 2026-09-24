begin;
-- Monitoring-only cleanup: preserves current PDFs and completed records from all years.
-- Intentionally removes old PDF copies, change logs, and already-deleted records.
-- Legacy RPC names remain compatibility adapters; record/document storage is generic.
insert into public.monitoring_types(code,label,enabled) values('snack','Snack',false);

drop function public.supper_audit_history(text,uuid);
drop function public.read_supper_pdf_version(text,uuid,integer);
drop function public.supper_event(public.supper_monitorings,public.supper_monitoring_sessions,text,text,text);
drop table public.supper_monitoring_events;
alter table public.supper_pdf_reviews drop constraint supper_pdf_reviews_monitoring_id_document_version_fkey;
-- Keep only the latest review of the current PDF, never annotations on old bytes.
delete from public.supper_pdf_reviews r where not exists(select 1 from public.supper_monitorings m where m.id=r.monitoring_id and m.document_version=r.document_version and m.current_pdf_available)
 or exists(select 1 from public.supper_pdf_reviews newer where newer.monitoring_id=r.monitoring_id and newer.document_version=r.document_version and newer.id>r.id);
drop table public.supper_monitoring_document_versions;
alter table public.supper_monitorings rename to monitoring_records;
alter table public.supper_monitoring_documents rename to monitoring_documents;
alter table public.supper_pdf_reviews rename to monitoring_pdf_review;
alter table public.supper_monitoring_settings rename to monitoring_settings;
alter table public.monitoring_records drop column replaces_monitoring_id;
alter table public.monitoring_documents drop constraint supper_monitoring_documents_monitoring_id_fkey;
alter table public.monitoring_documents add foreign key(monitoring_id) references public.monitoring_records(id) on delete cascade;
alter table public.monitoring_pdf_review add foreign key(monitoring_id) references public.monitoring_records(id) on delete cascade;
alter table public.monitoring_pdf_review add unique(monitoring_id);
delete from public.monitoring_records where status='deleted';
alter table public.monitoring_records drop column deleted_at;
alter table public.monitoring_records drop constraint supper_monitorings_status_check;
alter table public.monitoring_records add constraint monitoring_status_check check(status in ('draft','submitted','corrections_requested','accepted','completed'));
alter table public.monitoring_records add column monitoring_number integer check(monitoring_number>0);
update public.monitoring_records set monitoring_number=case monitoring_slot when 'manager_1' then 1 when 'supervisor' then 2 when 'manager_2' then 3 end;
drop index public.monitoring_unique_active_slot;
create unique index monitoring_unique_number on public.monitoring_records(location_id,monitoring_site_id,monitoring_type,school_year,monitoring_number) where monitoring_number is not null;
-- document_version is only a concurrency token; no previous PDF bytes are retained.
comment on column public.monitoring_records.document_version is 'Current PDF generation token used to reject stale markup; not retained version history.';

create function public.monitoring_metadata(p_date date,p_year text,p_slot text,p_role text,p_type text,p_number text) returns void language plpgsql set search_path=public,pg_temp as $$
declare y integer;
begin
 if p_type='supper' then perform public.supper_metadata(p_date,p_year,p_slot,p_role); return; end if;
 if p_type not in ('breakfast','lunch','snack') then raise exception 'Choose a supported monitoring type.'; end if;
 if p_role not in ('manager','supervisor') then raise exception 'Choose a supported performer role.'; end if;
 if p_year is null or p_year !~ '^[0-9]{4}-[0-9]{2}$' or right(((left(p_year,4)::integer)+1)::text,2)<>right(p_year,2) then raise exception 'Choose a valid school year.'; end if;
 if p_date is not null then
  y:=extract(year from p_date)::integer-case when extract(month from p_date)<7 then 1 else 0 end;
  if p_year<>y::text||'-'||right((y+1)::text,2) then raise exception 'Monitoring date must be in the selected school year.'; end if;
 end if;
 if p_number is null or p_number !~ '^[1-9][0-9]*$' then raise exception 'Enter a positive monitoring number.'; end if;
end $$;
revoke all on function public.monitoring_metadata(date,text,text,text,text,text) from public,anon,authenticated;

create or replace function public.set_supper_uploads(p_pin text,p_enabled boolean) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if public.verify_supervisor_pin(p_pin) is not true then raise exception 'Supervisor authorization failed.'; end if;
 if p_enabled is null then raise exception 'Choose On or Off.'; end if;
 update public.monitoring_settings set allow_manager_uploads=p_enabled,updated_at=now() where singleton;
 return p_enabled;
end $$;

create or replace function public.get_supper_monitoring(p_token text,p_id uuid) returns public.monitoring_records language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;m public.monitoring_records;
begin s:=public.require_supper_monitoring_session(p_token);
 select * into m from public.monitoring_records where id=p_id and location_id=s.location_id;
 if m.id is null then raise exception 'Monitoring not found for this school.'; end if; return m; end $$;

create or replace function public.list_supper_monitorings(p_token text) returns setof public.monitoring_records language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin s:=public.require_supper_monitoring_session(p_token);
 return query select * from public.monitoring_records where location_id=s.location_id order by updated_at desc; end $$;

create or replace function public.save_supper_monitoring_draft(p_token text,p_id uuid,p_revision integer,p_section integer,p_payload jsonb) returns public.monitoring_records language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.supper_monitoring_sessions; v_record public.monitoring_records; v_date date; v_year integer; v_field text; v_item jsonb; v_signature jsonb; v_stroke jsonb; v_point jsonb; v_role text;
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

 if coalesce(p_payload->>'monitoringType','supper')<>'supper' then raise exception 'This guided monitoring workflow is not available yet.'; end if;
 v_role:=v_session.actor_role;
 if p_id is not null then
  select * into v_record from public.monitoring_records where id=p_id and location_id=v_session.location_id for update;
  if v_record.id is null then raise exception 'Monitoring not found for this school.'; end if;
  perform public.supper_assert_editor(v_session,v_record);
  if v_record.locked or v_record.status not in ('draft','corrections_requested') or v_record.source<>'generated' then raise exception 'Monitoring is read-only. A Supervisor must unlock it for correction.'; end if;
  if p_revision is distinct from v_record.revision then raise exception 'Draft changed in another session. Reopen before saving.'; end if;
  v_role:=v_record.monitor_role;
 end if;
 perform public.supper_metadata(v_date,p_payload->>'schoolYear',p_payload->>'monitoringSlot',v_role);
 if p_id is null then
  insert into public.monitoring_records(location_id,created_by_employee_id,created_by_name,monitor_role,current_section,payload,monitoring_date,school_year,monitoring_slot)
   values(v_session.location_id,v_session.employee_id,v_session.monitor_name,v_role,p_section,p_payload,v_date,p_payload->>'schoolYear',p_payload->>'monitoringSlot') returning * into v_record;
 else
  update public.monitoring_records set payload=p_payload,current_section=p_section,monitoring_date=v_date,school_year=p_payload->>'schoolYear',monitoring_slot=p_payload->>'monitoringSlot',revision=revision+1,updated_at=now() where id=p_id returning * into v_record;
 end if;
 return v_record;
exception when unique_violation then raise exception 'This school-year monitoring slot already exists. Resume it or select another slot.';
end $$;

create or replace function public.supper_store_pdf(p_id uuid,p_encoded text,p_hash text) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare b bytea;v integer;
begin
 if p_encoded is null or length(p_encoded)>2800000 then raise exception 'PDF must be no larger than 2 MB.'; end if;
 b:=decode(p_encoded,'base64');
 if octet_length(b) not between 100 and 2097152 or substring(b from 1 for 5)<>convert_to('%PDF-','UTF8') or encode(sha256(b),'hex') is distinct from p_hash then raise exception 'PDF integrity check failed.'; end if;
 select document_version+1 into v from public.monitoring_records where id=p_id for update;
 delete from public.monitoring_pdf_review where monitoring_id=p_id;
 insert into public.monitoring_documents(monitoring_id,pdf_bytes,sha256) values(p_id,b,p_hash) on conflict(monitoring_id) do update set pdf_bytes=excluded.pdf_bytes,sha256=excluded.sha256,created_at=now();
 update public.monitoring_records set document_version=v,pdf_storage_path='db:monitoring_documents/'||p_id::text,pdf_sha256=p_hash where id=p_id;
 return v;
end $$;

create or replace function public.upload_supper_pdf(p_token text,p_id uuid,p_revision integer,p_metadata jsonb,p_pdf_base64 text,p_pdf_sha256 text) returns public.monitoring_records language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;m public.monitoring_records;d date;old text;v_role text;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if p_id is null then
  -- OFF blocks new uploads, not corrections to existing uploaded monitorings.
  if s.actor_role='manager' and not (select allow_manager_uploads from public.monitoring_settings where singleton for share) then raise exception 'New manager PDF uploads are turned off. Start a guided monitoring instead.'; end if;
  if s.actor_role='supervisor' and coalesce(p_metadata->>'onBehalf','false')<>'true' then raise exception 'Use Upload Existing Monitoring for a Manager slot, or Start Supervisor Monitoring for your own visit.'; end if;
  if s.actor_role<>'supervisor' and coalesce(p_metadata->>'onBehalf','false')='true' then raise exception 'Supervisor authorization required for uploads on behalf of a school.'; end if;
  v_role:=case when coalesce(p_metadata->>'monitoringType','supper')='supper' or s.actor_role='manager' then 'manager' else coalesce(p_metadata->>'performerRole','manager') end;
 else
  select * into m from public.monitoring_records where id=p_id and location_id=s.location_id for update;
  if m.id is null then raise exception 'Monitoring not found for this school.'; end if;
  perform public.supper_assert_editor(s,m);
  if m.locked or m.status not in ('draft','corrections_requested') or (s.actor_role='manager' and m.source<>'uploaded') then raise exception 'This monitoring cannot be replaced. A Supervisor must unlock it.'; end if;
  if p_revision is distinct from m.revision then raise exception 'Monitoring revision changed. Reopen before replacing.'; end if;
  old:=m.status;v_role:=m.monitor_role;
 end if;
 if p_metadata->>'monitoringDate' is null or p_metadata->>'monitoringDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Enter a monitoring date.'; end if;
 d:=(p_metadata->>'monitoringDate')::date;
 perform public.monitoring_metadata(d,p_metadata->>'schoolYear',p_metadata->>'monitoringSlot',v_role,coalesce(p_metadata->>'monitoringType','supper'),p_metadata->>'monitoringNumber');
 if char_length(trim(coalesce(p_metadata->>'monitorName',''))) not between 1 and 160 then raise exception 'Enter the monitor name.'; end if;
 if p_id is null and s.actor_role='supervisor' and nullif(p_metadata->>'managerEmployeeId','') is not null and not exists(select 1 from public.employees where id=(p_metadata->>'managerEmployeeId')::bigint and location_id=s.location_id and active=true) then raise exception 'Choose a Manager assigned to this school.'; end if;
 if p_id is null then
  insert into public.monitoring_records(location_id,created_by_employee_id,created_by_name,monitor_role,source,status,locked,monitoring_date,school_year,monitoring_slot,payload,template_version,submitted_at,uploaded_on_behalf,manager_employee_id,submitted_by_name,submitted_by_role)
   values(s.location_id,s.employee_id,s.monitor_name,v_role,'uploaded','draft',false,d,p_metadata->>'schoolYear',p_metadata->>'monitoringSlot',p_metadata,'uploaded-original',now(),s.actor_role='supervisor',case when s.actor_role='supervisor' then nullif(p_metadata->>'managerEmployeeId','')::bigint else null end,s.monitor_name,s.actor_role) returning * into m;
  p_id:=m.id;
 else
  update public.monitoring_records set payload=p_metadata,source='uploaded',monitoring_date=d,school_year=p_metadata->>'schoolYear',monitoring_slot=p_metadata->>'monitoringSlot',revision=revision+1,updated_at=now() where id=p_id returning * into m;
 end if;
 perform public.supper_store_pdf(p_id,p_pdf_base64,p_pdf_sha256);
 update public.monitoring_records set status=case when old is null then 'submitted' else 'corrections_requested' end,
 locked=false,template_version='uploaded-original' where id=p_id returning * into m;

 return m;
exception when unique_violation then raise exception 'This school-year monitoring slot already exists. Replace its PDF or select another slot.';
end $$;

create or replace function public.finalize_supper_monitoring(p_token text,p_id uuid,p_revision integer,p_template_version text,p_pdf_base64 text,p_pdf_sha256 text) returns public.monitoring_records language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;m public.monitoring_records;old text;
begin
 s:=public.require_supper_monitoring_session(p_token);
 select * into m from public.monitoring_records where id=p_id and location_id=s.location_id for update;
 if m.id is null then raise exception 'Monitoring not found for this school.'; end if;
 perform public.supper_assert_editor(s,m);
 if m.status in ('submitted','accepted','completed') then return m; end if;
 if m.locked or m.status not in ('draft','corrections_requested') or m.source<>'generated' then raise exception 'Monitoring is read-only.'; end if;
 if p_revision is distinct from m.revision then raise exception 'Draft revision changed. Reopen before submitting.'; end if;
 if m.monitoring_type<>'supper' then raise exception 'This guided monitoring workflow is not available yet.'; end if;
 if p_template_version is distinct from 'lausd-supper-2022-09-08' then raise exception 'Unverified report template.'; end if;
 perform public.supper_metadata(m.monitoring_date,m.school_year,m.monitoring_slot,m.monitor_role);
 if m.monitoring_date is null then raise exception 'Enter a monitoring date.'; end if;
 old:=m.status;
 perform public.supper_store_pdf(p_id,p_pdf_base64,p_pdf_sha256);
 update public.monitoring_records set status=case when monitor_role='supervisor' then 'completed' else 'submitted' end,locked=(monitor_role='supervisor'),submitted_at=now(),submitted_by_name=s.monitor_name,submitted_by_role=s.actor_role,updated_at=now(),revision=revision+1,template_version=p_template_version,current_section=8 where id=p_id returning * into m;
 return m;
end $$;

create or replace function public.supper_review_action(p_token text,p_id uuid,p_revision integer,p_action text,p_comment text default '') returns public.monitoring_records language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;m public.monitoring_records;old text;
begin
 s:=public.require_supper_monitoring_session(p_token);
 select * into m from public.monitoring_records where id=p_id and location_id=s.location_id for update;
 if m.id is null then raise exception 'Monitoring not found for this school.'; end if;
 if p_revision is distinct from m.revision then raise exception 'Monitoring revision changed. Reopen before continuing.'; end if;

 old:=m.status;
 if length(coalesce(p_comment,''))>4000 then raise exception 'Comment is too long.'; end if;
 if p_action='resubmit' then
  perform public.supper_assert_editor(s,m);
  if m.source<>'uploaded' or m.status<>'corrections_requested' or m.locked or m.document_version=0 then raise exception 'No corrected uploaded PDF is ready to resubmit.'; end if;
  update public.monitoring_records set status='submitted',submitted_at=now(),submitted_by_name=s.monitor_name,submitted_by_role=s.actor_role where id=p_id;
 else
  if s.actor_role<>'supervisor' then raise exception 'Supervisor authorization required.'; end if;
  if p_action in ('return','unlock','comment') and trim(coalesce(p_comment,''))='' then raise exception 'Add a comment explaining this action.'; end if;
  if p_action='accept' then
   if (m.monitoring_type='supper' and m.monitor_role='supervisor') or m.status<>'submitted' or m.document_version=0 then raise exception 'Only a submitted manager monitoring can be accepted.'; end if;
   update public.monitoring_records set status='accepted',locked=true,accepted_at=now(),review_comments=coalesce(p_comment,'') where id=p_id;
  elsif p_action in ('return','unlock') then
   if (p_action='return' and m.status<>'submitted') or (p_action='unlock' and not m.locked) then raise exception 'This action is unavailable for the current status.'; end if;
   update public.monitoring_records set status='corrections_requested',locked=false,review_comments=p_comment,payload=case when source='generated' then jsonb_set(payload,'{signatures}','{"monitor":null,"coordinator":null}') else payload end where id=p_id;
  elsif p_action='delete' then
   delete from public.monitoring_records where id=p_id;
   return null;
  elsif p_action='comment' then
   if m.locked then raise exception 'Unlock the monitoring before changing it.'; end if;
   update public.monitoring_records set review_comments=p_comment where id=p_id;
  else raise exception 'Choose a supported action.'; end if;
 end if;
 update public.monitoring_records set revision=revision+1,updated_at=now() where id=p_id returning * into m;
 return m;
end $$;

create or replace function public.supper_pdf_reviews_for_record(p_token text,p_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.get_supper_monitoring(p_token,p_id);
 return (select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.monitoring_pdf_review r where monitoring_id=p_id);
end $$;

create or replace function public.save_supper_pdf_review(p_token text,p_id uuid,p_revision integer,p_document_version integer,p_page_count integer,p_annotations jsonb,p_comment text,p_action text default 'save') returns public.monitoring_records language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;m public.monitoring_records;a jsonb;point jsonb;k text;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'supervisor' then raise exception 'Supervisor authorization required.'; end if;
 select * into m from public.monitoring_records where id=p_id and location_id=s.location_id for update;
 if m.id is null then raise exception 'Monitoring not found for this school.'; end if;
 if m.revision is distinct from p_revision or m.document_version is distinct from p_document_version then raise exception 'PDF or monitoring revision changed. Reopen before reviewing.'; end if;
 if m.locked or m.status not in ('submitted','corrections_requested') or m.document_version=0 then raise exception 'This PDF review is read-only. Unlock the monitoring before changing it.'; end if;
 if p_action is null or p_action not in ('save','return','accept') then raise exception 'Choose a supported review action.'; end if;
 if p_page_count is null or p_page_count not between 1 and 20 then raise exception 'Invalid PDF page count.'; end if;
 if length(coalesce(p_comment,''))>4000 then raise exception 'Comment is too long.'; end if;
 if jsonb_typeof(p_annotations) is distinct from 'array' or octet_length(p_annotations::text)>500000 then raise exception 'Invalid PDF markup.'; end if;
 if jsonb_array_length(p_annotations)>200 then raise exception 'Use at most 200 PDF marks.'; end if;
 for a in select value from jsonb_array_elements(p_annotations) loop
  if jsonb_typeof(a) is distinct from 'object' or a->>'type' is null or a->>'type' not in ('comment','draw') then raise exception 'Invalid PDF mark type.'; end if;
  if jsonb_typeof(a->'page') is distinct from 'number' or a->>'page' !~ '^[0-9]{1,2}$' then raise exception 'Invalid markup page.'; end if;
  if (a->>'page')::integer not between 1 and p_page_count then raise exception 'Markup page is outside this PDF.'; end if;
  if a->>'type'='comment' then
   foreach k in array array['x','y'] loop
    if jsonb_typeof(a->k) is distinct from 'number' then raise exception 'Invalid marker position.'; end if;
    if (a->>k)::numeric not between 0 and 1 then raise exception 'Marker is outside the PDF.'; end if;
   end loop;
   if jsonb_typeof(a->'text') is distinct from 'string' or length(trim(a->>'text')) not between 1 and 2000 then raise exception 'Enter a location comment up to 2000 characters.'; end if;
  else
   if jsonb_typeof(a->'points') is distinct from 'array' then raise exception 'Invalid drawing points.'; end if;
   if jsonb_array_length(a->'points') not between 2 and 1000 then raise exception 'Use 2 to 1000 points per drawing.'; end if;
   for point in select value from jsonb_array_elements(a->'points') loop
    if jsonb_typeof(point) is distinct from 'array' then raise exception 'Invalid drawing point.'; end if;
    if jsonb_array_length(point)<>2 or jsonb_typeof(point->0) is distinct from 'number' or jsonb_typeof(point->1) is distinct from 'number' then raise exception 'Invalid drawing point.'; end if;
    if (point->>0)::numeric not between 0 and 1 or (point->>1)::numeric not between 0 and 1 then raise exception 'Drawing is outside the PDF.'; end if;
   end loop;
  end if;
 end loop;
 insert into public.monitoring_pdf_review(monitoring_id,document_version,record_revision,page_count,annotations,comments,actor_name)
 values(m.id,m.document_version,m.revision,p_page_count,p_annotations,coalesce(p_comment,''),s.monitor_name)
 on conflict(monitoring_id) do update set document_version=excluded.document_version,record_revision=excluded.record_revision,page_count=excluded.page_count,annotations=excluded.annotations,comments=excluded.comments,actor_name=excluded.actor_name,created_at=now();
 update public.monitoring_records set revision=revision+1,review_comments=coalesce(p_comment,''),updated_at=now() where id=m.id returning * into m;
 if p_action<>'save' then m:=public.supper_review_action(p_token,m.id,m.revision,p_action,p_comment); end if;
 return m;
end $$;

create or replace function public.read_supper_monitoring_pdf(p_token text,p_id uuid) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.monitoring_records;b bytea;
begin m:=public.get_supper_monitoring(p_token,p_id);
 select pdf_bytes into b from public.monitoring_documents where monitoring_id=p_id;
 if b is null then raise exception 'Stored report is unavailable.'; end if;return encode(b,'base64'); end $$;

create or replace function public.monitoring_identity_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare site public.monitoring_sites; v_type text; site_id uuid;
begin
 if TG_OP='INSERT' then
  v_type:=coalesce(nullif(NEW.payload->>'monitoringType',''),'supper');
  site_id:=nullif(NEW.payload->>'monitoringSiteId','')::uuid;
  if site_id is null then
   insert into public.monitoring_sites(location_id,name,kind) values(NEW.location_id,'Main Site','main') on conflict do nothing;
   select id into site_id from public.monitoring_sites where location_id=NEW.location_id and kind='main';
  end if;
  if not exists(select 1 from public.monitoring_types where code=v_type) then raise exception 'Choose a supported monitoring type.'; end if;
  if NEW.source='generated' and not exists(select 1 from public.monitoring_types where code=v_type and enabled) then raise exception 'This guided monitoring workflow is not available yet.'; end if;
  NEW.monitoring_type:=v_type;NEW.monitoring_site_id:=site_id;
 else
  if NEW.location_id is distinct from OLD.location_id or NEW.monitoring_type is distinct from OLD.monitoring_type or NEW.monitoring_site_id is distinct from OLD.monitoring_site_id
   or coalesce(nullif(NEW.payload->>'monitoringType',''),OLD.monitoring_type)<>OLD.monitoring_type
   or coalesce(nullif(NEW.payload->>'monitoringSiteId','')::uuid,OLD.monitoring_site_id)<>OLD.monitoring_site_id then
   raise exception 'The school, site and monitoring type cannot be changed on an existing monitoring.';
  end if;
  if NEW.document_version>OLD.document_version then NEW.current_pdf_available:=true; end if;
 end if;
 if NEW.monitoring_type='supper' then
  NEW.monitoring_number:=case NEW.monitoring_slot when 'manager_1' then 1 when 'supervisor' then 2 when 'manager_2' then 3 end;
 else
  NEW.monitoring_slot:=null;
  NEW.monitoring_number:=nullif(NEW.payload->>'monitoringNumber','')::integer;
  if NEW.monitoring_number is null or NEW.monitoring_number<1 then raise exception 'Enter a positive monitoring number.'; end if;
 end if;
 select * into site from public.monitoring_sites where id=NEW.monitoring_site_id and location_id=NEW.location_id;
 if site.id is null then raise exception 'Choose a monitored site belonging to this school.'; end if;
 NEW.monitoring_site_name:=site.name;
 return NEW;
end $$;

create or replace function public.create_monitoring_site(p_token text,p_name text,p_kind text) returns public.monitoring_sites language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;site public.monitoring_sites;
begin s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'supervisor' then raise exception 'Supervisor authorization required to add a monitored site.'; end if;
 if p_kind is null or p_kind not in ('offsite','eec','program') or length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Enter a site/program name and choose Offsite, EEC or Program.'; end if;
 insert into public.monitoring_sites(location_id,name,kind) values(s.location_id,trim(p_name),p_kind) returning * into site;
 return site;
exception when unique_violation then raise exception 'This school already has a site with that name. Select the existing site.';
end $$;

create or replace function public.supper_context(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin s:=public.require_supper_monitoring_session(p_token);
 return jsonb_build_object('actor_role',s.actor_role,'employee_id',s.employee_id,'monitor_name',s.monitor_name,'allow_manager_uploads',(select allow_manager_uploads from public.monitoring_settings where singleton),'monitoring_sites',public.monitoring_sites_for_school(p_token));
end $$;

create or replace function public.supper_supervisor_overview(p_pin text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if public.verify_supervisor_pin(p_pin) is not true then raise exception 'Supervisor authorization failed.'; end if;
 return jsonb_build_object('schools',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'school_name',school_name,'location_code',location_code) order by school_name),'[]') from public.locations where active=true),
 'records',(select coalesce(jsonb_agg(to_jsonb(m)-'payload'),'[]') from public.monitoring_records m join public.locations l on l.id=m.location_id where l.active=true),
 'sites',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.monitoring_sites s join public.locations l on l.id=s.location_id where l.active=true),
 'allow_manager_uploads',(select allow_manager_uploads from public.monitoring_settings where singleton));
end $$;

create or replace function public.restart_monitoring(p_token text,p_id uuid,p_revision integer) returns public.monitoring_records language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;m public.monitoring_records;old_status text;blank jsonb;
begin
 s:=public.require_supper_monitoring_session(p_token);
 select * into m from public.monitoring_records where id=p_id and location_id=s.location_id for update;
 if m.id is null then raise exception 'Monitoring not found for this school.'; end if;
 if s.actor_role<>'manager' then raise exception 'This restart action is for the assigned Manager.'; end if;
 perform public.supper_assert_editor(s,m);
 if m.source<>'generated' or m.monitor_role<>'manager' or m.locked or m.status not in ('draft','corrections_requested') then raise exception 'Only an unlocked Draft or Corrections Requested SPARK monitoring can be restarted. Submitted records must first be returned by the Supervisor.'; end if;
 if m.revision is distinct from p_revision then raise exception 'Monitoring revision changed. Reopen before restarting.'; end if;
 old_status:=m.status;
 -- Server-created blank payload: callers cannot smuggle answers or change assignment.
 blank:=jsonb_build_object('schemaVersion',1,'guidedVersion',3,'schoolYear',m.school_year,'monitoringSlot',m.monitoring_slot,'monitoringType',m.monitoring_type,'monitoringSiteId',m.monitoring_site_id,
 'unannounced',true,'adultMeals','0','serviceTimes','[]'::jsonb,'todayAttendanceConfirmed','','historyVerified','','correctiveActionDue','','followUpRequired',null,'extraFollowUp','','approvedServiceTime','','monitoringDate','','arrivalTime','','departureTime','','serviceStart','','serviceEnd','','programName','','programType','','todayAttendance','','todayMeals','','weekStart','','history','[]'::jsonb,
 'menu',(select jsonb_agg(jsonb_build_object('category',c,'applicable',true,'item','','serving','')) from unnest(array['Milk','Meat/Alternate','Grains/Breads','Fruit','Vegetable','Additional Meat/Alternate','Other']) c),
 'answers','{}'::jsonb,'correctiveActions','{}'::jsonb,'repeatedFindings','','repeatedAction','','comments','','monitorName',m.created_by_name,'coordinatorName','','signatures','{"monitor":null,"coordinator":null}'::jsonb);
 -- Discard the abandoned PDF and its current markup.
 delete from public.monitoring_pdf_review where monitoring_id=m.id;
 delete from public.monitoring_documents where monitoring_id=m.id;
 update public.monitoring_records set payload=blank,status='draft',current_section=0,monitoring_date=null,submitted_at=null,submitted_by_name=null,submitted_by_role=null,accepted_at=null,review_comments='',current_pdf_available=false,pdf_storage_path=null,pdf_sha256=null,revision=revision+1,updated_at=now() where id=m.id returning * into m;
 return m;
end $$;

create or replace function public.supper_assert_editor(s public.supper_monitoring_sessions,m public.monitoring_records) returns void language plpgsql set search_path=public,pg_temp as $$
begin
 if s.actor_role='supervisor' then return; end if;
 if m.monitor_role='manager' and m.uploaded_on_behalf and (m.manager_employee_id is null or m.manager_employee_id=s.employee_id) then return; end if;
 if m.monitor_role<>'manager' or m.uploaded_on_behalf or (not s.covering and m.created_by_employee_id is distinct from s.employee_id) or (s.covering and (m.created_by_employee_id is not null or m.created_by_name<>s.monitor_name)) then raise exception 'Only the creator, assigned Manager or Supervisor can edit this monitoring.'; end if;
end $$;
update public.monitoring_records set pdf_storage_path=replace(pdf_storage_path,'db:supper_monitoring_documents/','db:monitoring_documents/') where pdf_storage_path like 'db:supper_monitoring_documents/%';
commit;
