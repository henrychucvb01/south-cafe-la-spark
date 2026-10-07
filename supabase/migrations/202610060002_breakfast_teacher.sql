begin;

create table public.breakfast_settings (
 location_id bigint primary key references public.locations(id),
 teacher_cutoff time not null default '09:00',
 training_url text not null default '' check(training_url='' or (length(training_url)<=2000 and training_url ~ '^https://[^[:space:]]+$')),
 tips_url text not null default '' check(tips_url='' or (length(tips_url)<=2000 and tips_url ~ '^https://[^[:space:]]+$')),
 updated_at timestamptz not null default now()
);
create table public.breakfast_messages (
 id uuid primary key default gen_random_uuid(),
 classroom_id uuid not null references public.breakfast_classrooms(id),
 body text not null check(length(trim(body)) between 1 and 2000),
 delivery text not null check(delivery in ('next_open','today','until_ack','expires')),
 require_ack boolean not null default false,
 expires_on date,
 created_at timestamptz not null default now(),
 displayed_at timestamptz,
 acknowledged_at timestamptz,
 check(delivery<>'expires' or expires_on is not null),
 check(delivery<>'until_ack' or require_ack)
);
create index breakfast_messages_class_idx on public.breakfast_messages(classroom_id,created_at desc);
alter table public.breakfast_daily_records add column teacher_revision integer not null default 0;
alter table public.breakfast_settings enable row level security;
alter table public.breakfast_messages enable row level security;
revoke all on public.breakfast_settings,public.breakfast_messages from public,anon,authenticated;

create function public.breakfast_manager_settings(p_token text,p_save boolean default false,p_cutoff time default '09:00',p_training text default '',p_tips text default '') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.breakfast_require_manager(p_token);
 if p_save then
  insert into public.breakfast_settings(location_id,teacher_cutoff,training_url,tips_url) values(s.location_id,p_cutoff,trim(coalesce(p_training,'')),trim(coalesce(p_tips,'')))
  on conflict(location_id) do update set teacher_cutoff=excluded.teacher_cutoff,training_url=excluded.training_url,tips_url=excluded.tips_url,updated_at=now();
 end if;
 return coalesce((select to_jsonb(t)-'location_id' from public.breakfast_settings t where location_id=s.location_id),jsonb_build_object('teacher_cutoff','09:00','training_url','','tips_url',''));
end $$;

create function public.breakfast_classroom_qr(p_token text,p_id uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;q uuid;
begin
 s:=public.breakfast_require_manager(p_token);
 select qr_token into q from public.breakfast_classrooms where id=p_id and location_id=s.location_id;
 if q is null then raise exception 'Classroom not found for this school.';end if;
 return q;
end $$;

create function public.breakfast_send_message(p_token text,p_id uuid,p_body text,p_delivery text,p_ack boolean,p_expires date default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;m public.breakfast_messages;today date:=(clock_timestamp() at time zone 'America/Los_Angeles')::date;
begin
 s:=public.breakfast_require_manager(p_token);
 if not exists(select 1 from public.breakfast_classrooms where id=p_id and location_id=s.location_id) then raise exception 'Classroom not found for this school.';end if;
 if p_delivery='expires' and (p_expires is null or p_expires<today) then raise exception 'Choose today or a future expiration date.';end if;
 insert into public.breakfast_messages(classroom_id,body,delivery,require_ack,expires_on) values(p_id,trim(p_body),p_delivery,p_ack or p_delivery='until_ack',case when p_delivery='today' then today else p_expires end) returning * into m;
 insert into public.breakfast_events(classroom_id,location_id,action,actor_role,actor_employee_id,actor_name,note,after_data)
 values(p_id,s.location_id,'manager_message','manager',s.employee_id,s.monitor_name,m.body,to_jsonb(m));
end $$;

-- Private resolver: a QR is a bearer capability for only this active classroom.
create function public.breakfast_require_qr(p_qr uuid) returns public.breakfast_classrooms
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.breakfast_classrooms;
begin
 select b.* into c from public.breakfast_classrooms b join public.locations l on l.id=b.location_id where b.qr_token=p_qr and b.active and l.active for update of b;
 if c.id is null then raise exception 'This classroom link is unavailable. Please contact the cafeteria.';end if;
 return c;
end $$;
create function public.breakfast_message_active(m public.breakfast_messages,p_today date) returns boolean
language sql stable set search_path=public,pg_temp as $$
 select m.acknowledged_at is null and (m.expires_on is null or m.expires_on>=p_today)
 and (m.delivery<>'today' or (m.created_at at time zone 'America/Los_Angeles')::date=p_today)
 and (m.delivery<>'next_open' or m.displayed_at is null or (m.displayed_at at time zone 'America/Los_Angeles')::date=p_today)
$$;
revoke all on function public.breakfast_require_qr(uuid),public.breakfast_message_active(public.breakfast_messages,date) from public,anon,authenticated;

create function public.breakfast_teacher_page(p_qr uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.breakfast_classrooms;st public.breakfast_settings;local_now timestamp:=clock_timestamp() at time zone 'America/Los_Angeles';d public.breakfast_daily_records;
begin
 c:=public.breakfast_require_qr(p_qr);
 select * into st from public.breakfast_settings where location_id=c.location_id;
 select * into d from public.breakfast_daily_records where classroom_id=c.id and service_date=local_now::date;
 return jsonb_build_object('room',c.room_code,'teacher',c.teacher_name,'enrollment',c.enrolled_students,'campus',c.campus_label,
 'service_date',local_now::date,'cutoff',coalesce(st.teacher_cutoff,'09:00'::time),'closed',local_now::time>=coalesce(st.teacher_cutoff,'09:00'::time),
 'training_url',coalesce(st.training_url,''),'tips_url',coalesce(st.tips_url,''),
 'record',case when d.id is null then null else jsonb_build_object('count',d.teacher_meal_count,'comments',d.teacher_comments,'submitted_at',d.teacher_submitted_at,'revision',d.teacher_revision) end,
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'require_ack',m.require_ack) order by m.created_at) from public.breakfast_messages m where m.classroom_id=c.id and public.breakfast_message_active(m,local_now::date)),'[]'::jsonb));
end $$;

create function public.breakfast_teacher_message(p_qr uuid,p_message uuid,p_ack boolean default false) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.breakfast_classrooms;m public.breakfast_messages;t timestamptz:=clock_timestamp();
begin
 c:=public.breakfast_require_qr(p_qr);
 select * into m from public.breakfast_messages where id=p_message and classroom_id=c.id for update;
 if m.id is null then raise exception 'Message not found.';end if;
 if not public.breakfast_message_active(m,(t at time zone 'America/Los_Angeles')::date) then return;end if;
 if m.displayed_at is null then
  update public.breakfast_messages set displayed_at=t where id=m.id;
  insert into public.breakfast_events(classroom_id,location_id,action,actor_role,actor_name,note,after_data) values(c.id,c.location_id,'teacher_message_displayed','teacher','Classroom QR',m.body,jsonb_build_object('message_id',m.id,'displayed_at',t));
 end if;
 if p_ack and m.acknowledged_at is null then
  update public.breakfast_messages set acknowledged_at=t where id=m.id;
  insert into public.breakfast_events(classroom_id,location_id,action,actor_role,actor_name,note,after_data) values(c.id,c.location_id,'teacher_acknowledgment','teacher','Classroom QR',m.body,jsonb_build_object('message_id',m.id,'acknowledged_at',t));
 end if;
end $$;

create function public.breakfast_teacher_submit(p_qr uuid,p_date date,p_count integer,p_comments text,p_certified boolean,p_revision integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.breakfast_classrooms;d public.breakfast_daily_records;old public.breakfast_daily_records;cutoff time;local_now timestamp;action_name text;
begin
 c:=public.breakfast_require_qr(p_qr);
 -- Read the clock after obtaining the classroom lock, including queued requests.
 local_now:=clock_timestamp() at time zone 'America/Los_Angeles';
 select teacher_cutoff into cutoff from public.breakfast_settings where location_id=c.location_id;
 if p_date is distinct from local_now::date then raise exception 'The service date changed. Refresh before counting for today.';end if;
 if local_now::time>=coalesce(cutoff,'09:00'::time) then raise exception 'Breakfast teacher reporting is closed for today. Contact the cafeteria for corrections.';end if;
 if p_certified is distinct from true then raise exception 'Confirm that this breakfast count is accurate.';end if;
 if p_count is null or p_count not between 0 and 10000 or length(coalesce(p_comments,''))>2000 then raise exception 'Enter a valid count and comments of up to 2000 characters.';end if;
 if exists(select 1 from public.breakfast_messages m where m.classroom_id=c.id and m.require_ack and public.breakfast_message_active(m,local_now::date)) then raise exception 'Acknowledge the cafeteria message before submitting.';end if;
 select * into old from public.breakfast_daily_records where classroom_id=c.id and service_date=p_date for update;
 -- Same payload retry succeeds without another award/event/revision.
 if old.teacher_submitted_at is not null and old.teacher_meal_count=p_count and old.teacher_comments=trim(coalesce(p_comments,'')) and p_revision in (old.teacher_revision,old.teacher_revision-1) then return public.breakfast_teacher_page(p_qr);end if;
 if p_revision is distinct from coalesce(old.teacher_revision,0) then raise exception 'This count changed in another session. Refresh and review the latest count before correcting it.';end if;
 if old.id is null then
  insert into public.breakfast_daily_records(classroom_id,location_id,service_date,room_snapshot,teacher_snapshot,enrollment_snapshot,campus_snapshot) values(c.id,c.location_id,p_date,c.room_code,c.teacher_name,c.enrolled_students,c.campus_label) returning * into d;
 else d:=old;end if;
 action_name:=case when old.teacher_submitted_at is null then 'teacher_submission' else 'teacher_correction' end;
 update public.breakfast_daily_records set teacher_meal_count=p_count,teacher_comments=trim(coalesce(p_comments,'')),teacher_certified=true,teacher_submitted_at=clock_timestamp(),teacher_revision=teacher_revision+1,updated_at=clock_timestamp(),review_status=case when worker_submitted_at is null then 'awaiting_return' else 'needs_review' end where id=d.id returning * into d;
 insert into public.breakfast_events(classroom_id,location_id,daily_record_id,action,actor_role,actor_name,before_data,after_data) values(c.id,c.location_id,d.id,action_name,'teacher','Classroom QR',case when old.id is null then null else jsonb_build_object('count',old.teacher_meal_count,'comments',old.teacher_comments,'revision',old.teacher_revision) end,jsonb_build_object('count',d.teacher_meal_count,'comments',d.teacher_comments,'certified',true,'revision',d.teacher_revision));
 return public.breakfast_teacher_page(p_qr);
end $$;
revoke all on function public.breakfast_manager_settings(text,boolean,time,text,text),public.breakfast_classroom_qr(text,uuid),public.breakfast_send_message(text,uuid,text,text,boolean,date),public.breakfast_teacher_page(uuid),public.breakfast_teacher_message(uuid,uuid,boolean),public.breakfast_teacher_submit(uuid,date,integer,text,boolean,integer) from public;
grant execute on function public.breakfast_manager_settings(text,boolean,time,text,text),public.breakfast_classroom_qr(text,uuid),public.breakfast_send_message(text,uuid,text,text,boolean,date),public.breakfast_teacher_page(uuid),public.breakfast_teacher_message(uuid,uuid,boolean),public.breakfast_teacher_submit(uuid,date,integer,text,boolean,integer) to anon,authenticated;
commit;
