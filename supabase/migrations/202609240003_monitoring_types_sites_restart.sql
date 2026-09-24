begin;
-- Additive identity upgrade. Existing Supper tables/RPCs remain the working adapter.
create table public.monitoring_types(code text primary key check(code ~ '^[a-z][a-z_]*$'),label text not null,enabled boolean not null default false);
insert into public.monitoring_types values ('supper','Supper',true),('breakfast','Breakfast',false),('lunch','Lunch',false);
create table public.monitoring_sites(
 id uuid primary key default gen_random_uuid(),location_id bigint not null references public.locations(id),
 name text not null check(length(trim(name)) between 1 and 120),kind text not null check(kind in ('main','offsite','eec','program')),
 created_at timestamptz not null default now(),unique(id,location_id));
create unique index monitoring_site_name on public.monitoring_sites(location_id,lower(trim(name)));
create unique index monitoring_main_site on public.monitoring_sites(location_id) where kind='main';
insert into public.monitoring_sites(location_id,name,kind) select id,'Main Site','main' from public.locations;
alter table public.supper_monitorings
 add column monitoring_type text not null default 'supper' references public.monitoring_types(code),
 add column monitoring_site_id uuid,
 add column monitoring_site_name text not null default 'Main Site',
 add column current_pdf_available boolean not null default false;
update public.supper_monitorings m set monitoring_site_id=s.id,current_pdf_available=exists(select 1 from public.supper_monitoring_documents d where d.monitoring_id=m.id) from public.monitoring_sites s where s.location_id=m.location_id and s.kind='main';
alter table public.supper_monitorings alter column monitoring_site_id set not null;
alter table public.supper_monitorings add constraint monitoring_site_school_fk foreign key(monitoring_site_id,location_id) references public.monitoring_sites(id,location_id);
drop index public.supper_unique_active_slot;
create unique index monitoring_unique_active_slot on public.supper_monitorings(location_id,monitoring_site_id,monitoring_type,school_year,monitoring_slot) where status<>'deleted' and monitoring_slot is not null;
alter table public.monitoring_types enable row level security;
alter table public.monitoring_sites enable row level security;
revoke all on public.monitoring_types,public.monitoring_sites from public,anon,authenticated;

create function public.monitoring_identity_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare site public.monitoring_sites; v_type text; site_id uuid;
begin
 if TG_OP='INSERT' then
  v_type:=coalesce(nullif(NEW.payload->>'monitoringType',''),'supper');
  site_id:=nullif(NEW.payload->>'monitoringSiteId','')::uuid;
  if site_id is null then
   insert into public.monitoring_sites(location_id,name,kind) values(NEW.location_id,'Main Site','main') on conflict do nothing;
   select id into site_id from public.monitoring_sites where location_id=NEW.location_id and kind='main';
  end if;
  if not exists(select 1 from public.monitoring_types where code=v_type and enabled) then raise exception 'This monitoring type is not available yet.'; end if;
  NEW.monitoring_type:=v_type;NEW.monitoring_site_id:=site_id;
 else
  if NEW.location_id is distinct from OLD.location_id or NEW.monitoring_type is distinct from OLD.monitoring_type or NEW.monitoring_site_id is distinct from OLD.monitoring_site_id
   or coalesce(nullif(NEW.payload->>'monitoringType',''),OLD.monitoring_type)<>OLD.monitoring_type
   or coalesce(nullif(NEW.payload->>'monitoringSiteId','')::uuid,OLD.monitoring_site_id)<>OLD.monitoring_site_id then
   raise exception 'The school, site and monitoring type cannot be changed on an existing monitoring.';
  end if;
  if NEW.document_version>OLD.document_version then NEW.current_pdf_available:=true; end if;
 end if;
 select * into site from public.monitoring_sites where id=NEW.monitoring_site_id and location_id=NEW.location_id;
 if site.id is null then raise exception 'Choose a monitored site belonging to this school.'; end if;
 NEW.monitoring_site_name:=site.name;
 return NEW;
end $$;
create trigger monitoring_identity before insert or update on public.supper_monitorings for each row execute function public.monitoring_identity_guard();

create function public.monitoring_sites_for_school(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin s:=public.require_supper_monitoring_session(p_token);
 -- Handles newly added schools without allowing callers to create extra Main Sites.
 insert into public.monitoring_sites(location_id,name,kind) values(s.location_id,'Main Site','main') on conflict do nothing;
 return (select coalesce(jsonb_agg(to_jsonb(t) order by (kind='main') desc,name),'[]') from public.monitoring_sites t where location_id=s.location_id);
end $$;
create function public.create_monitoring_site(p_token text,p_name text,p_kind text) returns public.monitoring_sites language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;site public.monitoring_sites;
begin s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'supervisor' then raise exception 'Supervisor authorization required to add a monitored site.'; end if;
 if p_kind is null or p_kind not in ('offsite','eec','program') or length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Enter a site/program name and choose Offsite, EEC or Program.'; end if;
 insert into public.monitoring_sites(location_id,name,kind) values(s.location_id,trim(p_name),p_kind) returning * into site;
 insert into public.supper_monitoring_events(action,actor_name,actor_role,metadata) values('Monitoring site added',s.monitor_name,s.actor_role,jsonb_build_object('school',s.location_id,'site_id',site.id,'site_name',site.name,'kind',site.kind));
 return site;
exception when unique_violation then raise exception 'This school already has a site with that name. Select the existing site.';
end $$;
create or replace function public.supper_context(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin s:=public.require_supper_monitoring_session(p_token);
 return jsonb_build_object('actor_role',s.actor_role,'employee_id',s.employee_id,'monitor_name',s.monitor_name,'allow_manager_uploads',(select allow_manager_uploads from public.supper_monitoring_settings where singleton),'monitoring_sites',public.monitoring_sites_for_school(p_token));
end $$;
create or replace function public.supper_supervisor_overview(p_pin text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if public.verify_supervisor_pin(p_pin) is not true then raise exception 'Supervisor authorization failed.'; end if;
 return jsonb_build_object('schools',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'school_name',school_name,'location_code',location_code) order by school_name),'[]') from public.locations where active=true),
 'records',(select coalesce(jsonb_agg(to_jsonb(m)-'payload'),'[]') from public.supper_monitorings m join public.locations l on l.id=m.location_id where l.active=true),
 'sites',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.monitoring_sites s join public.locations l on l.id=s.location_id where l.active=true),
 'allow_manager_uploads',(select allow_manager_uploads from public.supper_monitoring_settings where singleton));
end $$;
create or replace function public.supper_event(m public.supper_monitorings,s public.supper_monitoring_sessions,p_action text,p_old text,p_comment text default '') returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin insert into public.supper_monitoring_events(monitoring_id,action,actor_name,actor_role,actor_employee_id,old_status,new_status,comment,document_version,metadata)
 values(m.id,p_action,s.monitor_name,s.actor_role,s.employee_id,p_old,m.status,coalesce(p_comment,''),m.document_version,jsonb_build_object('monitoring_date',m.monitoring_date,'school_year',m.school_year,'slot',m.monitoring_slot,'source',m.source,'monitoring_type',m.monitoring_type,'monitoring_site_id',m.monitoring_site_id,'monitoring_site_name',m.monitoring_site_name,'current_pdf_available',m.current_pdf_available)); end $$;

create function public.restart_monitoring(p_token text,p_id uuid,p_revision integer) returns public.supper_monitorings language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;m public.supper_monitorings;old_status text;blank jsonb;
begin
 s:=public.require_supper_monitoring_session(p_token);
 select * into m from public.supper_monitorings where id=p_id and location_id=s.location_id for update;
 if m.id is null then raise exception 'Monitoring not found for this school.'; end if;
 if s.actor_role<>'manager' then raise exception 'This restart action is for the assigned Manager.'; end if;
 perform public.supper_assert_editor(s,m);
 if m.source<>'generated' or m.monitor_role<>'manager' or m.locked or m.status not in ('draft','corrections_requested') then raise exception 'Only an unlocked Draft or Corrections Requested SPARK monitoring can be restarted. Submitted records must first be returned by the Supervisor.'; end if;
 if m.revision is distinct from p_revision then raise exception 'Monitoring revision changed. Reopen before restarting.'; end if;
 old_status:=m.status;
 -- Server-created blank payload: callers cannot smuggle answers or change assignment.
 blank:=jsonb_build_object('schemaVersion',1,'guidedVersion',2,'schoolYear',m.school_year,'monitoringSlot',m.monitoring_slot,'monitoringType',m.monitoring_type,'monitoringSiteId',m.monitoring_site_id,
 'unannounced',true,'adultMeals','0','serviceTimes','[]'::jsonb,'todayAttendanceConfirmed','','correctiveActionDue','','followUpRequired',null,'extraFollowUp','','approvedServiceTime','','monitoringDate','','arrivalTime','','departureTime','','serviceStart','','serviceEnd','','programName','','programType','','todayAttendance','','todayMeals','','weekStart','','history','[]'::jsonb,
 'menu',(select jsonb_agg(jsonb_build_object('category',c,'applicable',true,'item','','serving','')) from unnest(array['Milk','Meat/Alternate','Grains/Breads','Fruit','Vegetable','Additional Meat/Alternate','Other']) c),
 'answers','{}'::jsonb,'correctiveActions','{}'::jsonb,'repeatedFindings','','repeatedAction','','comments','','monitorName',m.created_by_name,'coordinatorName','','signatures','{"monitor":null,"coordinator":null}'::jsonb);
 -- Retain immutable versions and review markup, but remove the abandoned current PDF.
 delete from public.supper_monitoring_documents where monitoring_id=m.id;
 update public.supper_monitorings set payload=blank,status='draft',current_section=0,monitoring_date=null,submitted_at=null,submitted_by_name=null,submitted_by_role=null,accepted_at=null,review_comments='',current_pdf_available=false,pdf_storage_path=null,pdf_sha256=null,revision=revision+1,updated_at=now() where id=m.id returning * into m;
 perform public.supper_event(m,s,'Monitoring restarted by Manager',old_status,'Answers and signatures cleared. Prior PDF versions remain historical and are not the current official report.');
 return m;
end $$;
revoke all on function public.monitoring_identity_guard(),public.monitoring_sites_for_school(text),public.create_monitoring_site(text,text,text),public.restart_monitoring(text,uuid,integer) from public;
grant execute on function public.monitoring_sites_for_school(text),public.create_monitoring_site(text,text,text),public.restart_monitoring(text,uuid,integer) to anon,authenticated,service_role;
commit;
