begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Private school PINs. Defaults are initialized here, never sent to the QR client.
create table public.breakfast_worker_access (
 location_id bigint primary key references public.locations(id),
 pin_hash text not null default extensions.crypt('9999',extensions.gen_salt('bf',10)),
 revision integer not null default 1,
 failures integer not null default 0,
 locked_until timestamptz
);
create table public.breakfast_worker_sessions (
 token uuid primary key default gen_random_uuid(),
 classroom_id uuid not null references public.breakfast_classrooms(id),
 staff_key text not null,
 employee_id bigint references public.employees(id),
 pin_revision integer not null,
 expires_at timestamptz not null default (clock_timestamp()+interval '2 hours')
);
create table public.breakfast_menus (
 location_id bigint not null references public.locations(id),
 service_date date not null,
 items jsonb not null,
 primary key(location_id,service_date)
);
alter table public.breakfast_daily_records
 add column items_sent jsonb not null default '{}',
 add column menu_snapshot jsonb not null default '{}',
 add column worker_notes text not null default '',
 add column worker_name text,
 add column worker_revision integer not null default 0,
 add column packing_revision integer not null default 0;
alter table public.breakfast_worker_access enable row level security;
alter table public.breakfast_worker_sessions enable row level security;
alter table public.breakfast_menus enable row level security;
revoke all on public.breakfast_worker_access,public.breakfast_worker_sessions,public.breakfast_menus from public,anon,authenticated;

create function public.breakfast_valid_items(p_items jsonb,p_labels boolean default false) returns boolean
language sql immutable set search_path=public,pg_temp as $$
 select case when jsonb_typeof(p_items) is distinct from 'object' then false else
 not exists(select 1 from jsonb_each(p_items) x where x.key not in ('Milk','Fruit','Entrée','Other','entree1','entree2','vegan','juice','fruit','milk1','milkNonfat','milkLactaid','other')
 or case when p_labels then jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>160
 else jsonb_typeof(x.value)<>'number' or (x.value#>>'{}')!~'^[0-9]{1,5}$'
 or (x.value#>>'{}')::numeric>10000 end) end
$$;

create function public.breakfast_set_worker_pin(p_token text,p_pin text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.breakfast_require_manager(p_token);
 if p_pin is null or p_pin!~'^[0-9]{4,8}$' then raise exception 'Use a worker PIN with 4 to 8 digits.';end if;
 insert into public.breakfast_worker_access(location_id,pin_hash) values(s.location_id,extensions.crypt(p_pin,extensions.gen_salt('bf',10)))
 on conflict(location_id) do update set pin_hash=excluded.pin_hash,revision=breakfast_worker_access.revision+1,failures=0,locked_until=null;
end $$;

create function public.breakfast_worker_roster(p_location bigint) returns table(id text,name text,employee_id bigint)
language sql stable security definer set search_path=public,pg_temp as $$
 with roster as (
 select sp.id,sp.employee_name,sp.linked_employee_id from public.staffing_positions sp
 where sp.location_id=p_location and sp.active and nullif(trim(sp.employee_name),'') is not null
 and sp.school_year=(select max(school_year) from public.staffing_positions where active)
 )
 select 'staff:'||r.id,r.employee_name,r.linked_employee_id from roster r
 union all
 select 'employee:'||e.id,e.employee_name,e.id from public.employees e where e.location_id=p_location and e.active
 and not exists(select 1 from roster r where r.linked_employee_id=e.id or lower(trim(r.employee_name))=lower(trim(e.employee_name)))
$$;
revoke all on function public.breakfast_worker_roster(bigint) from public,anon,authenticated;

create function public.breakfast_worker_names(p_qr uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.breakfast_classrooms;
begin
 c:=public.breakfast_require_qr(p_qr);
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.breakfast_worker_roster(c.location_id)),'[]');
end $$;

create function public.breakfast_worker_login(p_qr uuid,p_employee text,p_pin text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.breakfast_classrooms;a public.breakfast_worker_access;t uuid;
begin
 c:=public.breakfast_require_qr(p_qr);
 insert into public.breakfast_worker_access(location_id) values(c.location_id) on conflict do nothing;
 select * into a from public.breakfast_worker_access where location_id=c.location_id for update;
 if a.locked_until>clock_timestamp() then return jsonb_build_object('error','Too many attempts. Please wait 15 minutes or contact the cafeteria manager.');end if;
 if a.locked_until is not null then a.failures:=0;end if;
 if p_pin is null or p_pin!~'^[0-9]{4,8}$' or extensions.crypt(p_pin,a.pin_hash)<>a.pin_hash
 or not exists(select 1 from public.breakfast_worker_roster(c.location_id) where id=p_employee) then
  -- Return an error value, not an exception: failed-attempt counters must commit.
  update public.breakfast_worker_access set failures=a.failures+1,locked_until=case when a.failures+1>=5 then clock_timestamp()+interval '15 minutes' end where location_id=c.location_id;
  return jsonb_build_object('error','Name or worker PIN is incorrect.');
 end if;
 update public.breakfast_worker_access set failures=0,locked_until=null where location_id=c.location_id;
 delete from public.breakfast_worker_sessions where expires_at<clock_timestamp();
 insert into public.breakfast_worker_sessions(classroom_id,staff_key,employee_id,pin_revision) select c.id,p_employee,r.employee_id,a.revision from public.breakfast_worker_roster(c.location_id) r where r.id=p_employee returning token into t;
 return jsonb_build_object('token',t);
end $$;

create function public.breakfast_require_worker(p_qr uuid,p_token uuid) returns public.breakfast_worker_sessions
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.breakfast_classrooms;s public.breakfast_worker_sessions;
begin
 c:=public.breakfast_require_qr(p_qr);
 select w.* into s from public.breakfast_worker_sessions w
 join public.breakfast_worker_access a on a.location_id=c.location_id and a.revision=w.pin_revision
 join public.breakfast_worker_roster(c.location_id) r on r.id=w.staff_key
 where w.token=p_token and w.classroom_id=c.id and w.expires_at>clock_timestamp();
 if s.token is null then raise exception 'Worker session expired. Sign in again.';end if;
 return s;
end $$;

create function public.breakfast_worker_page(p_qr uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.breakfast_worker_sessions;c public.breakfast_classrooms;d public.breakfast_daily_records;today date;
begin
 s:=public.breakfast_require_worker(p_qr,p_token);
 select * into c from public.breakfast_classrooms where id=s.classroom_id;
 today:=(clock_timestamp() at time zone 'America/Los_Angeles')::date;
 select * into d from public.breakfast_daily_records where classroom_id=c.id and service_date=today;
 return jsonb_build_object('room',coalesce(d.room_snapshot,c.room_code),'teacher',coalesce(d.teacher_snapshot,c.teacher_name),'service_date',today,
 'sent',d.number_sent,'items_sent',coalesce(d.items_sent,'{}'),'teacher_count',d.teacher_meal_count,'teacher_submitted_at',d.teacher_submitted_at,
 'menu',coalesce(nullif(d.menu_snapshot,'{}'),(select items from public.breakfast_menus where location_id=c.location_id and service_date=today),'{}'),
 'counts',coalesce(d.returned_counts,'{}'),'notes',coalesce(d.worker_notes,''),'revision',coalesce(d.worker_revision,0),
 'submitted_at',d.worker_submitted_at,'worker_name',d.worker_name);
end $$;

create function public.breakfast_worker_submit(p_qr uuid,p_token uuid,p_date date,p_counts jsonb,p_notes text,p_certified boolean,p_revision integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.breakfast_worker_sessions;c public.breakfast_classrooms;d public.breakfast_daily_records;old public.breakfast_daily_records;n text;menu jsonb;
begin
 s:=public.breakfast_require_worker(p_qr,p_token);
 select * into c from public.breakfast_classrooms where id=s.classroom_id;
 if p_date is distinct from (clock_timestamp() at time zone 'America/Los_Angeles')::date then raise exception 'The service date changed. Refresh for today.';end if;
 if p_certified is distinct from true then raise exception 'Confirm these return counts are accurate.';end if;
 if not public.breakfast_valid_items(p_counts) or not(p_counts ?& array['Milk','Fruit','Entrée','Other']) or (select count(*) from jsonb_object_keys(p_counts))<>4 or length(coalesce(p_notes,''))>2000 then raise exception 'Enter all four return counts between 0 and 10000 and notes up to 2000 characters.';end if;
 select * into old from public.breakfast_daily_records where classroom_id=c.id and service_date=p_date for update;
 if old.worker_submitted_at is not null and old.returned_counts=p_counts and old.worker_notes=trim(coalesce(p_notes,'')) and p_revision in(old.worker_revision,old.worker_revision-1) then return public.breakfast_worker_page(p_qr,p_token);end if;
 if p_revision is distinct from coalesce(old.worker_revision,0) then raise exception 'Return counts changed in another session. Refresh and review before correcting.';end if;
 if old.id is null then
  insert into public.breakfast_daily_records(classroom_id,location_id,service_date,room_snapshot,teacher_snapshot,enrollment_snapshot,campus_snapshot) values(c.id,c.location_id,p_date,c.room_code,c.teacher_name,c.enrolled_students,c.campus_label) returning * into d;
 else d:=old;end if;
 select name into n from public.breakfast_worker_roster(c.location_id) where id=s.staff_key;
 select items into menu from public.breakfast_menus where location_id=c.location_id and service_date=p_date;
 update public.breakfast_daily_records set returned_counts=p_counts,worker_notes=trim(coalesce(p_notes,'')),worker_certified=true,worker_name=n,
 worker_submitted_at=clock_timestamp(),worker_revision=worker_revision+1,menu_snapshot=coalesce(nullif(menu_snapshot,'{}'),menu,'{}'),updated_at=clock_timestamp(),
 -- Components are not whole meals. Do not invent a discrepancy by adding milk, fruit and entrée.
 review_status=case when teacher_submitted_at is null then 'awaiting_teacher' else 'needs_review' end
 where id=d.id returning * into d;
 insert into public.breakfast_events(classroom_id,location_id,daily_record_id,action,actor_role,actor_employee_id,actor_name,before_data,after_data)
 values(c.id,c.location_id,d.id,case when old.worker_submitted_at is null then 'worker_submission' else 'worker_correction' end,'worker',s.employee_id,n,
 case when old.id is null then null else jsonb_build_object('counts',old.returned_counts,'notes',old.worker_notes,'revision',old.worker_revision) end,
 jsonb_build_object('counts',d.returned_counts,'notes',d.worker_notes,'certified',true,'revision',d.worker_revision,'submitted_at',d.worker_submitted_at));
 return public.breakfast_worker_page(p_qr,p_token);
end $$;

create function public.breakfast_worker_logout(p_token uuid) returns void
language sql security definer set search_path=public,pg_temp as $$delete from public.breakfast_worker_sessions where token=p_token$$;

create function public.breakfast_menu(p_token text,p_date date,p_items jsonb default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.breakfast_require_manager(p_token);
 if p_date is null then raise exception 'Select a service date.';end if;
 if p_items is not null then
  if not public.breakfast_valid_items(p_items,true) then raise exception 'Use menu names up to 160 characters.';end if;
  insert into public.breakfast_menus values(s.location_id,p_date,p_items) on conflict(location_id,service_date) do update set items=excluded.items;
 end if;
 return coalesce((select items from public.breakfast_menus where location_id=s.location_id and service_date=p_date),'{}');
end $$;

create function public.breakfast_packing(p_token text,p_id uuid,p_date date,p_save boolean default false,p_sent integer default null,p_items jsonb default '{}',p_revision integer default 0) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;c public.breakfast_classrooms;d public.breakfast_daily_records;
begin
 s:=public.breakfast_require_manager(p_token);
 select * into c from public.breakfast_classrooms where id=p_id and location_id=s.location_id for update;
 if c.id is null then raise exception 'Classroom not found for this school.';end if;
 if p_date is null then raise exception 'Select a service date.';end if;
 select * into d from public.breakfast_daily_records where classroom_id=c.id and service_date=p_date for update;
 if p_save then
  if not c.active then raise exception 'Classroom is inactive.';end if;
  if p_sent is not null and p_sent not between 0 and 10000 or not public.breakfast_valid_items(p_items) then raise exception 'Use sent quantities between 0 and 10000.';end if;
  if p_revision is distinct from coalesce(d.packing_revision,0) then raise exception 'Packing information changed. Refresh before saving.';end if;
  if d.id is null then
   insert into public.breakfast_daily_records(classroom_id,location_id,service_date,room_snapshot,teacher_snapshot,enrollment_snapshot,campus_snapshot) values(c.id,c.location_id,p_date,c.room_code,c.teacher_name,c.enrolled_students,c.campus_label) returning * into d;
  end if;
  update public.breakfast_daily_records set number_sent=p_sent,items_sent=p_items,packing_revision=packing_revision+1,updated_at=clock_timestamp() where id=d.id returning * into d;
 end if;
 return jsonb_build_object('sent',d.number_sent,'items',coalesce(d.items_sent,'{}'),'revision',coalesce(d.packing_revision,0));
end $$;

revoke all on function public.breakfast_valid_items(jsonb,boolean),public.breakfast_require_worker(uuid,uuid) from public,anon,authenticated;
revoke all on function public.breakfast_set_worker_pin(text,text),public.breakfast_worker_names(uuid),public.breakfast_worker_login(uuid,text,text),public.breakfast_worker_page(uuid,uuid),public.breakfast_worker_submit(uuid,uuid,date,jsonb,text,boolean,integer),public.breakfast_worker_logout(uuid),public.breakfast_menu(text,date,jsonb),public.breakfast_packing(text,uuid,date,boolean,integer,jsonb,integer) from public;
grant execute on function public.breakfast_set_worker_pin(text,text),public.breakfast_worker_names(uuid),public.breakfast_worker_login(uuid,text,text),public.breakfast_worker_page(uuid,uuid),public.breakfast_worker_submit(uuid,uuid,date,jsonb,text,boolean,integer),public.breakfast_worker_logout(uuid),public.breakfast_menu(text,date,jsonb),public.breakfast_packing(text,uuid,date,boolean,integer,jsonb,integer) to anon,authenticated;

-- A private builder is used by two permission-checked entry points. Worker scope
-- is always the scanned classroom; managers may print their whole school.
create function public.breakfast_packing_data(p_location bigint,p_date date,p_class uuid default null) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('school',l.school_name,'location_code',l.location_code,'service_date',p_date,
 'menu',coalesce((select items from breakfast_menus where location_id=l.id and service_date=p_date),'{}'),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'room',coalesce(d.room_snapshot,c.room_code),'campus',coalesce(d.campus_snapshot,c.campus_label),
 'enrollment',coalesce(d.enrollment_snapshot,c.enrolled_students),'items',coalesce(d.items_sent,'{}')) order by c.campus_label,c.room_code)
 from breakfast_classrooms c left join breakfast_daily_records d on d.classroom_id=c.id and d.service_date=p_date
 where c.location_id=l.id and (p_class is null or c.id=p_class)
 and (d.id is not null or (c.active and p_date>=(clock_timestamp() at time zone 'America/Los_Angeles')::date))),'[]'))
 from locations l where l.id=p_location
$$;
create function public.breakfast_packing_report(p_token text,p_date date) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.breakfast_require_manager(p_token);
 if p_date is null then raise exception 'Choose a service date.';end if;
 return public.breakfast_packing_data(s.location_id,p_date);
end $$;
create function public.breakfast_worker_packing_report(p_qr uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.breakfast_worker_sessions;c public.breakfast_classrooms;
begin
 s:=public.breakfast_require_worker(p_qr,p_token);
 select * into c from breakfast_classrooms where id=s.classroom_id;
 return public.breakfast_packing_data(c.location_id,(clock_timestamp() at time zone 'America/Los_Angeles')::date,c.id);
end $$;
revoke all on function public.breakfast_packing_data(bigint,date,uuid) from public,anon,authenticated;
revoke all on function public.breakfast_packing_report(text,date),public.breakfast_worker_packing_report(uuid,uuid) from public;
grant execute on function public.breakfast_packing_report(text,date),public.breakfast_worker_packing_report(uuid,uuid) to anon,authenticated;

notify pgrst,'reload schema';
commit;
