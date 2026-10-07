begin;

-- Phase 1 only. Existing school IDs and PIN-backed scoped sessions are reused.
create table public.breakfast_classrooms (
 id uuid primary key default gen_random_uuid(),
 location_id bigint not null references public.locations(id),
 room_code text not null check(length(trim(room_code)) between 1 and 40),
 teacher_name text not null check(length(trim(teacher_name)) between 1 and 160),
 enrolled_students integer not null check(enrolled_students between 0 and 1000),
 campus_label text not null default '' check(length(campus_label)<=120),
 active boolean not null default true,
 qr_token uuid not null unique default gen_random_uuid(),
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,location_id)
);
create unique index breakfast_classroom_room_idx on public.breakfast_classrooms(location_id,lower(trim(campus_label)),lower(trim(room_code)));
create index breakfast_classroom_school_idx on public.breakfast_classrooms(location_id,active,room_code);

-- No daily-entry RPC in Phase 1. Later phases populate these using server dates,
-- immutable classroom snapshots, certification and cutoff checks.
create table public.breakfast_daily_records (
 id uuid primary key default gen_random_uuid(),
 classroom_id uuid not null,
 location_id bigint not null references public.locations(id),
 service_date date not null,
 room_snapshot text not null,
 teacher_snapshot text not null,
 enrollment_snapshot integer not null check(enrollment_snapshot>=0),
 campus_snapshot text not null default '',
 number_sent integer check(number_sent>=0),
 teacher_meal_count integer check(teacher_meal_count>=0),
 teacher_submitted_at timestamptz,
 teacher_certified boolean not null default false,
 teacher_comments text not null default '',
 returned_counts jsonb not null default '{}'::jsonb check(jsonb_typeof(returned_counts)='object'),
 worker_submitted_at timestamptz,
 worker_certified boolean not null default false,
 discrepancy integer,
 review_status text not null default 'not_started' check(review_status in ('not_started','awaiting_teacher','awaiting_return','needs_review','complete','reviewed')),
 manager_notes text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(classroom_id,location_id) references public.breakfast_classrooms(id,location_id),
 unique(classroom_id,service_date),
 unique(id,classroom_id,location_id)
);
create index breakfast_daily_school_date_idx on public.breakfast_daily_records(location_id,service_date desc,classroom_id);
create table public.breakfast_events (
 id bigint generated always as identity primary key,
 classroom_id uuid not null,
 location_id bigint not null references public.locations(id),
 daily_record_id uuid,
 action text not null,
 actor_role text not null check(actor_role in ('manager','supervisor','teacher','worker')),
 actor_employee_id bigint references public.employees(id),
 actor_name text not null,
 note text not null default '' check(length(note)<=4000),
 before_data jsonb,
 after_data jsonb,
 created_at timestamptz not null default now(),
 foreign key(classroom_id,location_id) references public.breakfast_classrooms(id,location_id),
 foreign key(daily_record_id,classroom_id,location_id) references public.breakfast_daily_records(id,classroom_id,location_id)
);
create index breakfast_event_classroom_idx on public.breakfast_events(location_id,classroom_id,id desc);
alter table public.breakfast_classrooms enable row level security;
alter table public.breakfast_daily_records enable row level security;
alter table public.breakfast_events enable row level security;
revoke all on public.breakfast_classrooms,public.breakfast_daily_records,public.breakfast_events from public,anon,authenticated;
revoke all on sequence public.breakfast_events_id_seq from public,anon,authenticated;

create function public.breakfast_require_manager(p_token text) returns public.supper_monitoring_sessions
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'manager' then raise exception 'Manager access required.'; end if;
 return s;
end $$;
revoke all on function public.breakfast_require_manager(text) from public,anon,authenticated;

create function public.breakfast_list_classrooms(p_token text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.breakfast_require_manager(p_token);
 return coalesce((select jsonb_agg(to_jsonb(c)-'qr_token' order by c.active desc,c.campus_label,c.room_code) from public.breakfast_classrooms c where c.location_id=s.location_id),'[]'::jsonb);
end $$;

create function public.breakfast_save_classroom(p_token text,p_id uuid,p_revision integer,p_room text,p_teacher text,p_enrollment integer,p_campus text,p_active boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions; old public.breakfast_classrooms; c public.breakfast_classrooms; a text;
begin
 s:=public.breakfast_require_manager(p_token);
 if p_room is null or length(trim(p_room)) not between 1 and 40 or p_teacher is null or length(trim(p_teacher)) not between 1 and 160 or p_enrollment is null or p_enrollment not between 0 and 1000 or length(coalesce(p_campus,''))>120 or p_active is null then raise exception 'Enter a room, teacher, and whole-number enrollment from 0 to 1000.'; end if;
 if p_id is null then
  insert into public.breakfast_classrooms(location_id,room_code,teacher_name,enrolled_students,campus_label,active)
   values(s.location_id,trim(p_room),trim(p_teacher),p_enrollment,trim(coalesce(p_campus,'')),p_active) returning * into c;
  a:='classroom_created';
 else
  select * into old from public.breakfast_classrooms where id=p_id and location_id=s.location_id for update;
  if old.id is null then raise exception 'Classroom not found for this school.'; end if;
  if p_revision is distinct from old.revision then raise exception 'This classroom changed in another session. Refresh before editing.'; end if;
  update public.breakfast_classrooms set room_code=trim(p_room),teacher_name=trim(p_teacher),enrolled_students=p_enrollment,campus_label=trim(coalesce(p_campus,'')),active=p_active,revision=revision+1,updated_at=now() where id=old.id returning * into c;
  a:=case when old.active and not c.active then 'classroom_deactivated' when not old.active and c.active then 'classroom_reactivated' else 'classroom_updated' end;
 end if;
 insert into public.breakfast_events(classroom_id,location_id,action,actor_role,actor_employee_id,actor_name,before_data,after_data)
 values(c.id,s.location_id,a,'manager',s.employee_id,s.monitor_name,case when old.id is null then null else to_jsonb(old)-'qr_token' end,to_jsonb(c)-'qr_token');
 return to_jsonb(c)-'qr_token';
exception when unique_violation then raise exception 'That room already exists in this school/campus. Edit or reactivate its existing record.';
end $$;

create function public.breakfast_classroom_history(p_token text,p_id uuid,p_before_event bigint default null,p_before_date date default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;c public.breakfast_classrooms;
begin
 s:=public.breakfast_require_manager(p_token);
 select * into c from public.breakfast_classrooms where id=p_id and location_id=s.location_id;
 if c.id is null then raise exception 'Classroom not found for this school.'; end if;
 return jsonb_build_object('classroom',to_jsonb(c)-'qr_token',
  'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.id desc) from (select * from public.breakfast_events where classroom_id=c.id and location_id=s.location_id and (p_before_event is null or id<p_before_event) order by id desc limit 51) e),'[]'::jsonb),
  'days',coalesce((select jsonb_agg(to_jsonb(d) order by d.service_date desc) from (select * from public.breakfast_daily_records where classroom_id=c.id and location_id=s.location_id and (p_before_date is null or service_date<p_before_date) order by service_date desc limit 51) d),'[]'::jsonb));
end $$;
create function public.breakfast_add_note(p_token text,p_id uuid,p_note text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.breakfast_require_manager(p_token);
 if p_note is null or length(trim(p_note)) not between 1 and 4000 then raise exception 'Enter a note (up to 4000 characters).'; end if;
 if not exists(select 1 from public.breakfast_classrooms where id=p_id and location_id=s.location_id) then raise exception 'Classroom not found for this school.'; end if;
 insert into public.breakfast_events(classroom_id,location_id,action,actor_role,actor_employee_id,actor_name,note) values(p_id,s.location_id,'manager_note','manager',s.employee_id,s.monitor_name,trim(p_note));
end $$;
revoke all on function public.breakfast_list_classrooms(text),public.breakfast_save_classroom(text,uuid,integer,text,text,integer,text,boolean),public.breakfast_classroom_history(text,uuid,bigint,date),public.breakfast_add_note(text,uuid,text) from public;
grant execute on function public.breakfast_list_classrooms(text),public.breakfast_save_classroom(text,uuid,integer,text,text,integer,text,boolean),public.breakfast_classroom_history(text,uuid,bigint,date),public.breakfast_add_note(text,uuid,text) to anon,authenticated;
commit;
