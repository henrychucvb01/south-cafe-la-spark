begin;
set local lock_timeout='5s';
-- Teacher counts no longer require cafeteria returns. Preserve existing returns on count corrections.
create or replace function public.breakfast_teacher_submit_v2(p_qr uuid,p_date date,p_count integer,p_comments text,p_certified boolean,p_revision integer,p_attendance integer,p_signature jsonb,p_returns jsonb,p_menu jsonb) returns jsonb
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
 if p_returns is not null and (not (m='{}' and p_returns='{}') and public.breakfast_counts_match_menu(p_returns,m) is not true) then raise exception 'Enter whole returned quantities for each menu item.';end if;
 -- Same payload retry succeeds without another award/event/revision.
 if old.teacher_submitted_at is not null and old.teacher_meal_count=p_count and old.teacher_comments=trim(coalesce(p_comments,'')) and old.teacher_attendance=p_attendance and old.teacher_signature=p_signature and old.teacher_returned_counts is not distinct from coalesce(p_returns,old.teacher_returned_counts) and p_revision in (old.teacher_revision,old.teacher_revision-1) then return public.breakfast_teacher_page(p_qr);end if;
 if old.teacher_signature=p_signature and (old.teacher_attendance is distinct from p_attendance or old.teacher_meal_count is distinct from p_count or old.teacher_returned_counts is distinct from coalesce(p_returns,old.teacher_returned_counts)) then raise exception 'Counts changed. Sign again before submitting.';end if;
 if p_revision is distinct from coalesce(old.teacher_revision,0) then raise exception 'This count changed in another session. Refresh and review the latest count before correcting it.';end if;
 if old.id is null then
  insert into public.breakfast_daily_records(classroom_id,location_id,service_date,room_snapshot,teacher_snapshot,enrollment_snapshot,campus_snapshot) values(c.id,c.location_id,p_date,c.room_code,c.teacher_name,c.enrolled_students,c.campus_label) returning * into d;
 else d:=old;end if;
 action_name:=case when old.teacher_submitted_at is null then 'teacher_submission' else 'teacher_correction' end;
 update public.breakfast_daily_records set teacher_attendance=p_attendance,teacher_signature=p_signature,teacher_returned_counts=coalesce(p_returns,old.teacher_returned_counts),menu_snapshot=m,teacher_meal_count=p_count,teacher_comments=trim(coalesce(p_comments,'')),teacher_certified=true,teacher_submitted_at=clock_timestamp(),teacher_revision=teacher_revision+1,updated_at=clock_timestamp(),review_status=case when worker_submitted_at is null and coalesce(p_returns,old.teacher_returned_counts) is null then 'awaiting_return' else 'needs_review' end where id=d.id returning * into d;
 insert into public.breakfast_events(classroom_id,location_id,daily_record_id,action,actor_role,actor_name,before_data,after_data) values(c.id,c.location_id,d.id,action_name,'teacher','Classroom QR',case when old.id is null then null else jsonb_build_object('count',old.teacher_meal_count,'comments',old.teacher_comments,'revision',old.teacher_revision,'attendance',old.teacher_attendance,'signature',old.teacher_signature,'returns',old.teacher_returned_counts) end,jsonb_build_object('count',d.teacher_meal_count,'comments',d.teacher_comments,'certified',true,'revision',d.teacher_revision,'attendance',d.teacher_attendance,'signature',d.teacher_signature,'returns',d.teacher_returned_counts,'menu',d.menu_snapshot));
 return public.breakfast_teacher_page(p_qr);
end $$;
-- School manager corrections bypass teacher cutoff, but require the same school,
-- an explicit confirmation, and the latest record version. Keep before/after audit.
create function public.breakfast_edit_day(p_token text,p_id uuid,p_date date,p_updated timestamptz,p_values jsonb,p_reset boolean,p_confirmed boolean) returns void
language plpgsql security definer set search_path='' as $$
declare s public.supper_monitoring_sessions;old public.breakfast_daily_records;d public.breakfast_daily_records;n integer;a integer;r jsonb;adult boolean;
begin
 s:=public.breakfast_require_manager(p_token);
 if p_confirmed is distinct from true then raise exception 'Confirm the correction or reset before saving.';end if;
 if p_reset is null then raise exception 'Choose a correction or reset.';end if;
 perform 1 from public.breakfast_classrooms where id=p_id and location_id=s.location_id for update;
 select * into old from public.breakfast_daily_records where classroom_id=p_id and location_id=s.location_id and service_date=p_date for update;
 if old.id is null then raise exception 'Classroom record not found for this school.';end if;
 if p_updated is distinct from old.updated_at then raise exception 'This record changed. Refresh history before editing.';end if;
 if p_reset then
  update public.breakfast_daily_records set
   teacher_meal_count=null,teacher_attendance=null,teacher_signature=null,teacher_returned_counts=null,teacher_certified=false,teacher_submitted_at=null,teacher_comments='',teacher_revision=teacher_revision+1,
   adult_meal_received=false,adult_meal_recorded_at=null,adult_meal_revision=adult_meal_revision+1,
   number_sent=null,items_sent='{}',menu_snapshot='{}',packing_submitted_at=null,packing_worker_name=null,packing_revision=packing_revision+1,
   returned_counts='{}',worker_submitted_at=null,worker_certified=false,worker_notes='',worker_name=null,worker_revision=worker_revision+1,
   preorder_date=null,preorder_entree=null,preorder_count=null,preorder_items=null,preorder_submitted_at=null,preorder_revision=preorder_revision+1,
   discrepancy=null,review_status='not_started',manager_notes='',reviewed_at=null,reviewed_by=null,updated_at=clock_timestamp()
  where id=old.id returning * into d;
 else
  if jsonb_typeof(p_values) is distinct from 'object' or coalesce(p_values->>'count','') !~ '^\d{1,5}$' or (p_values->>'count')::integer>10000 then raise exception 'Enter a whole meal count from 0 to 10000.';end if;
  n:=(p_values->>'count')::integer;
  if p_values->>'attendance' is not null and ((p_values->>'attendance') !~ '^\d{1,5}$' or (p_values->>'attendance')::integer>10000) then raise exception 'Enter whole attendance from 0 to 10000.';end if;
  a:=(p_values->>'attendance')::integer;
  if jsonb_typeof(p_values->'adult') is distinct from 'boolean' then raise exception 'Choose the teacher adult meal status.';end if;
  adult:=(p_values->>'adult')::boolean;r:=p_values->'returns';
  if public.breakfast_valid_items(r) is not true or (select array_agg(key order by key) from jsonb_object_keys(r) key) is distinct from (select array_agg(key order by key) from jsonb_object_keys(coalesce(old.teacher_returned_counts,old.returned_counts)) key) then raise exception 'Enter whole returned quantities for the existing items.';end if;
  update public.breakfast_daily_records set teacher_meal_count=n,teacher_attendance=a,
   teacher_revision=teacher_revision+1,teacher_submitted_at=coalesce(teacher_submitted_at,clock_timestamp()),
   teacher_returned_counts=case when old.teacher_returned_counts is not null then r else null end,
   returned_counts=case when old.teacher_returned_counts is null then r else returned_counts end,
   worker_revision=worker_revision+1,adult_meal_received=adult,
   adult_meal_recorded_at=case when adult or old.adult_meal_recorded_at is not null then clock_timestamp() else null end,adult_meal_revision=adult_meal_revision+1,
   review_status=case when worker_submitted_at is null and teacher_returned_counts is null then 'awaiting_return' else 'needs_review' end,
   reviewed_at=null,reviewed_by=null,updated_at=clock_timestamp()
  where id=old.id returning * into d;
 end if;
 insert into public.breakfast_events(classroom_id,location_id,daily_record_id,action,actor_role,actor_employee_id,actor_name,before_data,after_data)
 values(d.classroom_id,d.location_id,d.id,case when p_reset then 'manager_day_reset' else 'manager_day_correction' end,'manager',s.employee_id,s.monitor_name,to_jsonb(old),to_jsonb(d));
end $$;
revoke all on function public.breakfast_edit_day(text,uuid,date,timestamptz,jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.breakfast_edit_day(text,uuid,date,timestamptz,jsonb,boolean,boolean) to anon,authenticated;
notify pgrst,'reload schema';
commit;
