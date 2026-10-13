begin;
set local lock_timeout='5s';
alter table public.breakfast_daily_records
 add column teacher_attendance integer check(teacher_attendance between 0 and 10000),
 add column teacher_signature jsonb,
 add column teacher_returned_counts jsonb,
 add column preorder_items jsonb;
-- Nullable additions preserve historical records exactly; no invented attendance or ink.
create function public.breakfast_valid_signature(p jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare stroke jsonb;pt jsonb;n integer:=0;
begin
 if p is null or jsonb_typeof(p->'strokes') is distinct from 'array' or octet_length(p::text)>150000 then return false;end if;
 if jsonb_array_length(p->'strokes') not between 1 and 80 then return false;end if;
 for stroke in select value from jsonb_array_elements(p->'strokes') loop
  if jsonb_typeof(stroke)<>'array' or jsonb_array_length(stroke) not between 2 and 1500 then return false;end if;
  for pt in select value from jsonb_array_elements(stroke) loop
   if jsonb_typeof(pt)<>'array' or jsonb_array_length(pt)<>2 or jsonb_typeof(pt->0)<>'number' or jsonb_typeof(pt->1)<>'number' then return false;end if;
   if (pt->>0)::numeric not between 0 and 1 or (pt->>1)::numeric not between 0 and 1 then return false;end if;
   n:=n+1;if n>4000 then return false;end if;
  end loop;
 end loop;
 return n>=2;
end $$;
revoke all on function public.breakfast_valid_signature(jsonb) from public,anon,authenticated;
create or replace function public.breakfast_teacher_page(p_qr uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.breakfast_classrooms;st public.breakfast_settings;local_now timestamp:=clock_timestamp() at time zone 'America/Los_Angeles';d public.breakfast_daily_records;
begin
 c:=public.breakfast_require_qr(p_qr);
 select * into st from public.breakfast_settings where location_id=c.location_id;
 select * into d from public.breakfast_daily_records where classroom_id=c.id and service_date=local_now::date;
 return jsonb_build_object('room',c.room_code,'teacher',c.teacher_name,'enrollment',c.enrolled_students,'campus',c.campus_label,
 'pilot_version',2,'menu',coalesce(nullif(d.menu_snapshot,'{}'),(select items from breakfast_menus where location_id=c.location_id and service_date=local_now::date),'{}'),'preorder_menu',coalesce((select items from breakfast_menus where location_id=c.location_id and service_date=public.breakfast_next_service_date(c.location_id,local_now::date)),'{}'),'service_date',local_now::date,'preorder_date',public.breakfast_next_service_date(c.location_id,local_now::date),'cutoff',coalesce(st.teacher_cutoff,'09:00'::time),'closed',local_now::time>=coalesce(st.teacher_cutoff,'09:00'::time),
 'training_url',coalesce(st.training_url,''),'tips_url',coalesce(st.tips_url,''),
 'record',case when d.id is null then null else jsonb_build_object('attendance',d.teacher_attendance,'signature',d.teacher_signature,'returns',d.teacher_returned_counts,'preorder_items',d.preorder_items,'count',d.teacher_meal_count,'comments',d.teacher_comments,'submitted_at',d.teacher_submitted_at,'revision',d.teacher_revision,'adult_received',d.adult_meal_received,'adult_recorded_at',d.adult_meal_recorded_at,'adult_revision',d.adult_meal_revision,'preorder_date',d.preorder_date,'preorder_entree',d.preorder_entree,'preorder_count',d.preorder_count,'preorder_revision',d.preorder_revision,'preorder_submitted_at',d.preorder_submitted_at) end,
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'require_ack',m.require_ack) order by m.created_at) from public.breakfast_messages m where m.classroom_id=c.id and public.breakfast_message_active(m,local_now::date)),'[]'::jsonb));
end $$;



create function public.breakfast_teacher_submit_v2(p_qr uuid,p_date date,p_count integer,p_comments text,p_certified boolean,p_revision integer,p_attendance integer,p_signature jsonb,p_returns jsonb,p_menu jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.breakfast_classrooms;d public.breakfast_daily_records;old public.breakfast_daily_records;cutoff time;local_now timestamp;action_name text;m jsonb;
begin
 c:=public.breakfast_require_qr(p_qr);
 -- Read the clock after obtaining the classroom lock, including queued requests.
 local_now:=clock_timestamp() at time zone 'America/Los_Angeles';
 select teacher_cutoff into cutoff from public.breakfast_settings where location_id=c.location_id;
 if p_date is distinct from local_now::date then raise exception 'The service date changed. Refresh before counting for today.';end if;
 if local_now::time>=coalesce(cutoff,'09:00'::time) then raise exception 'Breakfast teacher reporting is closed for today. Contact the cafeteria for corrections.';end if;
 if p_certified is distinct from true then raise exception 'Confirm that this breakfast count is accurate.';end if;
 if p_count is null or p_count not between 0 and 10000 or length(coalesce(p_comments,''))>2000 then raise exception 'Enter a valid count and comments of up to 2000 characters.';end if;
 if exists(select 1 from public.breakfast_messages msg where msg.classroom_id=c.id and msg.require_ack and public.breakfast_message_active(msg,local_now::date)) then raise exception 'Acknowledge the cafeteria message before submitting.';end if;
 select * into old from public.breakfast_daily_records where classroom_id=c.id and service_date=p_date for update;
 select public.breakfast_active_menu(items) into m from breakfast_menus where location_id=c.location_id and service_date=p_date for share;
 m:=coalesce(nullif(old.menu_snapshot,'{}'),m,'{}');
 if p_menu is distinct from m then raise exception 'The breakfast menu changed. Refresh and review before signing.';end if;
 if p_attendance is null or p_attendance not between 0 and 10000 then raise exception 'Enter today''s class attendance as a whole number.';end if;
 if public.breakfast_valid_signature(p_signature) is not true then raise exception 'Draw and accept your signature before submitting.';end if;
 if p_returns is null or (not (m='{}' and p_returns='{}') and public.breakfast_counts_match_menu(p_returns,m) is not true) then raise exception 'Enter whole returned quantities for each menu item.';end if;
 -- Same payload retry succeeds without another award/event/revision.
 if old.teacher_submitted_at is not null and old.teacher_meal_count=p_count and old.teacher_comments=trim(coalesce(p_comments,'')) and old.teacher_attendance=p_attendance and old.teacher_signature=p_signature and old.teacher_returned_counts=p_returns and p_revision in (old.teacher_revision,old.teacher_revision-1) then return public.breakfast_teacher_page(p_qr);end if;
 if old.teacher_signature=p_signature and (old.teacher_attendance is distinct from p_attendance or old.teacher_meal_count is distinct from p_count or old.teacher_returned_counts is distinct from p_returns) then raise exception 'Counts changed. Sign again before submitting.';end if;
 if p_revision is distinct from coalesce(old.teacher_revision,0) then raise exception 'This count changed in another session. Refresh and review the latest count before correcting it.';end if;
 if old.id is null then
  insert into public.breakfast_daily_records(classroom_id,location_id,service_date,room_snapshot,teacher_snapshot,enrollment_snapshot,campus_snapshot) values(c.id,c.location_id,p_date,c.room_code,c.teacher_name,c.enrolled_students,c.campus_label) returning * into d;
 else d:=old;end if;
 action_name:=case when old.teacher_submitted_at is null then 'teacher_submission' else 'teacher_correction' end;
 update public.breakfast_daily_records set teacher_attendance=p_attendance,teacher_signature=p_signature,teacher_returned_counts=p_returns,menu_snapshot=m,teacher_meal_count=p_count,teacher_comments=trim(coalesce(p_comments,'')),teacher_certified=true,teacher_submitted_at=clock_timestamp(),teacher_revision=teacher_revision+1,updated_at=clock_timestamp(),review_status=case when worker_submitted_at is null then 'awaiting_return' else 'needs_review' end where id=d.id returning * into d;
 insert into public.breakfast_events(classroom_id,location_id,daily_record_id,action,actor_role,actor_name,before_data,after_data) values(c.id,c.location_id,d.id,action_name,'teacher','Classroom QR',case when old.id is null then null else jsonb_build_object('count',old.teacher_meal_count,'comments',old.teacher_comments,'revision',old.teacher_revision,'attendance',old.teacher_attendance,'signature',old.teacher_signature,'returns',old.teacher_returned_counts) end,jsonb_build_object('count',d.teacher_meal_count,'comments',d.teacher_comments,'certified',true,'revision',d.teacher_revision,'attendance',d.teacher_attendance,'signature',d.teacher_signature,'returns',d.teacher_returned_counts,'menu',d.menu_snapshot));
 return public.breakfast_teacher_page(p_qr);
end $$;
revoke all on function public.breakfast_teacher_submit_v2(uuid,date,integer,text,boolean,integer,integer,jsonb,jsonb,jsonb) from public;
grant execute on function public.breakfast_teacher_submit_v2(uuid,date,integer,text,boolean,integer,integer,jsonb,jsonb,jsonb) to anon,authenticated;
create function public.breakfast_teacher_preorder_v2(p_qr uuid,p_date date,p_for_date date,p_counts jsonb,p_menu jsonb,p_revision integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c breakfast_classrooms;d breakfast_daily_records;target date;m jsonb;entries jsonb;summary text;total integer;
begin
 c:=breakfast_require_qr(p_qr);
 if p_date is distinct from (clock_timestamp() at time zone 'America/Los_Angeles')::date then raise exception 'The service date changed. Refresh for today.';end if;
 target:=breakfast_next_service_date(c.location_id,p_date);
 if p_for_date is distinct from target then raise exception 'The next breakfast date changed. Refresh before pre-ordering.';end if;
 select items into m from breakfast_menus where location_id=c.location_id and service_date=target for share;
 select coalesce(jsonb_object_agg(key,value),'{}') into m from jsonb_each(coalesce(m,'{}')) where key in('entree1','entree2','vegan','other') and value<>'""'::jsonb;
 if m='{}' then raise exception 'The cafeteria has not posted the next breakfast menu yet.';end if;
 if p_menu is distinct from m then raise exception 'The next breakfast menu changed. Refresh before pre-ordering.';end if;
 if breakfast_counts_match_menu(p_counts,m) is not true or exists(select 1 from jsonb_each_text(p_counts) where value::integer>1000) then raise exception 'Enter a whole quantity from 0 to 1000 for each entree.';end if;
 if (select sum(value::integer) from jsonb_each_text(p_counts))>1000 then raise exception 'The total pre-order cannot exceed 1000.';end if;
 entries:=jsonb_build_object('menu',m,'counts',p_counts);
 select * into d from breakfast_daily_records where classroom_id=c.id and service_date=p_date for update;
 if d.teacher_submitted_at is null or not d.teacher_certified then raise exception 'Submit today''s breakfast count first.';end if;
 if d.preorder_date=target and d.preorder_items=entries and p_revision in(d.preorder_revision,d.preorder_revision-1) then return breakfast_teacher_page(p_qr);end if;
 if p_revision is distinct from d.preorder_revision then raise exception 'This pre-order changed. Refresh before editing.';end if;
 select string_agg((m->>key)||': '||value,' · ' order by key),sum(value::integer) into summary,total from jsonb_each_text(p_counts);
 update breakfast_daily_records set preorder_date=target,preorder_items=entries,preorder_entree=summary,preorder_count=total,preorder_revision=preorder_revision+1,preorder_submitted_at=clock_timestamp(),updated_at=clock_timestamp() where id=d.id;
 return breakfast_teacher_page(p_qr);
end $$;
-- Retain the legacy per-order maximum; combined quantities are stored in item-level JSON.
-- The legacy summary count is bounded by the existing record constraint.
create function public.breakfast_returns_report(p_token text,p_from date,p_to date,p_classroom uuid default null,p_location bigint default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s supper_monitoring_sessions;loc bigint;
begin
 if public.verify_supervisor_pin(p_token) then loc:=p_location;
 else s:=breakfast_require_manager(p_token);loc:=s.location_id;if p_location is not null and p_location<>loc then raise exception 'School access required.';end if;end if;
 if loc is null then raise exception 'Select a school.';end if;
 perform breakfast_require_enabled(loc);
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of up to one year.';end if;
 if p_classroom is not null and not exists(select 1 from breakfast_classrooms where id=p_classroom and location_id=loc) then raise exception 'Classroom unavailable for this school.';end if;
 return jsonb_build_object('classrooms',coalesce((select jsonb_agg(jsonb_build_object('id',id,'room',room_code,'campus',campus_label) order by room_code) from breakfast_classrooms where location_id=loc),'[]'),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('date',service_date,'classroom_id',classroom_id,'room',room_snapshot,'campus',campus_snapshot,'menu',menu_snapshot,'counts',coalesce(teacher_returned_counts,returned_counts),'sent',items_sent,'source',case when teacher_returned_counts is not null then 'Teacher' else 'Cafeteria worker' end) order by service_date,room_snapshot) from breakfast_daily_records where location_id=loc and service_date between p_from and p_to and (p_classroom is null or classroom_id=p_classroom) and ((teacher_returned_counts is not null and teacher_certified and teacher_submitted_at is not null) or (worker_certified and worker_submitted_at is not null))),'[]'));
end $$;
revoke all on function public.breakfast_teacher_preorder_v2(uuid,date,date,jsonb,jsonb,integer),public.breakfast_returns_report(text,date,date,uuid,bigint) from public;
grant execute on function public.breakfast_teacher_preorder_v2(uuid,date,date,jsonb,jsonb,integer),public.breakfast_returns_report(text,date,date,uuid,bigint) to anon,authenticated;
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
  if exists(select 1 from breakfast_daily_records where location_id=s.location_id and service_date=p_date and (packing_submitted_at is not null or (teacher_signature is not null and menu_snapshot<>'{}')) and menu_snapshot<>m) then raise exception 'Packing or signed reporting has started for this menu. Its item names are preserved for today’s packing and returns.';end if;
  update breakfast_menus set items=m where location_id=s.location_id and service_date=p_date;
 end if;
 return coalesce((select items from breakfast_menus where location_id=s.location_id and service_date=p_date),'{}');
end $$;

create function public.breakfast_copy_menu(p_token text,p_source date,p_destination date,p_expected jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s supper_monitoring_sessions;m jsonb;existing jsonb;
begin
 s:=breakfast_require_manager(p_token);
 if p_source is null or p_destination is null or p_source=p_destination then raise exception 'Choose different source and destination dates.';end if;
 insert into breakfast_menus(location_id,service_date,items) values(s.location_id,p_destination,'{}') on conflict do nothing;
 select items into existing from breakfast_menus where location_id=s.location_id and service_date=p_destination for update;
 if existing is distinct from p_expected then raise exception 'The destination menu changed. Review it before copying.';end if;
 select items into m from breakfast_menus where location_id=s.location_id and service_date=p_source;
 if m is null or m='{}' then raise exception 'The source date has no menu to copy.';end if;
 return breakfast_menu(p_token,p_destination,m);
end $$;
revoke all on function public.breakfast_copy_menu(text,date,date,jsonb) from public;
grant execute on function public.breakfast_copy_menu(text,date,date,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
