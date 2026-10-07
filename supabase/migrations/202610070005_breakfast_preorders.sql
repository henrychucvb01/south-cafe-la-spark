begin;
alter table public.breakfast_daily_records
 add column preorder_date date,
 add column preorder_entree text,
 add column preorder_count integer check(preorder_count between 0 and 1000),
 add column preorder_submitted_at timestamptz,
 add column preorder_revision integer not null default 0;
create function public.breakfast_next_service_date(p_location bigint,p_date date) returns date
language sql stable security definer set search_path=public,pg_temp as $$
 select d::date from generate_series(p_date+1,p_date+366,interval '1 day') d
 where extract(isodow from d)<6 and not exists(select 1 from spark_excluded_days e where e.location_id=p_location and e.service_date=d::date)
 order by d limit 1;
$$;
revoke all on function public.breakfast_next_service_date(bigint,date) from public,anon,authenticated;
create or replace function public.breakfast_teacher_page(p_qr uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.breakfast_classrooms;st public.breakfast_settings;local_now timestamp:=clock_timestamp() at time zone 'America/Los_Angeles';d public.breakfast_daily_records;
begin
 c:=public.breakfast_require_qr(p_qr);
 select * into st from public.breakfast_settings where location_id=c.location_id;
 select * into d from public.breakfast_daily_records where classroom_id=c.id and service_date=local_now::date;
 return jsonb_build_object('room',c.room_code,'teacher',c.teacher_name,'enrollment',c.enrolled_students,'campus',c.campus_label,
 'service_date',local_now::date,'preorder_date',public.breakfast_next_service_date(c.location_id,local_now::date),'cutoff',coalesce(st.teacher_cutoff,'09:00'::time),'closed',local_now::time>=coalesce(st.teacher_cutoff,'09:00'::time),
 'training_url',coalesce(st.training_url,''),'tips_url',coalesce(st.tips_url,''),
 'record',case when d.id is null then null else jsonb_build_object('count',d.teacher_meal_count,'comments',d.teacher_comments,'submitted_at',d.teacher_submitted_at,'revision',d.teacher_revision,'adult_received',d.adult_meal_received,'adult_recorded_at',d.adult_meal_recorded_at,'adult_revision',d.adult_meal_revision,'preorder_date',d.preorder_date,'preorder_entree',d.preorder_entree,'preorder_count',d.preorder_count,'preorder_revision',d.preorder_revision,'preorder_submitted_at',d.preorder_submitted_at) end,
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'require_ack',m.require_ack) order by m.created_at) from public.breakfast_messages m where m.classroom_id=c.id and public.breakfast_message_active(m,local_now::date)),'[]'::jsonb));
end $$;



create function public.breakfast_teacher_preorder(p_qr uuid,p_date date,p_for_date date,p_entree text,p_count integer,p_revision integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.breakfast_classrooms;d public.breakfast_daily_records;today date;target date;
begin
 c:=public.breakfast_require_qr(p_qr);
 today:=(clock_timestamp() at time zone 'America/Los_Angeles')::date;
 if p_date is distinct from today then raise exception 'The service date changed. Refresh for today.';end if;
 target:=public.breakfast_next_service_date(c.location_id,today);
 if target is null or p_for_date is distinct from target then raise exception 'The next breakfast date changed. Refresh before pre-ordering.';end if;
 if p_count is null or p_count<0 or p_count>1000 or length(trim(coalesce(p_entree,'')))=0 or length(p_entree)>120 then raise exception 'Enter an entree and a whole quantity from 0 to 1000.';end if;
 select * into d from breakfast_daily_records where classroom_id=c.id and service_date=today for update;
 if d.id is null or d.teacher_submitted_at is null or not d.teacher_certified then raise exception 'Submit today''s breakfast count first.';end if;
 if d.preorder_submitted_at is not null and d.preorder_date=target and d.preorder_entree=trim(p_entree) and d.preorder_count=p_count and p_revision in(d.preorder_revision,d.preorder_revision-1) then return breakfast_teacher_page(p_qr);end if;
 if p_revision is distinct from d.preorder_revision then raise exception 'This pre-order changed in another session. Refresh before editing.';end if;
 update breakfast_daily_records set preorder_date=target,preorder_entree=trim(p_entree),preorder_count=p_count,preorder_submitted_at=clock_timestamp(),preorder_revision=preorder_revision+1,updated_at=clock_timestamp() where id=d.id;
 return breakfast_teacher_page(p_qr);
end $$;
revoke all on function public.breakfast_teacher_preorder(uuid,date,date,text,integer,integer) from public;
grant execute on function public.breakfast_teacher_preorder(uuid,date,date,text,integer,integer) to anon,authenticated;
create or replace function public.breakfast_daily_dashboard(p_token text,p_date date) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;rows jsonb;
begin
 s:=public.breakfast_require_manager(p_token);
 if p_date is null then raise exception 'Select a service date.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('classroom_id',c.id,'room',coalesce(d.room_snapshot,c.room_code),'teacher',coalesce(d.teacher_snapshot,c.teacher_name),
 'campus',coalesce(d.campus_snapshot,c.campus_label),'record',case when d.id is null then null else to_jsonb(d) end) order by c.campus_label,c.room_code),'[]') into rows
 from breakfast_classrooms c left join breakfast_daily_records d on d.classroom_id=c.id and d.service_date=p_date
 where c.location_id=s.location_id and (d.id is not null or (c.active and (c.created_at at time zone 'America/Los_Angeles')::date<=p_date));
 return jsonb_build_object('date',p_date,'rows',rows,'preorders',coalesce((select jsonb_agg(to_jsonb(p)) from (select distinct on(classroom_id) classroom_id,room_snapshot as room,campus_snapshot as campus,preorder_entree as entree,preorder_count as quantity,preorder_submitted_at as submitted_at from breakfast_daily_records where location_id=s.location_id and preorder_date=p_date and preorder_submitted_at is not null order by classroom_id,preorder_submitted_at desc) p),'[]'::jsonb),'total',coalesce((select sum(teacher_meal_count) from breakfast_daily_records where location_id=s.location_id and service_date=p_date and teacher_certified and teacher_submitted_at is not null),0));
end $$;
notify pgrst,'reload schema';
commit;
