begin;
-- Preserve all existing prizes, balances and wins. No retroactive points credits.
alter table public.mystery_prizes
 add column bonus_tokens integer not null default 0 check(bonus_tokens between 0 and 1),
 add column points_amount integer not null default 0 check(points_amount between 0 and 1000000);
alter table public.mystery_prizes drop constraint mystery_prizes_kind_check;
alter table public.mystery_prizes
 add constraint mystery_prizes_kind_check check(kind in ('manual','extra_pull','spark_points')),
 add constraint mystery_prizes_points_check check((kind='spark_points' and points_amount>0) or (kind<>'spark_points' and points_amount=0)),
 add constraint mystery_prizes_extra_check check(kind<>'extra_pull' or bonus_tokens=0);
alter table public.mystery_wins
 add column bonus_tokens integer not null default 0 check(bonus_tokens between 0 and 1),
 add column points_awarded integer not null default 0 check(points_awarded between 0 and 1000000);
-- Snapshot the already-delivered legacy token without issuing another token.
update public.mystery_wins set bonus_tokens=1 where prize_kind='extra_pull';
create or replace function public.mystery_pull(p_token text,p_request uuid,p_revision integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.mystery_sessions;b public.mystery_balances;p public.mystery_prizes;w public.mystery_wins;
begin
 s:=public.mystery_require(p_token);if s.role<>'manager' then raise exception 'Choose a school to pull.';end if;
 if p_request is null then raise exception 'A pull request is required.';end if;
 -- One lock order for draws and supervisor changes, including different schools competing for the last prize.
 perform pg_advisory_xact_lock(hashtextextended('mystery-prize-pool',0));
 select * into b from public.mystery_balances where location_id=s.location_id for update;
 select * into w from public.mystery_wins where request_id=p_request;
 if w.id is not null then
  if w.location_id<>s.location_id then raise exception 'This pull belongs to another school.';end if;
  return jsonb_build_object('win',to_jsonb(w),'tokens',b.tokens,'revision',b.revision);
 end if;
 if b.location_id is null or b.tokens<1 then raise exception 'No Mystery Pulls are currently available for your school.';end if;
 if b.revision is distinct from p_revision then raise exception 'Your school balance changed. Refresh before starting another pull.';end if;
 -- Uniform random choice among in-stock active prize TYPES; animation never chooses the result.
 select * into p from public.mystery_prizes where active and inventory>0 order by random() limit 1 for update;
 if p.id is null then raise exception 'Prizes are being restocked. Your token has not been used.';end if;
 update public.mystery_balances set tokens=tokens-1+case when p.kind='extra_pull' then 1 else p.bonus_tokens end,revision=revision+1 where location_id=s.location_id returning * into b;
 update public.mystery_prizes set inventory=inventory-1,revision=revision+1 where id=p.id;
 insert into public.mystery_wins(request_id,location_id,prize_id,prize_name,prize_description,prize_icon,prize_kind,status,fulfilled_at,bonus_tokens,points_awarded)
 values(p_request,s.location_id,p.id,p.name,p.description,p.icon,p.kind,case when p.kind in ('extra_pull','spark_points') then 'received' else 'waiting' end,case when p.kind in ('extra_pull','spark_points') then now() else null end,case when p.kind='extra_pull' then 1 else p.bonus_tokens end,p.points_amount) returning * into w;
 -- The ledger credit and prize/token changes commit together. A retry returns the
 -- existing win above, so it cannot insert a second points award.
 if p.kind='spark_points' then
  insert into public.spark_points(location_id,points,point_type,description,service_date,source,unique_key)
  values(s.location_id,p.points_amount,'mystery_pull_prize','Mystery Pull: '||p.name,(now() at time zone 'America/Los_Angeles')::date,'automatic','mystery-pull-'||p_request::text);
 end if;
 return jsonb_build_object('win',to_jsonb(w),'tokens',b.tokens,'revision',b.revision);
end $$;
create or replace function public.mystery_admin(p_token text,p_request uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.mystery_sessions;prior public.mystery_admin_changes;b public.mystery_balances;p public.mystery_prizes;w public.mystery_wins;result jsonb;action text:=p_payload->>'action';delta int;loc bigint;
begin
 s:=public.mystery_require(p_token);if s.role<>'supervisor' then raise exception 'Mystery Pull supervisor access is required.';end if;
 if p_request is null or p_payload is null then raise exception 'A change request is required.';end if;
 perform pg_advisory_xact_lock(hashtextextended('mystery-prize-pool',0));
 select * into prior from public.mystery_admin_changes where request_id=p_request;
 if prior.request_id is not null then
  if prior.payload<>p_payload then raise exception 'This request was already used for another change.';end if;
  return prior.result;
 end if;
 if action='tokens' then
  loc:=(p_payload->>'location_id')::bigint;delta:=(p_payload->>'delta')::integer;
  if delta is null or delta=0 or abs(delta::bigint)>1000000 or not exists(select 1 from public.locations where id=loc and active=true) then raise exception 'Choose a school and a valid token adjustment.';end if;
  insert into public.mystery_balances(location_id) values(loc) on conflict do nothing;
  select * into b from public.mystery_balances where location_id=loc for update;
  if b.revision is distinct from (p_payload->>'revision')::integer then raise exception 'The balance changed. Refresh and try again.';end if;
  if b.tokens+delta not between 0 and 1000000 then raise exception 'Token balance cannot be negative or exceed 1,000,000.';end if;
  update public.mystery_balances set tokens=tokens+delta,revision=revision+1 where location_id=loc returning * into b;result:=to_jsonb(b);
 elsif action='prize' then
  if p_payload->>'id' is not null then
   select * into p from public.mystery_prizes where id=(p_payload->>'id')::uuid for update;
   if p.id is null or p.revision is distinct from (p_payload->>'revision')::integer then raise exception 'This prize changed. Refresh and try again.';end if;
   update public.mystery_prizes set name=trim(p_payload->>'name'),description=p_payload->>'description',icon=trim(p_payload->>'icon'),kind=p_payload->>'kind',active=(p_payload->>'active')::boolean,bonus_tokens=case when p_payload->>'kind'='extra_pull' then 0 else coalesce((p_payload->>'bonus_tokens')::integer,p.bonus_tokens) end,points_amount=case when p_payload->>'kind'='spark_points' then coalesce((p_payload->>'points_amount')::integer,p.points_amount) else 0 end,revision=revision+1 where id=p.id returning * into p;
  else
   insert into public.mystery_prizes(name,description,icon,kind,active,bonus_tokens,points_amount) values(trim(p_payload->>'name'),p_payload->>'description',trim(p_payload->>'icon'),p_payload->>'kind',coalesce((p_payload->>'active')::boolean,true),coalesce((p_payload->>'bonus_tokens')::integer,0),coalesce((p_payload->>'points_amount')::integer,0)) returning * into p;
  end if;result:=to_jsonb(p);
 elsif action='stock' then
  delta:=(p_payload->>'delta')::integer;
  select * into p from public.mystery_prizes where id=(p_payload->>'id')::uuid for update;
  if p.id is null or p.revision is distinct from (p_payload->>'revision')::integer then raise exception 'This prize changed. Refresh and try again.';end if;
  if delta is null or delta=0 or abs(delta::bigint)>1000000 or p.inventory+delta not between 0 and 1000000 then raise exception 'Enter an adjustment that leaves a nonnegative stock quantity.';end if;
  update public.mystery_prizes set inventory=inventory+delta,revision=revision+1 where id=p.id returning * into p;result:=to_jsonb(p);
 elsif action='fulfill' then
  select * into w from public.mystery_wins where id=(p_payload->>'id')::bigint for update;
  if w.id is null then raise exception 'Prize record not found.';end if;
  update public.mystery_wins set status='received',fulfilled_at=coalesce(fulfilled_at,now()) where id=w.id returning * into w;result:=to_jsonb(w);
 else raise exception 'Unknown Mystery Pull change.';end if;
 insert into public.mystery_admin_changes(request_id,payload,result) values(p_request,p_payload,result);
 return result;
end $$;
commit;
