begin;
alter table public.breakfast_daily_records
 add column adult_meal_received boolean not null default false,
 add column adult_meal_recorded_at timestamptz,
 add column adult_meal_revision integer not null default 0;
create or replace function public.breakfast_teacher_page(p_qr uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.breakfast_classrooms;st public.breakfast_settings;local_now timestamp:=clock_timestamp() at time zone 'America/Los_Angeles';d public.breakfast_daily_records;
begin
 c:=public.breakfast_require_qr(p_qr);
 select * into st from public.breakfast_settings where location_id=c.location_id;
 select * into d from public.breakfast_daily_records where classroom_id=c.id and service_date=local_now::date;
 return jsonb_build_object('room',c.room_code,'teacher',c.teacher_name,'enrollment',c.enrolled_students,'campus',c.campus_label,
 'service_date',local_now::date,'cutoff',coalesce(st.teacher_cutoff,'09:00'::time),'closed',local_now::time>=coalesce(st.teacher_cutoff,'09:00'::time),
 'training_url',coalesce(st.training_url,''),'tips_url',coalesce(st.tips_url,''),
 'record',case when d.id is null then null else jsonb_build_object('count',d.teacher_meal_count,'comments',d.teacher_comments,'submitted_at',d.teacher_submitted_at,'revision',d.teacher_revision,'adult_received',d.adult_meal_received,'adult_recorded_at',d.adult_meal_recorded_at,'adult_revision',d.adult_meal_revision) end,
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'require_ack',m.require_ack) order by m.created_at) from public.breakfast_messages m where m.classroom_id=c.id and public.breakfast_message_active(m,local_now::date)),'[]'::jsonb));
end $$;


create function public.breakfast_teacher_adult_meal(p_qr uuid,p_date date,p_received boolean,p_revision integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.breakfast_classrooms;d public.breakfast_daily_records;local_now timestamp;cutoff time;
begin
 c:=public.breakfast_require_qr(p_qr);
 local_now:=clock_timestamp() at time zone 'America/Los_Angeles';
 select teacher_cutoff into cutoff from breakfast_settings where location_id=c.location_id;
 if p_date is distinct from local_now::date then raise exception 'The service date changed. Refresh for today.';end if;
 if local_now::time>=coalesce(cutoff,'09:00'::time) then raise exception 'Breakfast teacher reporting is closed for today.';end if;
 if p_received is null then raise exception 'Select whether you received an adult meal.';end if;
 select * into d from breakfast_daily_records where classroom_id=c.id and service_date=p_date for update;
 if d.adult_meal_recorded_at is not null and d.adult_meal_received=p_received and p_revision in(d.adult_meal_revision,d.adult_meal_revision-1) then return breakfast_teacher_page(p_qr);end if;
 if p_revision is distinct from coalesce(d.adult_meal_revision,0) then raise exception 'The adult meal changed in another session. Refresh before correcting it.';end if;
 if d.id is null then
  insert into breakfast_daily_records(classroom_id,location_id,service_date,room_snapshot,teacher_snapshot,enrollment_snapshot,campus_snapshot) values(c.id,c.location_id,p_date,c.room_code,c.teacher_name,c.enrolled_students,c.campus_label) returning * into d;
 end if;
 update breakfast_daily_records set adult_meal_received=p_received,adult_meal_recorded_at=clock_timestamp(),adult_meal_revision=adult_meal_revision+1,
 reviewed_at=null,reviewed_by=null,review_status=case when teacher_submitted_at is null then 'awaiting_teacher' when worker_submitted_at is null then 'awaiting_return' else 'needs_review' end,updated_at=clock_timestamp() where id=d.id;
 return breakfast_teacher_page(p_qr);
end $$;
revoke all on function public.breakfast_teacher_adult_meal(uuid,date,boolean,integer) from public;
grant execute on function public.breakfast_teacher_adult_meal(uuid,date,boolean,integer) to anon,authenticated;
notify pgrst,'reload schema';
commit;
