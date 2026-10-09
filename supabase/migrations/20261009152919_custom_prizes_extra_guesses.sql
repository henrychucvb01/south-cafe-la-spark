begin;
create or replace function public.mystery_admin(p_token text,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.mystery_sessions;p public.mystery_prizes;w public.mystery_wins;prior public.mystery_admin_changes;
 effect text;prize_kind text;result jsonb;
begin
 s:=public.mystery_require(p_token);if s.role<>'supervisor' then raise exception 'Supervisor access is required.';end if;
 if p_request is null or p_payload is null then raise exception 'A change request is required.';end if;
 perform pg_advisory_xact_lock(hashtextextended('mystery-prize-pool',0));
 select * into prior from public.mystery_admin_changes where request_id=p_request;
 if prior.request_id is not null then
  if prior.payload<>p_payload then raise exception 'This request was already used for another change.';end if;
  return prior.result;
 end if;
 if p_payload->>'action'='prize' then
  if p_payload->>'id' is not null then
   select * into p from public.mystery_prizes where id=(p_payload->>'id')::uuid for update;
   if p.id is null or p.retired or p.revision is distinct from (p_payload->>'revision')::int then raise exception 'This prize changed. Refresh and try again.';end if;
  end if;
  effect:=coalesce(p_payload->>'reward_type',p.reward_type);
  if effect is null or effect not in ('points_pull','late_checklist','bingo_change','bingo_free','double_bites','streak_shield','candy_bar','physical','extra_guess') then raise exception 'Choose a supported prize effect.';end if;
  if p.id is not null and effect is distinct from p.reward_type then raise exception 'Keep the existing prize effect. Create a new prize for a different effect.';end if;
  if coalesce(length(trim(p_payload->>'name')),0) not between 1 and 80 or coalesce(length(p_payload->>'description'),601)>600
   or coalesce(length(trim(p_payload->>'icon')),0) not between 1 and 24 then raise exception 'Enter a prize name, description and icon.';end if;
  prize_kind:=case when effect='points_pull' then 'spark_points' else 'manual' end;
  if p.id is null then
   insert into public.mystery_prizes(name,description,icon,kind,reward_type,active,points_amount,bonus_tokens)
   values(trim(p_payload->>'name'),p_payload->>'description',trim(p_payload->>'icon'),prize_kind,effect,coalesce((p_payload->>'active')::boolean,true),case when effect='points_pull' then 5 else 0 end,case when effect='points_pull' then 1 else 0 end) returning * into p;
  else
   update public.mystery_prizes set name=trim(p_payload->>'name'),description=p_payload->>'description',icon=trim(p_payload->>'icon'),active=coalesce((p_payload->>'active')::boolean,active),revision=revision+1 where id=p.id returning * into p;
  end if;
  result:=to_jsonb(p);insert into public.mystery_admin_changes(request_id,payload,result) values(p_request,p_payload,result);return result;
 elsif p_payload->>'action'='stock' then
  select * into p from public.mystery_prizes where id=(p_payload->>'id')::uuid;
  if p.id is null or p.retired or p.reward_type not in ('candy_bar','physical') then raise exception 'Choose a physical prize to change stock.';end if;
 elsif p_payload->>'action'='fulfill' then
  select * into w from public.mystery_wins where id=(p_payload->>'id')::bigint;
  if w.reward_type in ('late_checklist','bingo_change','bingo_free','double_bites','streak_shield','extra_guess') then raise exception 'This digital prize is used by the school, not marked delivered.';end if;
 end if;
 return public.mystery_admin_before_rewards(p_token,p_request,p_payload);
end$$;

-- New physical prize types use the same stock rules as Candy Bars.
do $$ declare fn text;definition text;previous text;
begin foreach fn in array array['public.mystery_pull(text,uuid,integer)','public.mystery_context(text)'] loop
 select pg_get_functiondef(fn::regprocedure) into definition;previous:=definition;
 definition:=replace(definition,'reward_type<>''candy_bar''','reward_type not in (''candy_bar'',''physical'')');
 definition:=replace(definition,'reward_type=''candy_bar''','reward_type in (''candy_bar'',''physical'')');
 if definition=previous then raise exception 'Missing prize stock rule: %',fn;end if;
 execute definition;
end loop;end $$;

-- A prize pays for one additional, auditable attempt. Original guesses remain intact.
create table october_live.extra_guesses(
 win_id bigint primary key references public.mystery_wins(id),round int not null references october_live.rounds(id),
 employee_id text not null,location_id bigint not null references public.locations(id),guess text not null,correct boolean not null,
 submitted_at timestamptz not null default clock_timestamp());
create index october_extra_guesses_round_idx on october_live.extra_guesses(round);
alter table october_live.extra_guesses enable row level security;
revoke all on october_live.extra_guesses from public,anon,authenticated;
create index mystery_unused_extra_guess_idx on public.mystery_wins(location_id,id) where reward_type='extra_guess' and status='waiting';

do $migration$
declare definition text;previous text;pair text[];
begin
 select replace(pg_get_functiondef('public.october_games_live(text,text,text,jsonb)'::regprocedure),E'\r\n',E'\n') into definition;
 foreach pair slice 1 in array array[
  ['declare s public.supper_monitoring_sessions;','declare bonus october_live.extra_guesses; prize public.mystery_wins; uses_prize boolean:=false; s public.supper_monitoring_sessions;'],
  ['elsif p_action=''guess'' then',$patch$elsif p_action='guess' then
  select * into bonus from october_live.extra_guesses where win_id=(p_payload->>'extra_guess_win')::bigint;
  if bonus.win_id is not null then
   if bonus.location_id is distinct from lid or bonus.employee_id is distinct from eid or bonus.round is distinct from (p_payload->>'round')::int
    or bonus.guess is distinct from lower(regexp_replace(trim(p_payload->>'guess'),'\s+',' ','g')) then raise exception 'This extra guess prize was already used.';end if;
   correct:=bonus.correct;select * into r from october_live.rounds where id=bonus.round;
  else$patch$],
  ['if exists(select 1 from october_live.guesses where round=r.id and employee_id=eid) then raise exception ''You already guessed this mystery'';end if;',$patch$if exists(select 1 from october_live.guesses where round=r.id and employee_id=eid) then
   select * into prize from public.mystery_wins where id=(p_payload->>'extra_guess_win')::bigint and location_id=lid and reward_type='extra_guess' and status='waiting' for update;
   if prize.id is null then raise exception 'You already guessed this mystery. Use an available Extra Mystery Guess prize for another attempt.';end if;
   uses_prize:=true;
  elsif p_payload->>'extra_guess_win' is not null then raise exception 'Use your free guess first. Your prize has not been used.';
  end if;$patch$],
  ['insert into october_live.guesses values(r.id,eid,lid,text_guess,correct,clock_timestamp());',$patch$if uses_prize then
   insert into october_live.extra_guesses(win_id,round,employee_id,location_id,guess,correct) values(prize.id,r.id,eid,lid,text_guess,correct);
   insert into public.mystery_redemptions(win_id,location_id,reward_type,details) values(prize.id,lid,'extra_guess',jsonb_build_object('round',r.id,'employee_id',eid));
   update public.mystery_wins set status='received',fulfilled_at=now() where id=prize.id;
  else insert into october_live.guesses values(r.id,eid,lid,text_guess,correct,clock_timestamp());end if;$patch$],
  ['elsif p_action=''champion'' then','end if;'||chr(10)||' elsif p_action=''champion'' then'],
  ['''current_round'',current_round,',$patch$'extra_guess_prizes',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',prize_name,'icon',prize_icon) order by id),'[]') from public.mystery_wins where location_id=lid and reward_type='extra_guess' and status='waiting'),
  'current_round',current_round,$patch$]
 ] loop
  previous:=definition;definition:=replace(definition,pair[1],pair[2]);
  if previous=definition then raise exception 'Missing extra guess anchor: %',pair[1];end if;
 end loop;
 previous:=definition;definition:=replace(definition,'(select coalesce(jsonb_agg(to_jsonb(g) order by submitted_at desc),''[]'') from october_live.guesses g)',
 '(select coalesce(jsonb_agg(data order by submitted_at desc),''[]'') from (select to_jsonb(g) data,submitted_at from october_live.guesses g union all select to_jsonb(g),submitted_at from october_live.extra_guesses g) history)');
 if previous=definition then raise exception 'Missing guess history anchor';end if;
 execute definition;
end $migration$;
commit;
