begin;
-- Private helpers derive costs from server-generated geometry; clients cannot choose costs.
create function october_dev.piece_costs(pieces jsonb,hard boolean) returns int[]
language sql immutable set search_path=pg_catalog as $$
 select coalesce(array_agg(case when not hard then 1
  when exists(select 1 from jsonb_array_elements(triangle) v where (v->>0)::numeric in (0,1000) or (v->>1)::numeric in (0,1000)) then 1
  when (select avg((v->>0)::numeric) between 350 and 650 and avg((v->>1)::numeric) between 350 and 650 from jsonb_array_elements(triangle) v) then 3
  when ascii(substr(md5(triangle::text),1,1))%3=0 then 3 else 2 end order by ordinal),'{}'::int[])
 from jsonb_array_elements(pieces) with ordinality p(triangle,ordinal)
$$;
create function october_dev.revealed_count(costs int[],credits int) returns int
language sql immutable set search_path=pg_catalog as $$
 select count(*)::int from(select sum(cost) over(order by ordinal) spent from unnest(costs) with ordinality c(cost,ordinal)) x where spent<=credits
$$;
revoke all on function october_dev.piece_costs(jsonb,boolean),october_dev.revealed_count(int[],int) from public,anon,authenticated;

do $migration$
declare env text; definition text; previous text; pair text[]; addition text;
begin
 foreach env in array array['dev','live'] loop
  execute format('alter table october_%s.rounds add column reward_points int not null default 25 check(reward_points between 1 and 1000), add column piece_costs int[] not null default ''{}'', add column unlock_credits int not null default 0 check(unlock_credits>=0)',env);
  execute format('update october_%s.rounds set piece_costs=october_dev.piece_costs(pieces,id>=3)',env);
  -- Retain exactly the same visible prefix for every existing puzzle.
  execute format('update october_%s.rounds set unlock_credits=coalesce((select sum(cost) from unnest(piece_costs[1:unlocked]) cost),0)',env);
  select replace(pg_get_functiondef(format('public.october_games_%s(text,text,text,jsonb)',env)::regprocedure),E'\r\n',E'\n') into definition;
  previous:=definition;definition:=replace(definition,'''review'',''round'',''champion''','''review'',''round_reward'',''round'',''champion''');
  if previous=definition then raise exception 'Missing mystery authorization anchor: %',env;end if;
  addition:=format($patch$elsif p_action='round_reward' then
  select * into r from october_%s.rounds where id=(p_payload->>'id')::int;
  if r.id is null or r.revision is distinct from (p_payload->>'revision')::int then raise exception 'Round changed. Refresh first.';end if;
  if r.solved_at is not null then raise exception 'Solved mystery rewards are locked';end if;
  if coalesce(p_payload->>'reward_points','') !~ '^[0-9]{1,4}$' or (p_payload->>'reward_points')::int not between 1 and 1000 then raise exception 'Enter 1 to 1000 whole SPARK Points';end if;
  update october_%s.rounds set reward_points=(p_payload->>'reward_points')::int,revision=revision+1 where id=r.id;
 elsif p_action='round' then$patch$,env,env);
  previous:=definition;definition:=replace(definition,'elsif p_action=''round'' then',addition);
  if previous=definition then raise exception 'Missing mystery editing anchor: %',env;end if;
  foreach pair slice 1 in array array[
   ['unlocked=least(jsonb_array_length(pieces),unlocked+5) where id=current_round','unlock_credits=unlock_credits+5,unlocked=october_dev.revealed_count(piece_costs,unlock_credits+5) where id=current_round'],
   ['unlocked=least(jsonb_array_length(pieces),unlocked+5*n) where id=current_round','unlock_credits=unlock_credits+5*n,unlocked=october_dev.revealed_count(piece_costs,unlock_credits+5*n) where id=current_round'],
   ['pieces=coalesce(p_payload->''pieces'',pieces),answer=', 'pieces=coalesce(p_payload->''pieces'',pieces),piece_costs=october_dev.piece_costs(coalesce(p_payload->''pieces'',pieces),r.id>=3),answer='],
   ['''mystery:''||r.id,lid,25','''mystery:''||r.id,lid,r.reward_points'],
   ['''old_photo'',old_photo,''guess_correct'',correct','''old_photo'',old_photo,''guess_correct'',correct,''guess_points'',case when correct then r.reward_points else null end']
  ] loop
   previous:=definition;definition:=replace(definition,pair[1],pair[2]);
   if previous=definition then raise exception 'Missing mystery rule anchor: %',pair[1];end if;
  end loop;
  execute definition;
 end loop;
end $migration$;
commit;
