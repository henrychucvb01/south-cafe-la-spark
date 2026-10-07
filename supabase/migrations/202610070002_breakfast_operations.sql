begin;
alter table public.breakfast_daily_records
 add column packing_submitted_at timestamptz,
 add column packing_worker_name text,
 add column reviewed_at timestamptz,
 add column reviewed_by text;
-- Use the existing configured default for all Breakfast worker access.
update public.breakfast_worker_access set pin_hash=default,revision=revision+1,failures=0,locked_until=null;

create function public.breakfast_active_menu(p_items jsonb) returns jsonb
language sql immutable set search_path=public,pg_temp as $$
 select coalesce(jsonb_object_agg(key,trim(value#>>'{}')),'{}') from jsonb_each(coalesce(p_items,'{}'))
 where key in ('entree1','entree2','vegan','juice','fruit','milk1','milkNonfat','milkLactaid','other') and nullif(trim(value#>>'{}'),'') is not null
$$;
create function public.breakfast_counts_match_menu(p_counts jsonb,p_menu jsonb) returns boolean
language sql immutable set search_path=public,pg_temp as $$
 select public.breakfast_valid_items(p_counts) and p_menu<>'{}'
 and (select array_agg(key order by key) from jsonb_object_keys(p_counts) key)=(select array_agg(key order by key) from jsonb_object_keys(p_menu) key)
$$;
revoke all on function public.breakfast_active_menu(jsonb),public.breakfast_counts_match_menu(jsonb,jsonb) from public,anon,authenticated;
create or replace function public.breakfast_worker_page(p_qr uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.breakfast_worker_sessions;c public.breakfast_classrooms;d public.breakfast_daily_records;today date;
begin
 s:=public.breakfast_require_worker(p_qr,p_token);
 select * into c from public.breakfast_classrooms where id=s.classroom_id;
 today:=(clock_timestamp() at time zone 'America/Los_Angeles')::date;
 select * into d from public.breakfast_daily_records where classroom_id=c.id and service_date=today;
 return jsonb_build_object('room',coalesce(d.room_snapshot,c.room_code),'teacher',coalesce(d.teacher_snapshot,c.teacher_name),'service_date',today,
 'packing_submitted_at',d.packing_submitted_at,'packing_worker_name',d.packing_worker_name,'packing_revision',coalesce(d.packing_revision,0),'sent',d.number_sent,'items_sent',coalesce(d.items_sent,'{}'),'teacher_count',d.teacher_meal_count,'teacher_submitted_at',d.teacher_submitted_at,
 'menu',public.breakfast_active_menu(case when d.packing_submitted_at is not null then d.menu_snapshot else coalesce((select items from public.breakfast_menus where location_id=c.location_id and service_date=today),'{}') end),
 'counts',coalesce(d.returned_counts,'{}'),'notes',coalesce(d.worker_notes,''),'revision',coalesce(d.worker_revision,0),
 'submitted_at',d.worker_submitted_at,'worker_name',d.worker_name);
end $$;

create function public.breakfast_worker_pack(p_qr uuid,p_token uuid,p_date date,p_sent integer,p_items jsonb,p_menu jsonb,p_certified boolean,p_revision integer) returns jsonb
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
 if p_sent is null or p_sent not between 0 and 10000 or public.breakfast_counts_match_menu(p_items,m) is distinct from true then raise exception 'Enter a quantity from 0 to 10000 for every menu item and the meals sent.';end if;
 select * into d from breakfast_daily_records where classroom_id=c.id and service_date=p_date for update;
 if d.packing_submitted_at is not null and d.number_sent=p_sent and d.items_sent=p_items and p_revision in(d.packing_revision,d.packing_revision-1) then return public.breakfast_worker_page(p_qr,p_token);end if;
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
create or replace function public.breakfast_worker_submit(p_qr uuid,p_token uuid,p_date date,p_counts jsonb,p_notes text,p_certified boolean,p_revision integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.breakfast_worker_sessions;c public.breakfast_classrooms;d public.breakfast_daily_records;old public.breakfast_daily_records;n text;menu jsonb;
begin
 s:=public.breakfast_require_worker(p_qr,p_token);
 select * into c from public.breakfast_classrooms where id=s.classroom_id;
 if p_date is distinct from (clock_timestamp() at time zone 'America/Los_Angeles')::date then raise exception 'The service date changed. Refresh for today.';end if;
 if p_certified is distinct from true then raise exception 'Confirm these return counts are accurate.';end if;
 select * into old from public.breakfast_daily_records where classroom_id=c.id and service_date=p_date for update;
 if old.packing_submitted_at is null then raise exception 'Submit the morning packing counts first.';end if;
 if public.breakfast_counts_match_menu(p_counts,old.menu_snapshot) is distinct from true or length(coalesce(p_notes,''))>2000 then raise exception 'Enter a return count from 0 to 10000 for every packed menu item.';end if;
 if old.worker_submitted_at is not null and old.returned_counts=p_counts and old.worker_notes=trim(coalesce(p_notes,'')) and p_revision in(old.worker_revision,old.worker_revision-1) then return public.breakfast_worker_page(p_qr,p_token);end if;
 if p_revision is distinct from coalesce(old.worker_revision,0) then raise exception 'Return counts changed in another session. Refresh and review before correcting.';end if;
 if old.id is null then
  insert into public.breakfast_daily_records(classroom_id,location_id,service_date,room_snapshot,teacher_snapshot,enrollment_snapshot,campus_snapshot) values(c.id,c.location_id,p_date,c.room_code,c.teacher_name,c.enrolled_students,c.campus_label) returning * into d;
 else d:=old;end if;
 select name into n from public.breakfast_worker_roster(c.location_id) where id=s.staff_key;
 select items into menu from public.breakfast_menus where location_id=c.location_id and service_date=p_date;
 update public.breakfast_daily_records set returned_counts=p_counts,worker_notes=trim(coalesce(p_notes,'')),worker_certified=true,worker_name=n,
 reviewed_at=null,reviewed_by=null,worker_submitted_at=clock_timestamp(),worker_revision=worker_revision+1,menu_snapshot=coalesce(nullif(menu_snapshot,'{}'),menu,'{}'),updated_at=clock_timestamp(),
 -- Components are not whole meals. Do not invent a discrepancy by adding milk, fruit and entrée.
 review_status=case when teacher_submitted_at is null then 'awaiting_teacher' else 'needs_review' end
 where id=d.id returning * into d;
 insert into public.breakfast_events(classroom_id,location_id,daily_record_id,action,actor_role,actor_employee_id,actor_name,before_data,after_data)
 values(c.id,c.location_id,d.id,case when old.worker_submitted_at is null then 'worker_submission' else 'worker_correction' end,'worker',s.employee_id,n,
 case when old.id is null then null else jsonb_build_object('counts',old.returned_counts,'notes',old.worker_notes,'revision',old.worker_revision) end,
 jsonb_build_object('counts',d.returned_counts,'notes',d.worker_notes,'certified',true,'revision',d.worker_revision,'submitted_at',d.worker_submitted_at));
 return public.breakfast_worker_page(p_qr,p_token);
end $$;

-- Managers create the menu. Packing quantities are entered through Cafeteria Workers.
revoke execute on function public.breakfast_packing(text,uuid,date,boolean,integer,jsonb,integer) from anon,authenticated;
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

create function public.breakfast_daily_dashboard(p_token text,p_date date) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;rows jsonb;
begin
 s:=public.breakfast_require_manager(p_token);
 if p_date is null then raise exception 'Select a service date.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('classroom_id',c.id,'room',coalesce(d.room_snapshot,c.room_code),'teacher',coalesce(d.teacher_snapshot,c.teacher_name),
 'campus',coalesce(d.campus_snapshot,c.campus_label),'record',case when d.id is null then null else to_jsonb(d) end) order by c.campus_label,c.room_code),'[]') into rows
 from breakfast_classrooms c left join breakfast_daily_records d on d.classroom_id=c.id and d.service_date=p_date
 where c.location_id=s.location_id and (d.id is not null or (c.active and (c.created_at at time zone 'America/Los_Angeles')::date<=p_date));
 return jsonb_build_object('date',p_date,'rows',rows,'total',coalesce((select sum(teacher_meal_count) from breakfast_daily_records where location_id=s.location_id and service_date=p_date and teacher_certified and teacher_submitted_at is not null),0));
end $$;
create function public.breakfast_review_day(p_token text,p_id uuid,p_date date,p_updated timestamptz,p_notes text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;d public.breakfast_daily_records;
begin
 s:=public.breakfast_require_manager(p_token);
 perform 1 from breakfast_classrooms where id=p_id and location_id=s.location_id for update;
 select * into d from breakfast_daily_records where classroom_id=p_id and location_id=s.location_id and service_date=p_date for update;
 if d.id is null then raise exception 'Classroom record not found for this school.';end if;
 if p_updated is distinct from d.updated_at then raise exception 'This record changed. Refresh before reviewing.';end if;
 if d.packing_submitted_at is null or d.teacher_submitted_at is null or d.worker_submitted_at is null then raise exception 'Packing, teacher count, and returns are required before completing review.';end if;
 if length(coalesce(p_notes,''))>2000 then raise exception 'Use review notes up to 2000 characters.';end if;
 update breakfast_daily_records set manager_notes=trim(coalesce(p_notes,'')),review_status='reviewed',reviewed_at=clock_timestamp(),reviewed_by=s.monitor_name,updated_at=clock_timestamp() where id=d.id;
end $$;
-- Any correction invalidates the previous review, including teacher corrections.
create function public.breakfast_invalidate_review() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.teacher_revision<>old.teacher_revision or new.worker_revision<>old.worker_revision or new.packing_revision<>old.packing_revision then new.reviewed_at:=null;new.reviewed_by:=null;end if;
 return new;
end $$;
create trigger breakfast_invalidate_review before update on breakfast_daily_records for each row execute function breakfast_invalidate_review();
revoke all on function public.breakfast_invalidate_review() from public,anon,authenticated;
revoke all on function public.breakfast_worker_pack(uuid,uuid,date,integer,jsonb,jsonb,boolean,integer),public.breakfast_daily_dashboard(text,date),public.breakfast_review_day(text,uuid,date,timestamptz,text) from public;
grant execute on function public.breakfast_worker_pack(uuid,uuid,date,integer,jsonb,jsonb,boolean,integer),public.breakfast_daily_dashboard(text,date),public.breakfast_review_day(text,uuid,date,timestamptz,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
