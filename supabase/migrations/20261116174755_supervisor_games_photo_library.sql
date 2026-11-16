begin;
-- Read-only catalogue. No uploads, votes, rewards, original paths or history change.
create function public.spark_games_photo_library(p_pin text,p_development boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $body$
declare ns text; result jsonb;
begin
 if public.verify_supervisor_pin(p_pin) is not true then raise exception 'Supervisor authorization required';end if;
 ns:=case when p_development then 'october_dev' else 'october_live' end;
 execute format($query$
  with photos as (
   select 'entry:'||e.id as id,e.photo_path,e.location_id,l.school_name,e.submitted_at,
    case when e.quest=0 then 'decoration' else 'side_quest' end as category,
    case when e.quest=0 then 'door:'||e.door_contest else 'quest:'||e.quest end as contest_id,
    case when e.quest=0 then coalesce(h.settings->>'door_title',cfg.door_title,'Decoration Contest') else coalesce(q.name,'Side Quest') end as contest,
    0 as priority
   from %1$I.entries e left join public.locations l on l.id=e.location_id
    left join %1$I.quests q on q.id=e.quest cross join %1$I.settings cfg
    left join %1$I.door_contests h on h.id=e.door_contest
   where e.state='approved' and e.consent is true and e.photo_path is not null
   union all
   select 'showdown:'||s.id,s.photo_path,s.location_id,l.school_name,s.submitted_at,'showdown',
    'quest:'||s.quest,coalesce(q.name,'Side Quest Showdown'),1
   from %1$I.showdown_submissions s left join public.locations l on l.id=s.location_id left join %1$I.quests q on q.id=s.quest
   where s.state='approved' and s.consent is true and s.photo_path is not null
  ), unique_photos as (select distinct on(photo_path) * from photos order by photo_path,priority,id)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'photo_path',photo_path,'school_id',location_id,
   'school',coalesce(school_name,'School'),'category',category,'contest_id',contest_id,'contest',contest,
   'date',(submitted_at at time zone 'America/Los_Angeles')::date) order by submitted_at desc,id),'[]') from unique_photos
 $query$,ns) into result;
 return result;
end $body$;
revoke all on function public.spark_games_photo_library(text,boolean) from public,anon,authenticated;
grant execute on function public.spark_games_photo_library(text,boolean) to service_role;
commit;
