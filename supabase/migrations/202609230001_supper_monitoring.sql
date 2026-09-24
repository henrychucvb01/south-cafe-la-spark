begin;

-- PIN-based SPARK has no auth.uid() manager session. Never authorize this tool
-- using a client-selected school ID alone. All access goes through scoped RPCs.
create table public.supper_monitoring_sessions (
  token_hash text primary key,
  location_id bigint not null references public.locations(id),
  employee_id bigint references public.employees(id),
  monitor_name text not null,
  covering boolean not null default false,
  expires_at timestamptz not null default now() + interval '2 hours'
);
create table public.supper_monitoring_attempts (
  id bigint generated always as identity primary key,
  location_id bigint not null,
  employee_key text not null,
  attempted_at timestamptz not null default now()
);
create index supper_attempts_rate_idx on public.supper_monitoring_attempts(location_id, employee_key, attempted_at);
create table public.supper_monitorings (
  id uuid primary key default gen_random_uuid(),
  location_id bigint not null references public.locations(id),
  created_by_employee_id bigint references public.employees(id),
  created_by_name text not null,
  monitor_role text not null default 'manager' check (monitor_role in ('manager','supervisor')),
  status text not null default 'draft' check (status in ('draft','completed')),
  school_year text,
  monitoring_date date,
  current_section integer not null default 0 check (current_section between 0 and 9),
  schema_version integer not null default 1 check (schema_version = 1),
  template_version text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 500000),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  pdf_storage_path text,
  pdf_sha256 text,
  replaces_monitoring_id uuid references public.supper_monitorings(id),
  check (status <> 'completed' or (submitted_at is not null and template_version is not null and pdf_storage_path is not null and pdf_sha256 is not null))
);
create index supper_monitorings_school_idx on public.supper_monitorings(location_id, status, monitoring_date desc);
alter table public.supper_monitoring_sessions enable row level security;
alter table public.supper_monitoring_attempts enable row level security;
alter table public.supper_monitorings enable row level security;
revoke all on public.supper_monitoring_sessions, public.supper_monitoring_attempts, public.supper_monitorings from anon, authenticated;

create function public.open_supper_monitoring_session(p_location_id bigint, p_employee_id bigint, p_pin text, p_covering_name text default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text; v_token text; v_key text := coalesce(p_employee_id::text, 'covering');
begin
  -- Serialize attempts per identity/location so parallel requests cannot bypass
  -- the limit. Return null on failed PIN so the attempt is not rolled back.
  perform pg_advisory_xact_lock(hashtextextended(p_location_id::text || ':' || v_key, 0));
  delete from public.supper_monitoring_attempts where attempted_at < now() - interval '1 day';
  delete from public.supper_monitoring_sessions where expires_at < now();
  if (select count(*) from public.supper_monitoring_attempts where location_id=p_location_id and employee_key=v_key and attempted_at > now() - interval '15 minutes') >= 10 then return null; end if;
  insert into public.supper_monitoring_attempts(location_id, employee_key) values (p_location_id, v_key);
  if not exists(select 1 from public.locations where id=p_location_id and active=true) then return null; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then return null; end if;
  if p_employee_id is null then
    if public.verify_covering_pin(p_pin) is not true then return null; end if;
    v_name := trim(coalesce(p_covering_name, ''));
    if char_length(v_name) not between 3 and 160 then return null; end if;
  else
    select employee_name into v_name from public.employees where id=p_employee_id and location_id=p_location_id and active=true;
    if v_name is null or public.verify_manager_pin(p_employee_id::text, p_pin) is not true then return null; end if;
  end if;
  v_token := gen_random_uuid()::text || gen_random_uuid()::text;
  insert into public.supper_monitoring_sessions(token_hash,location_id,employee_id,monitor_name,covering)
    values(encode(sha256(convert_to(v_token,'UTF8')),'hex'),p_location_id,p_employee_id,v_name,p_employee_id is null);
  return v_token;
end $$;

create function public.require_supper_monitoring_session(p_token text)
returns public.supper_monitoring_sessions language plpgsql security definer set search_path = public, pg_temp as $$
declare v_session public.supper_monitoring_sessions;
begin
  select * into v_session from public.supper_monitoring_sessions where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at > now();
  if v_session.token_hash is null then raise exception 'Session expired. Re-enter your SPARK PIN to continue.'; end if;
  if not exists(select 1 from public.locations where id=v_session.location_id and active=true) then raise exception 'School access is no longer active.'; end if;
  if not v_session.covering and not exists(select 1 from public.employees where id=v_session.employee_id and location_id=v_session.location_id and active=true) then raise exception 'Manager is no longer assigned to this school.'; end if;
  return v_session;
end $$;

create function public.close_supper_monitoring_session(p_token text)
returns void language sql security definer set search_path = public, pg_temp as $$
  delete from public.supper_monitoring_sessions where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
$$;

create function public.list_supper_monitorings(p_token text)
returns table(id uuid, school_year text, monitoring_date date, status text, monitor_name text, submitted_at timestamptz, updated_at timestamptz, current_section integer, revision integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_session public.supper_monitoring_sessions;
begin
  v_session := public.require_supper_monitoring_session(p_token);
  return query select m.id,m.school_year,m.monitoring_date,m.status,coalesce(nullif(m.payload->>'monitorName',''),m.created_by_name),m.submitted_at,m.updated_at,m.current_section,m.revision
    from public.supper_monitorings m where m.location_id=v_session.location_id order by m.updated_at desc;
end $$;

create function public.get_supper_monitoring(p_token text, p_id uuid)
returns public.supper_monitorings language plpgsql security definer set search_path = public, pg_temp as $$
declare v_session public.supper_monitoring_sessions; v_record public.supper_monitorings;
begin
  v_session := public.require_supper_monitoring_session(p_token);
  select * into v_record from public.supper_monitorings where id=p_id and location_id=v_session.location_id;
  if v_record.id is null then raise exception 'Monitoring not found for this school.'; end if;
  return v_record;
end $$;

create function public.save_supper_monitoring_draft(p_token text, p_id uuid, p_revision integer, p_section integer, p_payload jsonb)
returns public.supper_monitorings language plpgsql security definer set search_path = public, pg_temp as $$
declare v_session public.supper_monitoring_sessions; v_record public.supper_monitorings; v_date date; v_year integer; v_field text; v_item jsonb; v_signature jsonb; v_stroke jsonb; v_point jsonb;
begin
  v_session := public.require_supper_monitoring_session(p_token);
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
  if p_id is null then
    insert into public.supper_monitorings(location_id,created_by_employee_id,created_by_name,current_section,payload,monitoring_date,school_year)
      values(v_session.location_id,v_session.employee_id,v_session.monitor_name,p_section,p_payload,v_date,case when v_date is not null then v_year::text || '-' || right((v_year+1)::text,2) end) returning * into v_record;
  else
    update public.supper_monitorings set payload=p_payload,current_section=p_section,monitoring_date=v_date,
      school_year=case when v_date is not null then v_year::text || '-' || right((v_year+1)::text,2) end,
      revision=revision+1,updated_at=now()
      where id=p_id and location_id=v_session.location_id and status='draft' and revision=p_revision returning * into v_record;
    if v_record.id is null then raise exception 'Draft changed in another session, is completed, or is unavailable. Reopen it before saving; your changes have not overwritten it.'; end if;
  end if;
  return v_record;
end $$;

-- Fail closed until the exact official form and server-side completion/PDF
-- validation are implemented. No browser may set completed status directly.
create function public.submit_supper_monitoring(p_token text, p_id uuid, p_revision integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.get_supper_monitoring(p_token,p_id);
  raise exception 'Submission is unavailable until the official two-page form and PDF mapping have been verified. Your draft is preserved.';
end $$;

revoke all on function public.require_supper_monitoring_session(text) from public, anon, authenticated;
revoke all on function public.open_supper_monitoring_session(bigint,bigint,text,text), public.close_supper_monitoring_session(text), public.list_supper_monitorings(text), public.get_supper_monitoring(text,uuid), public.save_supper_monitoring_draft(text,uuid,integer,integer,jsonb), public.submit_supper_monitoring(text,uuid,integer) from public;
grant execute on function public.open_supper_monitoring_session(bigint,bigint,text,text), public.close_supper_monitoring_session(text), public.list_supper_monitorings(text), public.get_supper_monitoring(text,uuid), public.save_supper_monitoring_draft(text,uuid,integer,integer,jsonb), public.submit_supper_monitoring(text,uuid,integer) to anon, authenticated;

commit;
