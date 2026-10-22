begin;
set local lock_timeout='5s';
-- Briefly serialize deployment with writes and assert the original BIC data is unchanged.
lock table public.breakfast_classrooms,public.breakfast_daily_records,public.breakfast_menus,public.breakfast_events in share mode;
do $preserve$begin perform set_config('spark.bic_data_before',(jsonb_build_object('classrooms',(select md5(coalesce(string_agg(md5(to_jsonb(c)::text),'' order by id),'')) from public.breakfast_classrooms c),'records',(select md5(coalesce(string_agg(md5(to_jsonb(d)::text),'' order by id),'')) from public.breakfast_daily_records d),'menus',(select md5(coalesce(string_agg(md5(to_jsonb(m)::text),'' order by location_id,service_date),'')) from public.breakfast_menus m),'events',(select md5(coalesce(string_agg(md5(to_jsonb(e)::text),'' order by id),'')) from public.breakfast_events e)))::text,true);end$preserve$;
-- Additive configuration only. Existing classrooms, QR tokens, orders and menus are untouched.
create table public.breakfast_menu_group_settings(location_id bigint primary key references public.locations(id),revision integer not null default 0);
create table public.breakfast_menu_groups(id uuid primary key default gen_random_uuid(),location_id bigint not null references public.locations(id),name text not null check(length(trim(name)) between 1 and 80),kind text not null check(kind in('main','milk')),unique(id,location_id));
create unique index breakfast_menu_group_name on public.breakfast_menu_groups(location_id,lower(trim(name)));
create table public.breakfast_menu_group_members(group_id uuid not null,location_id bigint not null,classroom_id uuid not null,primary key(group_id,classroom_id),foreign key(group_id,location_id) references public.breakfast_menu_groups(id,location_id) on delete cascade,foreign key(classroom_id,location_id) references public.breakfast_classrooms(id,location_id));
create index breakfast_menu_member_class on public.breakfast_menu_group_members(classroom_id);
create table public.breakfast_group_daily_menus(group_id uuid not null,location_id bigint not null,service_date date not null,items jsonb not null check(jsonb_typeof(items)='object'),primary key(group_id,service_date),foreign key(group_id,location_id) references public.breakfast_menu_groups(id,location_id) on delete cascade);
create table public.breakfast_classroom_daily_menus(classroom_id uuid not null,location_id bigint not null,service_date date not null,items jsonb not null check(jsonb_typeof(items)='object'),primary key(classroom_id,service_date),foreign key(classroom_id,location_id) references public.breakfast_classrooms(id,location_id));
create table public.breakfast_menu_group_audit(id bigint generated always as identity primary key,location_id bigint not null references public.locations(id),action text not null,actor_name text not null,details jsonb not null,created_at timestamptz not null default clock_timestamp());
do $$declare t text;begin foreach t in array array['breakfast_menu_group_settings','breakfast_menu_groups','breakfast_menu_group_members','breakfast_group_daily_menus','breakfast_classroom_daily_menus','breakfast_menu_group_audit'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;end$$;
revoke all on sequence public.breakfast_menu_group_audit_id_seq from public,anon,authenticated;
create index breakfast_group_menu_date on public.breakfast_group_daily_menus(location_id,service_date);
create index breakfast_menu_audit_school on public.breakfast_menu_group_audit(location_id,created_at desc);
create index breakfast_preorder_target on public.breakfast_daily_records(classroom_id,preorder_date,preorder_submitted_at desc) where preorder_submitted_at is not null;

-- All menu readers/writers share this school lock. No classroom lock is taken by group edits.
create function public.breakfast_lock_menus(p_location bigint) returns void language sql security definer set search_path='' as $$select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('breakfast-menu:'||p_location::text,0))$$;
revoke all on function public.breakfast_lock_menus(bigint) from public,anon,authenticated;

-- Keep an explicit key for authorized non-dairy/special milk; never mislabel it as Lactaid.
do $$declare signature text;definition text;begin
 foreach signature in array array['public.breakfast_valid_items(jsonb,boolean)','public.breakfast_active_menu(jsonb)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  definition:=replace(definition,'''milkLactaid'',''other''','''milkLactaid'',''milkSpecial'',''other''');
  execute definition;
 end loop;
end$$;

create function public.breakfast_resolve_classroom_menu(p_class uuid,p_date date,p_snapshots boolean default true) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c breakfast_classrooms;d breakfast_daily_records;ordered jsonb;m jsonb;chosen jsonb;milk jsonb;g record;warnings jsonb:='[]';sources jsonb:='[]';main_set boolean:=false;milk_set boolean:=false;override_menu jsonb;
begin
 select * into c from breakfast_classrooms where id=p_class;
 if c.id is null or p_date is null then raise exception 'Classroom and service date required.';end if;
 perform breakfast_lock_menus(c.location_id);
 if p_snapshots then
  select * into d from breakfast_daily_records where classroom_id=c.id and service_date=p_date;
  if d.id is not null and (d.packing_submitted_at is not null or d.teacher_submitted_at is not null or d.teacher_signature is not null) then
   return jsonb_build_object('menu',d.menu_snapshot,'conflicts','[]'::jsonb,'source','Saved service record','snapshot',true);
  end if;
  select preorder_items into ordered from breakfast_daily_records where classroom_id=c.id and preorder_date=p_date and preorder_submitted_at is not null and preorder_items->'menu' is not null order by preorder_submitted_at desc limit 1;
  if ordered is not null then return jsonb_build_object('menu',ordered->'menu','conflicts','[]'::jsonb,'source','Saved teacher pre-order','snapshot',true);end if;
 end if;
 select items into override_menu from breakfast_classroom_daily_menus where classroom_id=c.id and service_date=p_date;
 if override_menu is not null then return jsonb_build_object('menu',override_menu,'conflicts','[]'::jsonb,'source','Classroom resolution','snapshot',false);end if;
 select breakfast_active_menu(items) into m from breakfast_menus where location_id=c.location_id and service_date=p_date;
 m:=coalesce(m,'{}')-'milkSpecial';
 for g in select gr.*,dm.items from breakfast_menu_groups gr join breakfast_menu_group_members gm on gm.group_id=gr.id left join breakfast_group_daily_menus dm on dm.group_id=gr.id and dm.service_date=p_date where gm.classroom_id=c.id order by gr.name loop
  sources:=sources||jsonb_build_array(g.name);
  if g.items is null then warnings:=warnings||jsonb_build_array(g.name||' has no menu for this date.');continue;end if;
  if g.kind='main' then
   if main_set and chosen is distinct from g.items then warnings:=warnings||jsonb_build_array('Main menu conflict: '||g.name||'. Choose an explicit classroom menu.');end if;
   chosen:=g.items;main_set:=true;
  else
   if milk_set and milk is distinct from g.items then warnings:=warnings||jsonb_build_array('Milk menu conflict: '||g.name||'. Choose approved milk options for this classroom.');end if;
   milk:=g.items;milk_set:=true;
  end if;
 end loop;
 if main_set then m:=chosen;elsif exists(select 1 from breakfast_menu_groups where location_id=c.location_id) then m:=m-'vegan'-'other'-'milkLactaid'-'milkSpecial';end if;
 -- Milk groups can replace milk choices only; removed entrees/food never return.
 if milk_set then m:=(m-'milk1'-'milkNonfat'-'milkLactaid'-'milkSpecial')||milk;end if;
 if m='{}' then warnings:=warnings||jsonb_build_array('No available menu for this classroom and date.');end if;
 return jsonb_build_object('menu',case when jsonb_array_length(warnings)>0 then '{}'::jsonb else m end,'candidate',m,'conflicts',warnings,'groups',sources,'source',case when jsonb_array_length(sources)=0 then 'Standard BIC' else 'Classroom groups' end,'snapshot',false);
end$$;
revoke all on function public.breakfast_resolve_classroom_menu(uuid,date,boolean) from public,anon,authenticated;
create function public.breakfast_require_classroom_menu(p_class uuid,p_date date) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare resolved jsonb;begin resolved:=breakfast_resolve_classroom_menu(p_class,p_date);if resolved->'conflicts'=jsonb_build_array('No available menu for this classroom and date.') then return '{}'::jsonb;end if;if jsonb_array_length(resolved->'conflicts')>0 then raise exception 'Classroom menu unavailable. The cafeteria must resolve its menu groups for this date.';end if;return resolved->'menu';end$$;
revoke all on function public.breakfast_require_classroom_menu(uuid,date) from public,anon,authenticated;

create function public.breakfast_menu_workspace(p_token text,p_date date,p_action text default 'list',p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s supper_monitoring_sessions;rev integer;gid uuid;g breakfast_menu_groups;items jsonb;old_items jsonb;cid uuid;members uuid[];before_data jsonb;target date;group_key text;
begin
 s:=breakfast_require_manager(p_token);if p_date is null then raise exception 'Select a service date.';end if;
 perform breakfast_lock_menus(s.location_id);
 select revision into rev from breakfast_menu_group_settings where location_id=s.location_id;rev:=coalesce(rev,0);
 if p_action='preview' then
  cid:=(p_payload->>'classroom_id')::uuid;
  if not exists(select 1 from breakfast_classrooms where id=cid and location_id=s.location_id) then raise exception 'Classroom not found for this school.';end if;
  return breakfast_resolve_classroom_menu(cid,p_date)||jsonb_build_object('classroom_id',cid,'service_date',p_date,'revision',rev);
 end if;
 if p_action<>'list' then
  if (p_payload->>'revision')::integer is distinct from rev then raise exception 'Menu configuration changed. Refresh before saving.';end if;
  if p_action='group_save' then
   gid:=nullif(p_payload->>'id','')::uuid;
   if nullif(trim(p_payload->>'name'),'') is null or length(trim(p_payload->>'name'))>80 or lower(trim(p_payload->>'name'))='standard bic' or coalesce(p_payload->>'kind','') not in('main','milk') then raise exception 'Enter a unique group name and choose Main menu or Milk only.';end if;
   if jsonb_typeof(p_payload->'members') is distinct from 'array' then raise exception 'Select classrooms for the group.';end if;
   select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into members from jsonb_array_elements_text(p_payload->'members');
   if exists(select 1 from unnest(members) chosen(classroom_id) where not exists(select 1 from breakfast_classrooms c where c.id=chosen.classroom_id and c.location_id=s.location_id)) then raise exception 'Classrooms must belong to your school.';end if;
   if gid is null then
    insert into breakfast_menu_groups(location_id,name,kind) values(s.location_id,trim(p_payload->>'name'),p_payload->>'kind') returning id into gid;
   else
    select * into g from breakfast_menu_groups where id=gid and location_id=s.location_id;
    if g.id is null then raise exception 'Group not found for this school.';end if;
    if g.kind<>p_payload->>'kind' then raise exception 'Create a new group to change its menu type.';end if;
    before_data:=to_jsonb(g)||jsonb_build_object('members',(select coalesce(jsonb_agg(classroom_id),'[]') from breakfast_menu_group_members where group_id=gid));
    update breakfast_menu_groups set name=trim(p_payload->>'name') where id=gid;
    delete from breakfast_menu_group_members where group_id=gid;
   end if;
   insert into breakfast_menu_group_members(group_id,location_id,classroom_id) select gid,s.location_id,id from unnest(members) id;
  elsif p_action='group_delete' then
   gid:=(p_payload->>'id')::uuid;
   select * into g from breakfast_menu_groups where id=gid and location_id=s.location_id;
   if g.id is null then raise exception 'Group not found for this school.';end if;
   if (p_payload->>'confirmed')::boolean is distinct from true then raise exception 'Confirm deleting this group and its future assignments.';end if;
   before_data:=to_jsonb(g)||jsonb_build_object('members',(select coalesce(jsonb_agg(classroom_id),'[]') from breakfast_menu_group_members where group_id=gid),'menus',(select coalesce(jsonb_agg(to_jsonb(dm)),'[]') from breakfast_group_daily_menus dm where group_id=gid));
   delete from breakfast_menu_groups where id=gid;
  elsif p_action in('menu_save','copy_date','classroom_save','classroom_clear') then
   gid:=nullif(p_payload->>'group_id','')::uuid;target:=case when p_action='copy_date' then (p_payload->>'destination')::date else p_date end;
   if target is null then raise exception 'Choose a destination date.';end if;
   if gid is not null then select * into g from breakfast_menu_groups where id=gid and location_id=s.location_id;if g.id is null then raise exception 'Group not found for this school.';end if;end if;
   if p_action in('classroom_save','classroom_clear') then
    cid:=(p_payload->>'classroom_id')::uuid;
    if not exists(select 1 from breakfast_classrooms where id=cid and location_id=s.location_id) then raise exception 'Classroom not found for this school.';end if;
    if (breakfast_resolve_classroom_menu(cid,p_date)->>'snapshot')::boolean then raise exception 'This date has a saved order or service record. Its menu is protected.';end if;
    select dm.items into old_items from breakfast_classroom_daily_menus dm where classroom_id=cid and service_date=p_date;
   elsif gid is null then select dm.items into old_items from breakfast_menus dm where location_id=s.location_id and service_date=target;
   else select dm.items into old_items from breakfast_group_daily_menus dm where group_id=gid and service_date=target;end if;
   if p_action='copy_date' then
    if target=p_date then raise exception 'Choose a different destination date.';end if;
    if gid is null then select dm.items into items from breakfast_menus dm where location_id=s.location_id and service_date=p_date;else select dm.items into items from breakfast_group_daily_menus dm where group_id=gid and service_date=p_date;end if;
    if items is null or items='{}' then raise exception 'The source date has no menu to copy.';end if;
   else items:=p_payload->'items';end if;
   if p_action<>'classroom_clear' then
    if breakfast_valid_items(items,true) is not true then raise exception 'Use valid menu fields with names up to 160 characters.';end if;
    items:=breakfast_active_menu(items);
    if gid is null and cid is null and items ? 'milkSpecial' then raise exception 'Assign special milk through a group or classroom resolution.';end if;
    if g.kind='milk' and exists(select 1 from jsonb_object_keys(items) k where k not in('milk1','milkNonfat','milkLactaid','milkSpecial')) then raise exception 'Milk-only groups may change milk options only.';end if;
   end if;
   if old_items is not null or p_action in('classroom_save','classroom_clear') then
    if (p_payload->>'confirmed')::boolean is distinct from true then raise exception 'Confirm replacing this saved menu or classroom resolution.';end if;
   end if;
   before_data:=jsonb_build_object('date',target,'group_id',gid,'classroom_id',cid,'items',old_items);
   if p_action='classroom_clear' then delete from breakfast_classroom_daily_menus where classroom_id=cid and service_date=p_date;
   elsif p_action='classroom_save' then insert into breakfast_classroom_daily_menus values(cid,s.location_id,p_date,items) on conflict(classroom_id,service_date) do update set items=excluded.items;
   elsif gid is null then perform breakfast_menu(p_token,target,items);
   else insert into breakfast_group_daily_menus values(gid,s.location_id,target,items) on conflict(group_id,service_date) do update set items=excluded.items;end if;
  else raise exception 'Unknown menu action.';end if;
  insert into breakfast_menu_group_settings(location_id,revision) values(s.location_id,rev+1) on conflict(location_id) do update set revision=excluded.revision;
  insert into breakfast_menu_group_audit(location_id,action,actor_name,details) values(s.location_id,p_action,s.monitor_name,jsonb_build_object('before',before_data,'after',(p_payload-'revision')||case when p_action in('menu_save','copy_date','classroom_save','classroom_clear') then jsonb_build_object('items',items,'service_date',target) else '{}'::jsonb end,'revision',rev+1));
  rev:=rev+1;
 end if;
 return jsonb_build_object('revision',rev,'service_date',p_date,'saved_groups',coalesce((select jsonb_agg(group_id::text) from breakfast_group_daily_menus where location_id=s.location_id and service_date=p_date),'[]')||case when exists(select 1 from breakfast_menus where location_id=s.location_id and service_date=p_date) then '["standard"]'::jsonb else '[]'::jsonb end,'groups',coalesce((select jsonb_agg(to_jsonb(gr)||jsonb_build_object('members',(select coalesce(jsonb_agg(classroom_id),'[]') from breakfast_menu_group_members gm where gm.group_id=gr.id),'count',(select count(*) from breakfast_menu_group_members gm where gm.group_id=gr.id)) order by gr.name) from breakfast_menu_groups gr where gr.location_id=s.location_id),'[]'),
 'classrooms',coalesce((select jsonb_agg(to_jsonb(c)-'qr_token' order by c.campus_label,c.room_code) from breakfast_classrooms c where location_id=s.location_id),'[]'),
 'menus',coalesce((select jsonb_object_agg(group_id::text,dm.items) from breakfast_group_daily_menus dm where dm.location_id=s.location_id and service_date=p_date),'{}')||jsonb_build_object('standard',coalesce((select dm.items from breakfast_menus dm where dm.location_id=s.location_id and service_date=p_date),'{}')));
exception when unique_violation then raise exception 'That group name already exists in this school.';
end$$;
revoke all on function public.breakfast_menu_workspace(text,date,text,jsonb) from public;
grant execute on function public.breakfast_menu_workspace(text,date,text,jsonb) to anon,authenticated;

-- Keep public RPC signatures and teacher QR tokens intact. Patch only menu lookup
-- sites in the established teacher / worker workflows; retain their validations.
do $patch$
declare def text;sig text;old_lookup text;replacement text;
begin
 foreach sig in array array['public.breakfast_teacher_submit_v2(uuid,date,integer,text,boolean,integer,integer,jsonb,jsonb,jsonb)','public.breakfast_worker_pack(uuid,uuid,date,integer,jsonb,jsonb,boolean,integer)'] loop
  def:=replace(pg_get_functiondef(sig::regprocedure),chr(13),'');
  def:=regexp_replace(def,'select public\.breakfast_active_menu\(items\) into m from breakfast_menus where location_id=c\.location_id and service_date=p_date for share;','m:=public.breakfast_require_classroom_menu(c.id,p_date);','i');
  if position('m:=public.breakfast_require_classroom_menu' in def)=0 then raise exception 'Menu lookup missing in %',sig;end if;
  execute def;
 end loop;
 def:=replace(pg_get_functiondef('public.breakfast_menu(text,date,jsonb)'::regprocedure),chr(13),'');
 def:=replace(def,'s:=public.breakfast_require_manager(p_token);','s:=public.breakfast_require_manager(p_token); perform public.breakfast_lock_menus(s.location_id);');
 def:=replace(def,'if exists(select 1 from breakfast_daily_records','if not exists(select 1 from public.breakfast_menu_groups where location_id=s.location_id) and exists(select 1 from breakfast_daily_records');
 def:=replace(def,'update breakfast_menus set items=m where location_id=s.location_id and service_date=p_date;','update breakfast_menus set items=m where location_id=s.location_id and service_date=p_date; insert into public.breakfast_menu_group_settings(location_id,revision) values(s.location_id,1) on conflict(location_id) do update set revision=breakfast_menu_group_settings.revision+1;');
 execute def;
 def:=replace(pg_get_functiondef('public.breakfast_copy_menu(text,date,date,jsonb)'::regprocedure),chr(13),'');
 def:=replace(def,'s:=breakfast_require_manager(p_token);','s:=breakfast_require_manager(p_token); perform public.breakfast_lock_menus(s.location_id);');execute def;
end$patch$;

create or replace function public.breakfast_teacher_preorder_v2(p_qr uuid,p_date date,p_for_date date,p_counts jsonb,p_menu jsonb,p_revision integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c breakfast_classrooms;d breakfast_daily_records;target date;m jsonb;entries jsonb;summary text;total integer;legacy_menu jsonb;legacy_client boolean:=false;
begin
 c:=breakfast_require_qr(p_qr);
 if p_date is distinct from (clock_timestamp() at time zone 'America/Los_Angeles')::date then raise exception 'The service date changed. Refresh for today.';end if;
 target:=breakfast_next_service_date(c.location_id,p_date);
 if p_for_date is distinct from target then raise exception 'The next breakfast date changed. Refresh before pre-ordering.';end if;
 m:=breakfast_require_classroom_menu(c.id,target);
 if m='{}' then raise exception 'The cafeteria has not posted this classroom breakfast menu yet.';end if;
 if p_menu is distinct from m then
  -- An already-open older teacher screen may still send entree-only quantities.
  -- Honor that unchanged workflow only before classroom groups are configured.
  select coalesce(jsonb_object_agg(key,value),'{}') into legacy_menu from jsonb_each(m) where key in('entree1','entree2','vegan','other');
  if p_menu=legacy_menu and not exists(select 1 from breakfast_menu_groups where location_id=c.location_id) and not exists(select 1 from breakfast_classroom_daily_menus where classroom_id=c.id and service_date=target) then m:=legacy_menu;legacy_client:=true;
  else raise exception 'The classroom breakfast menu changed. Refresh before pre-ordering.';end if;
 end if;
 if breakfast_counts_match_menu(p_counts,m) is not true or exists(select 1 from jsonb_each_text(p_counts) where value::integer>1000) then raise exception 'Enter a whole quantity from 0 to 1000 for each available item.';end if;
 select coalesce(sum(value::integer),0) into total from jsonb_each_text(p_counts) where key in('entree1','entree2','vegan','other');
 if total>1000 then raise exception 'The total entree pre-order cannot exceed 1000.';end if;
 entries:=jsonb_build_object('menu',m,'counts',p_counts,'version',case when legacy_client then 2 else 3 end);
 select * into d from breakfast_daily_records where classroom_id=c.id and service_date=p_date for update;
 if d.teacher_submitted_at is null or not d.teacher_certified then raise exception 'Submit today''s breakfast count first.';end if;
 if d.preorder_date=target and d.preorder_items->'menu'=m and d.preorder_items->'counts'=p_counts and p_revision in(d.preorder_revision,d.preorder_revision-1) then return breakfast_teacher_page(p_qr);end if;
 if p_revision is distinct from d.preorder_revision then raise exception 'This pre-order changed. Refresh before editing.';end if;
 select string_agg((m->>key)||': '||value,' · ' order by key) into summary from jsonb_each_text(p_counts);
 update breakfast_daily_records set preorder_date=target,preorder_items=entries,preorder_entree=summary,preorder_count=total,preorder_revision=preorder_revision+1,preorder_submitted_at=clock_timestamp(),updated_at=clock_timestamp() where id=d.id;
 insert into breakfast_events(classroom_id,location_id,daily_record_id,action,actor_role,actor_name,before_data,after_data) values(c.id,c.location_id,d.id,'teacher_preorder','teacher','Classroom QR',d.preorder_items,entries||jsonb_build_object('for_date',target));
 return breakfast_teacher_page(p_qr);
end$$;
-- Legacy single-entree clients must refresh when group menus are configured.
do $$declare def text;begin
 def:=replace(pg_get_functiondef('public.breakfast_teacher_preorder(uuid,date,date,text,integer,integer)'::regprocedure),chr(13),'');
 def:=replace(def,'c:=public.breakfast_require_qr(p_qr);','c:=public.breakfast_require_qr(p_qr); if exists(select 1 from public.breakfast_menu_groups where location_id=c.location_id) then raise exception ''Refresh this classroom page to order its group menu.'';end if; perform public.breakfast_lock_menus(c.location_id);');
 execute def;
end$$;

create or replace function public.breakfast_teacher_page(p_qr uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c breakfast_classrooms;st breakfast_settings;local_now timestamp;d breakfast_daily_records;today_menu jsonb;next_menu jsonb;next_date date;
begin
 c:=breakfast_require_qr(p_qr);local_now:=clock_timestamp() at time zone 'America/Los_Angeles';
 select * into st from breakfast_settings where location_id=c.location_id;
 select * into d from breakfast_daily_records where classroom_id=c.id and service_date=local_now::date;
 next_date:=breakfast_next_service_date(c.location_id,local_now::date);
 today_menu:=breakfast_resolve_classroom_menu(c.id,local_now::date);next_menu:=breakfast_resolve_classroom_menu(c.id,next_date);
 return jsonb_build_object('room',c.room_code,'teacher',c.teacher_name,'enrollment',c.enrolled_students,'campus',c.campus_label,
 'pilot_version',2,'menu_groups_version',3,'menu',today_menu->'menu','menu_conflicts',today_menu->'conflicts','preorder_menu',next_menu->'menu','preorder_conflicts',next_menu->'conflicts','service_date',local_now::date,'preorder_date',next_date,'cutoff',coalesce(st.teacher_cutoff,'09:00'::time),'closed',local_now::time>=coalesce(st.teacher_cutoff,'09:00'::time),
 'training_url',coalesce(st.training_url,''),'tips_url',coalesce(st.tips_url,''),
 'record',case when d.id is null then null else jsonb_build_object('attendance',d.teacher_attendance,'signature',d.teacher_signature,'returns',d.teacher_returned_counts,'preorder_items',d.preorder_items,'count',d.teacher_meal_count,'comments',d.teacher_comments,'submitted_at',d.teacher_submitted_at,'revision',d.teacher_revision,'adult_received',d.adult_meal_received,'adult_recorded_at',d.adult_meal_recorded_at,'adult_revision',d.adult_meal_revision,'preorder_date',d.preorder_date,'preorder_entree',d.preorder_entree,'preorder_count',d.preorder_count,'preorder_revision',d.preorder_revision,'preorder_submitted_at',d.preorder_submitted_at) end,
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'require_ack',m.require_ack) order by m.created_at) from breakfast_messages m where m.classroom_id=c.id and breakfast_message_active(m,local_now::date)),'[]'));
end$$;

create or replace function public.breakfast_worker_page(p_qr uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s breakfast_worker_sessions;c breakfast_classrooms;d breakfast_daily_records;today date;resolved jsonb;ordered jsonb;
begin
 s:=breakfast_require_worker(p_qr,p_token);select * into c from breakfast_classrooms where id=s.classroom_id;
 today:=(clock_timestamp() at time zone 'America/Los_Angeles')::date;
 select * into d from breakfast_daily_records where classroom_id=c.id and service_date=today;
 resolved:=breakfast_resolve_classroom_menu(c.id,today);
 select preorder_items into ordered from breakfast_daily_records where classroom_id=c.id and preorder_date=today and preorder_submitted_at is not null order by preorder_submitted_at desc limit 1;
 return jsonb_build_object('room',coalesce(d.room_snapshot,c.room_code),'teacher',coalesce(d.teacher_snapshot,c.teacher_name),'service_date',today,
 'packing_submitted_at',d.packing_submitted_at,'packing_worker_name',d.packing_worker_name,'packing_revision',coalesce(d.packing_revision,0),'sent',d.number_sent,'items_sent',coalesce(d.items_sent,'{}'),'ordered_counts',coalesce(ordered->'counts','{}'),'teacher_count',d.teacher_meal_count,'teacher_submitted_at',d.teacher_submitted_at,
 'menu',resolved->'menu','menu_conflicts',resolved->'conflicts','counts',coalesce(d.returned_counts,'{}'),'notes',coalesce(d.worker_notes,''),'revision',coalesce(d.worker_revision,0),'submitted_at',d.worker_submitted_at,'worker_name',d.worker_name);
end$$;
-- Special milk is opt-in and must have an actual saved order. Preserve corrections
-- to legacy packed records, whose original ordering system had no milk quantities.
create function public.breakfast_check_ordered_milk(p_class uuid,p_date date,p_items jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare ordered jsonb;key text;lid bigint;
begin
 select location_id into lid from breakfast_classrooms where id=p_class;
 if not exists(select 1 from breakfast_menu_groups where location_id=lid) then return;end if;
 select preorder_items into ordered from breakfast_daily_records where classroom_id=p_class and preorder_date=p_date and preorder_submitted_at is not null order by preorder_submitted_at desc limit 1;
 if coalesce(ordered->>'version','')<>'3' and exists(select 1 from breakfast_daily_records where classroom_id=p_class and service_date=p_date and packing_submitted_at is not null) then return;end if;
 foreach key in array array['milkLactaid','milkSpecial'] loop
  if coalesce((p_items->>key)::integer,0)>coalesce((ordered->'counts'->>key)::integer,0) then raise exception 'Special milk must be authorized and ordered for this classroom.';end if;
 end loop;
end$$;
revoke all on function public.breakfast_check_ordered_milk(uuid,date,jsonb) from public,anon,authenticated;
do $$declare def text;begin
 def:=pg_get_functiondef('public.breakfast_worker_pack(uuid,uuid,date,integer,jsonb,jsonb,boolean,integer)'::regprocedure);
 def:=replace(def,'if p_certified is distinct from true then','perform public.breakfast_check_ordered_milk(c.id,p_date,p_items); if p_certified is distinct from true then');
 execute def;
end$$;

create or replace function public.breakfast_packing_data(p_location bigint,p_date date,p_class uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$declare rows jsonb;begin
 perform breakfast_lock_menus(p_location);
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'room',coalesce(d.room_snapshot,c.room_code),'campus',coalesce(d.campus_snapshot,c.campus_label),'enrollment',coalesce(d.enrollment_snapshot,c.enrolled_students),
 'menu',resolved->'menu','menu_conflicts',resolved->'conflicts','items',case when d.packing_submitted_at is not null then d.items_sent when o.preorder_items->'counts' is not null then o.preorder_items->'counts' else '{}'::jsonb end,'quantity_source',case when d.packing_submitted_at is not null then 'Packed' when o.preorder_items->'counts' is not null then 'Teacher pre-order' else 'Not recorded' end) order by c.campus_label,c.room_code),'[]') into rows
 from breakfast_classrooms c left join breakfast_daily_records d on d.classroom_id=c.id and d.service_date=p_date
 left join lateral(select preorder_items from breakfast_daily_records where classroom_id=c.id and preorder_date=p_date and preorder_submitted_at is not null order by preorder_submitted_at desc limit 1)o on true
 cross join lateral(select breakfast_resolve_classroom_menu(c.id,p_date) as resolved)r
 where c.location_id=p_location and (p_class is null or c.id=p_class) and (d.id is not null or o.preorder_items is not null or (c.active and p_date>=(clock_timestamp() at time zone 'America/Los_Angeles')::date));
 return jsonb_build_object('school',(select school_name from locations where id=p_location),'location_code',(select location_code from locations where id=p_location),'service_date',p_date,'menu',coalesce((select items from breakfast_menus where location_id=p_location and service_date=p_date),'{}'),'rows',rows);
end$$;
do $preserve$begin if (jsonb_build_object('classrooms',(select md5(coalesce(string_agg(md5(to_jsonb(c)::text),'' order by id),'')) from public.breakfast_classrooms c),'records',(select md5(coalesce(string_agg(md5(to_jsonb(d)::text),'' order by id),'')) from public.breakfast_daily_records d),'menus',(select md5(coalesce(string_agg(md5(to_jsonb(m)::text),'' order by location_id,service_date),'')) from public.breakfast_menus m),'events',(select md5(coalesce(string_agg(md5(to_jsonb(e)::text),'' order by id),'')) from public.breakfast_events e)))::text is distinct from current_setting('spark.bic_data_before') then raise exception 'BIC data preservation check failed; rolling back.';end if;end$preserve$;
notify pgrst,'reload schema';
commit;
