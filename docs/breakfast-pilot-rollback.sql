-- Emergency pre-activation rollback only. Never discard signed records or new preorders.
begin;
set local lock_timeout='5s';
do $$ begin if exists(select 1 from breakfast_daily_records where teacher_signature is not null or preorder_items is not null) then raise exception 'Signed pilot data exists. Keep the v2 app and repair forward; do not restore unsigned submissions.';end if;end $$;
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



create or replace function public.breakfast_menu(p_token text,p_date date,p_items jsonb default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;m jsonb;
begin
 s:=public.breakfast_require_manager(p_token);
 if p_date is null then raise exception 'Select a service date.';end if;
 if p_items is not null then
  if public.breakfast_valid_items(p_items,true) is distinct from true then raise exception 'Use menu names up to 160 characters.';end if;
  m:=public.breakfast_active_menu(p_items);
  insert into breakfast_menus values(s.location_id,p_date,'{}') on conflict do nothing;
  perform 1 from breakfast_menus where location_id=s.location_id and service_date=p_date for update;
  if exists(select 1 from breakfast_daily_records where location_id=s.location_id and service_date=p_date and packing_submitted_at is not null and menu_snapshot<>m) then raise exception 'Packing has started for this menu. Its item names are preserved for today’s packing and returns.';end if;
  update breakfast_menus set items=m where location_id=s.location_id and service_date=p_date;
 end if;
 return coalesce((select items from breakfast_menus where location_id=s.location_id and service_date=p_date),'{}');
end $$;

grant execute on function public.breakfast_teacher_submit(uuid,date,integer,text,boolean,integer),public.breakfast_teacher_preorder(uuid,date,date,text,integer,integer) to anon,authenticated;
notify pgrst,'reload schema';
commit;
