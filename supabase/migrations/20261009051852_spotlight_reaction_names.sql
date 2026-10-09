begin;
set local lock_timeout='5s';
-- Keep legacy reactions without inventing actor names or timestamps.
alter table public.spark_spotlight_reactions add column if not exists reacted_by_name text;
alter table public.spark_spotlight_reactions add column if not exists reacted_at timestamptz;
create or replace function public.spotlight_list(p_token text default null,p_pin text default null,p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions; admin boolean:=false; result jsonb;
begin
 if p_pin is not null then
  if public.verify_supervisor_pin(p_pin) is not true then raise exception 'Supervisor authorization required';end if;
  admin:=true;
 else
  s:=public.require_supper_monitoring_session(p_token);
  if s.actor_role<>'manager' then raise exception 'Manager session required';end if;
 end if;
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object(
 'reactors',(select coalesce(jsonb_agg(jsonb_build_object('location_id',r.location_id,'school_name',l.school_name,'name',r.reacted_by_name,'reaction',r.reaction) order by l.school_name,r.location_id),'[]'::jsonb)
 from public.spark_spotlight_reactions r join public.locations l on l.id=r.location_id where r.post_id=p.id),
 'counts',(select coalesce(jsonb_object_agg(reaction,n),'{}') from (select reaction,count(*) n from public.spark_spotlight_reactions where post_id=p.id group by reaction) counts),
 'mine',(select reaction from public.spark_spotlight_reactions where post_id=p.id and location_id=s.location_id)
 ) order by p.published_at desc nulls first,p.created_at desc,p.id desc),'[]') into result
 from (select * from public.spark_spotlights where admin or published
 order by published_at desc nulls first,created_at desc,id desc offset greatest(0,p_offset) limit least(50,greatest(1,p_limit))) p;
 return result;
end $$;

create or replace function public.spotlight_react(p_token text,p_id uuid,p_reaction text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'manager' then raise exception 'Manager session required';end if;
 perform 1 from public.spark_spotlights where id=p_id and published for share;
 if not found then raise exception 'This Spotlight is no longer published';end if;
 insert into public.spark_spotlight_reactions(post_id,location_id,reaction,reacted_by_name,reacted_at) values(p_id,s.location_id,p_reaction,nullif(trim(s.monitor_name),''),now())
 on conflict(post_id,location_id) do update set reaction=excluded.reaction,reacted_by_name=excluded.reacted_by_name,reacted_at=excluded.reacted_at;
 -- Reactions never write to spark_points.
 return jsonb_build_object('mine',p_reaction,'reactors',(select coalesce(jsonb_agg(jsonb_build_object('location_id',r.location_id,'school_name',l.school_name,'name',r.reacted_by_name,'reaction',r.reaction) order by l.school_name,r.location_id),'[]'::jsonb)
 from public.spark_spotlight_reactions r join public.locations l on l.id=r.location_id where r.post_id=p_id),'counts',(select coalesce(jsonb_object_agg(reaction,n),'{}') from
  (select reaction,count(*) n from public.spark_spotlight_reactions where post_id=p_id group by reaction) totals));
end $$;
revoke all on function public.spotlight_list(text,text,integer,integer),public.spotlight_react(text,uuid,text) from public;
grant execute on function public.spotlight_list(text,text,integer,integer),public.spotlight_react(text,uuid,text) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
