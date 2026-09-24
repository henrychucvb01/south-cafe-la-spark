begin;
-- Additive upgrade: keep the first three deployed migrations unchanged.
alter table public.supper_monitorings
 add column uploaded_on_behalf boolean not null default false,
 add column manager_employee_id bigint references public.employees(id),
 add column submitted_by_name text,
 add column submitted_by_role text check(submitted_by_role in ('manager','supervisor'));
update public.supper_monitorings set submitted_by_name=created_by_name,submitted_by_role=monitor_role where submitted_at is not null;

create or replace function public.supper_assert_editor(s public.supper_monitoring_sessions,m public.supper_monitorings) returns void language plpgsql set search_path=public,pg_temp as $$
begin
 if s.actor_role='supervisor' then return; end if;
 if m.monitor_role='manager' and m.uploaded_on_behalf and (m.manager_employee_id is null or m.manager_employee_id=s.employee_id) then return; end if;
 if m.monitor_role<>'manager' or m.uploaded_on_behalf or (not s.covering and m.created_by_employee_id is distinct from s.employee_id) or (s.covering and (m.created_by_employee_id is not null or m.created_by_name<>s.monitor_name)) then raise exception 'Only the creator, assigned Manager or Supervisor can edit this monitoring.'; end if;
end $$;
create function public.supper_school_managers(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'supervisor' then raise exception 'Supervisor authorization required.'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'employee_name',employee_name) order by employee_name),'[]') from public.employees where location_id=s.location_id and active=true);
end $$;

create or replace function public.upload_supper_pdf(p_token text,p_id uuid,p_revision integer,p_metadata jsonb,p_pdf_base64 text,p_pdf_sha256 text) returns public.supper_monitorings language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;m public.supper_monitorings;d date;old text;v_role text;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if p_id is null then
  -- OFF blocks new uploads, not corrections to existing uploaded monitorings.
  if s.actor_role='manager' and not (select allow_manager_uploads from public.supper_monitoring_settings where singleton for share) then raise exception 'New manager PDF uploads are turned off. Start a guided monitoring instead.'; end if;
  if s.actor_role='supervisor' and coalesce(p_metadata->>'onBehalf','false')<>'true' then raise exception 'Use Upload Existing Monitoring for a Manager slot, or Start Supervisor Monitoring for your own visit.'; end if;
  if s.actor_role<>'supervisor' and coalesce(p_metadata->>'onBehalf','false')='true' then raise exception 'Supervisor authorization required for uploads on behalf of a school.'; end if;
  v_role:='manager';
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
 if p_id is null and s.actor_role='supervisor' and nullif(p_metadata->>'managerEmployeeId','') is not null and not exists(select 1 from public.employees where id=(p_metadata->>'managerEmployeeId')::bigint and location_id=s.location_id and active=true) then raise exception 'Choose a Manager assigned to this school.'; end if;
 if p_id is null then
  insert into public.supper_monitorings(location_id,created_by_employee_id,created_by_name,monitor_role,source,status,locked,monitoring_date,school_year,monitoring_slot,payload,template_version,submitted_at,uploaded_on_behalf,manager_employee_id,submitted_by_name,submitted_by_role)
   values(s.location_id,s.employee_id,s.monitor_name,v_role,'uploaded','draft',false,d,p_metadata->>'schoolYear',p_metadata->>'monitoringSlot',p_metadata,'uploaded-original',now(),s.actor_role='supervisor',case when s.actor_role='supervisor' then nullif(p_metadata->>'managerEmployeeId','')::bigint else null end,s.monitor_name,s.actor_role) returning * into m;
  p_id:=m.id;
 else
  update public.supper_monitorings set payload=p_metadata,source='uploaded',monitoring_date=d,school_year=p_metadata->>'schoolYear',monitoring_slot=p_metadata->>'monitoringSlot',revision=revision+1,updated_at=now() where id=p_id returning * into m;
 end if;
 perform public.supper_store_pdf(p_id,p_pdf_base64,p_pdf_sha256);
 update public.supper_monitorings set status=case when old in ('accepted','completed') and s.actor_role='supervisor' then old when v_role='supervisor' then 'completed' when old is null then 'submitted' else 'corrections_requested' end,
 locked=(v_role='supervisor' or coalesce(old in ('accepted','completed') and s.actor_role='supervisor',false)),template_version='uploaded-original' where id=p_id returning * into m;
 perform public.supper_event(m,s,case when old is null then 'Uploaded' else 'PDF Replaced' end,old);
 if old is null then
  if s.actor_role='supervisor' then perform public.supper_event(m,s,'Uploaded by Supervisor on behalf of school/Manager',null,p_metadata->>'monitorName'); end if;
  perform public.supper_event(m,s,'Submitted',null);
 end if;
 return m;
exception when unique_violation then raise exception 'This school-year monitoring slot already exists. Replace its PDF or select another slot.';
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
 update public.supper_monitorings set status=case when monitor_role='supervisor' then 'completed' else 'submitted' end,locked=(monitor_role='supervisor'),submitted_at=now(),submitted_by_name=s.monitor_name,submitted_by_role=s.actor_role,updated_at=now(),revision=revision+1,template_version=p_template_version,current_section=8 where id=p_id returning * into m;
 perform public.supper_event(m,s,case when old='corrections_requested' then 'Resubmitted' else 'Submitted' end,old);
 return m;
end $$;
create or replace function public.supper_review_action(p_token text,p_id uuid,p_revision integer,p_action text,p_comment text default '') returns public.supper_monitorings language plpgsql security definer set search_path=public,pg_temp as $$
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
  update public.supper_monitorings set status='submitted',submitted_at=now(),submitted_by_name=s.monitor_name,submitted_by_role=s.actor_role where id=p_id;
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
-- Markup is stored alongside the immutable PDF version, never burned into the original.
create table public.supper_pdf_reviews (
 id bigint generated always as identity primary key,
 monitoring_id uuid not null,
 document_version integer not null,
 record_revision integer not null,
 page_count integer not null check(page_count between 1 and 20),
 annotations jsonb not null check(jsonb_typeof(annotations)='array' and octet_length(annotations::text)<=500000),
 comments text not null default '',
 actor_name text not null,
 created_at timestamptz not null default now(),
 foreign key(monitoring_id,document_version) references public.supper_monitoring_document_versions(monitoring_id,version)
);
create index supper_pdf_reviews_version_idx on public.supper_pdf_reviews(monitoring_id,document_version,id desc);
alter table public.supper_pdf_reviews enable row level security;
revoke all on public.supper_pdf_reviews from public,anon,authenticated;

create function public.supper_pdf_reviews_for_record(p_token text,p_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.get_supper_monitoring(p_token,p_id);
 return (select coalesce(jsonb_agg(to_jsonb(r) order by document_version desc),'[]') from
 (select distinct on(document_version) * from public.supper_pdf_reviews where monitoring_id=p_id order by document_version,id desc) r);
end $$;

create function public.save_supper_pdf_review(p_token text,p_id uuid,p_revision integer,p_document_version integer,p_page_count integer,p_annotations jsonb,p_comment text,p_action text default 'save') returns public.supper_monitorings language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;m public.supper_monitorings;a jsonb;point jsonb;k text;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'supervisor' then raise exception 'Supervisor authorization required.'; end if;
 select * into m from public.supper_monitorings where id=p_id and location_id=s.location_id for update;
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
 insert into public.supper_pdf_reviews(monitoring_id,document_version,record_revision,page_count,annotations,comments,actor_name)
 values(m.id,m.document_version,m.revision,p_page_count,p_annotations,coalesce(p_comment,''),s.monitor_name);
 update public.supper_monitorings set revision=revision+1,review_comments=coalesce(p_comment,''),updated_at=now() where id=m.id returning * into m;
 perform public.supper_event(m,s,'PDF comments and markup saved',m.status,p_comment);
 if p_action<>'save' then m:=public.supper_review_action(p_token,m.id,m.revision,p_action,p_comment); end if;
 return m;
end $$;

create or replace function public.read_supper_pdf_version(p_token text,p_id uuid,p_version integer) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;b bytea;
begin
 s:=public.require_supper_monitoring_session(p_token);
 perform public.get_supper_monitoring(p_token,p_id);
 if s.actor_role<>'supervisor' and not exists(select 1 from public.supper_pdf_reviews where monitoring_id=p_id and document_version=p_version) then raise exception 'Supervisor authorization required for unreviewed historical versions.'; end if;
 select pdf_bytes into b from public.supper_monitoring_document_versions where monitoring_id=p_id and version=p_version;
 if b is null then raise exception 'Stored version is unavailable.'; end if;
 return encode(b,'base64');
end $$;
revoke all on function public.supper_school_managers(text),public.supper_pdf_reviews_for_record(text,uuid),public.save_supper_pdf_review(text,uuid,integer,integer,integer,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.supper_school_managers(text),public.supper_pdf_reviews_for_record(text,uuid) to anon,authenticated;
grant execute on function public.save_supper_pdf_review(text,uuid,integer,integer,integer,jsonb,text,text) to service_role;
commit;
