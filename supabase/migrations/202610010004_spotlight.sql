begin;
create table public.spark_spotlights(
 id uuid primary key default gen_random_uuid(), headline text not null check(length(trim(headline)) between 1 and 160),
 body text not null check(length(trim(body)) between 1 and 2000),
 category text not null check(category in ('Recognition','SPARK Cup','Golden Apron','Announcement','Challenge')),
 photo_path text, published boolean not null default false, published_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), revision integer not null default 1,
 check(not published or published_at is not null));
create table public.spark_spotlight_reactions(
 post_id uuid references public.spark_spotlights(id) on delete cascade,
 location_id bigint references public.locations(id), reaction text not null check(reaction in ('love','awesome','great','spark')),
 primary key(post_id,location_id));
alter table public.spark_spotlights enable row level security;
alter table public.spark_spotlight_reactions enable row level security;
revoke all on public.spark_spotlights,public.spark_spotlight_reactions from public,anon,authenticated;
create index spark_spotlights_published on public.spark_spotlights(published_at desc,id desc) where published;
-- Same Supabase Storage approach as school-media, but private for unpublished photos.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('spotlight-photos','spotlight-photos',false,2097152,array['image/jpeg','image/png','image/webp']);

create function public.spotlight_list(p_token text default null,p_pin text default null,p_offset integer default 0,p_limit integer default 20)
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
 'counts',(select coalesce(jsonb_object_agg(reaction,n),'{}') from (select reaction,count(*) n from public.spark_spotlight_reactions where post_id=p.id group by reaction) counts),
 'mine',(select reaction from public.spark_spotlight_reactions where post_id=p.id and location_id=s.location_id)
 ) order by p.published_at desc nulls first,p.created_at desc,p.id desc),'[]') into result
 from (select * from public.spark_spotlights where admin or published
 order by published_at desc nulls first,created_at desc,id desc offset greatest(0,p_offset) limit least(50,greatest(1,p_limit))) p;
 return result;
end $$;

create function public.spotlight_manage(p_pin text,p_action text,p_id uuid,p_revision integer,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare post public.spark_spotlights; old_photo text; image_path text;
begin
 if public.verify_supervisor_pin(p_pin) is not true then raise exception 'Supervisor authorization required';end if;
 if p_id is not null then
  select * into post from public.spark_spotlights where id=p_id for update;
  if not found then raise exception 'Spotlight not found';end if;
  if post.revision is distinct from p_revision then raise exception 'This Spotlight changed. Refresh before editing.';end if;
  old_photo:=post.photo_path;
 end if;
 if p_action='save' then
  image_path:=nullif(p_payload->>'photo_path','');
  if image_path is not null and image_path !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|png|webp)$' then raise exception 'Invalid Spotlight photo';end if;
  if p_id is null then
   insert into public.spark_spotlights(headline,body,category,photo_path,published,published_at)
   values(trim(p_payload->>'headline'),trim(p_payload->>'body'),p_payload->>'category',image_path,
    coalesce((p_payload->>'published')::boolean,false),case when (p_payload->>'published')::boolean then now() end) returning * into post;
  else
   update public.spark_spotlights set headline=trim(p_payload->>'headline'),body=trim(p_payload->>'body'),category=p_payload->>'category',photo_path=image_path,
    published=coalesce((p_payload->>'published')::boolean,false),published_at=case when (p_payload->>'published')::boolean then coalesce(published_at,now()) else published_at end,
    revision=revision+1,updated_at=now() where id=p_id returning * into post;
  end if;
 elsif p_action in ('publish','unpublish') and p_id is not null then
  update public.spark_spotlights set published=p_action='publish',published_at=case when p_action='publish' then coalesce(published_at,now()) else published_at end,
   revision=revision+1,updated_at=now() where id=p_id returning * into post;
 elsif p_action='delete' and p_id is not null then
  delete from public.spark_spotlights where id=p_id;
  return jsonb_build_object('old_photo',old_photo);
 else raise exception 'Invalid Spotlight action';end if;
 return jsonb_build_object('post',to_jsonb(post),'old_photo',case when old_photo is distinct from post.photo_path then old_photo end);
end $$;

create function public.spotlight_react(p_token text,p_id uuid,p_reaction text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'manager' then raise exception 'Manager session required';end if;
 perform 1 from public.spark_spotlights where id=p_id and published for share;
 if not found then raise exception 'This Spotlight is no longer published';end if;
 insert into public.spark_spotlight_reactions(post_id,location_id,reaction) values(p_id,s.location_id,p_reaction)
 on conflict(post_id,location_id) do update set reaction=excluded.reaction;
 -- Reactions never write to spark_points.
 return jsonb_build_object('mine',p_reaction,'counts',(select coalesce(jsonb_object_agg(reaction,n),'{}') from
  (select reaction,count(*) n from public.spark_spotlight_reactions where post_id=p_id group by reaction) totals));
end $$;
revoke all on function public.spotlight_list(text,text,integer,integer),public.spotlight_manage(text,text,uuid,integer,jsonb),public.spotlight_react(text,uuid,text) from public;
grant execute on function public.spotlight_list(text,text,integer,integer),public.spotlight_manage(text,text,uuid,integer,jsonb),public.spotlight_react(text,uuid,text) to anon,authenticated,service_role;
commit;
