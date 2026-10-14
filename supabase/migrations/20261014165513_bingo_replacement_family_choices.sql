begin;
set local lock_timeout='5s';

create function public.spark_bingo_square_choice(c public.spark_bingo_cards,p_square integer,p_goal text)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare evaluated public.spark_bingo_cards:=c;
begin
 if p_square is null or p_square not between 0 and 24 or p_square=12 or c.blackout_at is not null
  or c.goal_ids[p_square+1]=any(c.completed_ids) or p_goal is null or p_goal=c.goal_ids[p_square+1]
  or not exists(select 1 from public.spark_bingo_eligible(c.location_id,c.started_on) where id=p_goal)
  or exists(select 1 from unnest(c.goal_ids) with ordinality u(id,ord) where ord<>p_square+1
    and (id=p_goal or public.spark_bingo_family(id)=public.spark_bingo_family(p_goal))) then return false;end if;
 evaluated.goal_ids[p_square+1]:=p_goal;
 return not public.spark_bingo_goal_met(evaluated,p_goal);
end;
$$;

create function public.spark_bingo_guard_replacement() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare slot integer;
begin
 for slot in 0..24 loop
  if new.goal_ids[slot+1] is distinct from old.goal_ids[slot+1]
   and not public.spark_bingo_square_choice(old,slot,new.goal_ids[slot+1])
  then raise exception 'Choose an eligible unfinished replacement without duplicating another task family';end if;
 end loop;
 return new;
end;
$$;
create trigger spark_bingo_guard_replacement before update of goal_ids on public.spark_bingo_cards
for each row execute function public.spark_bingo_guard_replacement();

create or replace function public.spark_bingo_refresh_school(p_location bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;c public.spark_bingo_cards;choices jsonb;goals jsonb;paid bigint;balance numeric;cost numeric;prizes jsonb;
begin
 result:=public.spark_bingo_refresh_school_legacy(p_location);
 select * into c from public.spark_bingo_cards where id=(result#>>'{card,id}')::uuid;
 select coalesce(jsonb_agg(value||jsonb_build_object('family',public.spark_bingo_family(value->>'id'))),'[]') into choices
 from jsonb_array_elements(result->'replacement_goals') g(value)
 where (select count(*) from unnest(c.goal_ids) id where public.spark_bingo_family(id)=public.spark_bingo_family(value->>'id'))<=1;
 select jsonb_agg(value||jsonb_build_object('family',public.spark_bingo_family(value->>'id'))) into goals from jsonb_array_elements(result->'goals') g(value);
 select count(*) into paid from public.spark_bingo_purchases where card_id=c.id;
 balance:=public.spark_bingo_season_balance(p_location);cost:=public.spark_bingo_price(paid,balance);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',prize_name)),'[]') into prizes
 from public.mystery_wins where location_id=p_location and reward_type='bingo_change' and status='waiting';
 return result||jsonb_build_object('goals',goals,'replacement_goals',choices,'paid_shop',jsonb_build_object('count',paid,'balance',balance::text,'price',cost::text,'price_formula','25 x 2^'||paid,'prizes',prizes),
  'can_renew',coalesce((result->>'can_renew')::boolean,false) and not exists(select 1 from public.locations where id=p_location and school_name='Test High School'),
  'repair_windows',(select coalesce(jsonb_agg(jsonb_build_object('goal',new_goal,'started_at',repaired_at)),'[]') from public.spark_bingo_repairs where card_id=c.id and ended_at is null));
end;
$$;
revoke all on function public.spark_bingo_square_choice(public.spark_bingo_cards,integer,text),public.spark_bingo_guard_replacement(),public.spark_bingo_refresh_school(bigint) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
