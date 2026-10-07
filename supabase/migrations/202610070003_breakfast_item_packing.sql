begin;
-- Offer versus serve packing records item quantities; a whole-meal sent total is optional for older clients.
create or replace function public.breakfast_worker_pack(p_qr uuid,p_token uuid,p_date date,p_sent integer,p_items jsonb,p_menu jsonb,p_certified boolean,p_revision integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.breakfast_worker_sessions;c public.breakfast_classrooms;d public.breakfast_daily_records;m jsonb;n text;
begin
 s:=public.breakfast_require_worker(p_qr,p_token);
 select * into c from breakfast_classrooms where id=s.classroom_id;
 if p_date is distinct from (clock_timestamp() at time zone 'America/Los_Angeles')::date then raise exception 'The service date changed. Refresh for today.';end if;
 -- Serialize menu edits with packing. Lock order is classroom, then menu.
 select public.breakfast_active_menu(items) into m from breakfast_menus where location_id=c.location_id and service_date=p_date for share;
 if m is null or m='{}' then raise exception 'The manager must enter today’s breakfast menu before packing.';end if;
 if p_menu is distinct from m then raise exception 'Today’s menu changed. Refresh before packing.';end if;
 if p_certified is distinct from true then raise exception 'Confirm the packed quantities are accurate.';end if;
 if (p_sent is not null and p_sent not between 0 and 10000) or public.breakfast_counts_match_menu(p_items,m) is distinct from true then raise exception 'Enter a quantity from 0 to 10000 for every menu item.';end if;
 select * into d from breakfast_daily_records where classroom_id=c.id and service_date=p_date for update;
 if d.packing_submitted_at is not null and d.number_sent is not distinct from p_sent and d.items_sent=p_items and p_revision in(d.packing_revision,d.packing_revision-1) then return public.breakfast_worker_page(p_qr,p_token);end if;
 if p_revision is distinct from coalesce(d.packing_revision,0) then raise exception 'Packing changed in another session. Refresh before correcting.';end if;
 if d.id is null then
  insert into breakfast_daily_records(classroom_id,location_id,service_date,room_snapshot,teacher_snapshot,enrollment_snapshot,campus_snapshot) values(c.id,c.location_id,p_date,c.room_code,c.teacher_name,c.enrolled_students,c.campus_label) returning * into d;
 end if;
 select name into n from breakfast_worker_roster(c.location_id) where id=s.staff_key;
 update breakfast_daily_records set number_sent=p_sent,items_sent=p_items,menu_snapshot=m,packing_submitted_at=clock_timestamp(),packing_worker_name=n,packing_revision=packing_revision+1,
 worker_submitted_at=case when menu_snapshot<>m then null else worker_submitted_at end,worker_certified=case when menu_snapshot<>m then false else worker_certified end,
 reviewed_at=null,reviewed_by=null,review_status=case when teacher_submitted_at is null then 'awaiting_teacher' when worker_submitted_at is null or menu_snapshot<>m then 'awaiting_return' else 'needs_review' end,updated_at=clock_timestamp() where id=d.id;
 insert into breakfast_events(classroom_id,location_id,daily_record_id,action,actor_role,actor_employee_id,actor_name,after_data) values(c.id,c.location_id,d.id,'worker_packing','worker',s.employee_id,n,jsonb_build_object('sent',p_sent,'items',p_items,'menu',m));
 return public.breakfast_worker_page(p_qr,p_token);
end $$;
notify pgrst,'reload schema';
commit;
