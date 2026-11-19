begin;
do $migration$
declare env text; ns text;
begin
 foreach env in array array['live','dev'] loop
  ns:='october_'||env;
  execute replace($ddl$
   create table @s@.guess_reviews (
    round integer not null references @s@.rounds(id),
    attempt_key text not null,
    location_id bigint not null references public.locations(id),
    reviewed_at timestamptz not null default now(),
    refund_points integer not null,
    reward_points integer not null,
    primary key(round,attempt_key)
   );
   alter table @s@.guess_reviews enable row level security;
   revoke all on @s@.guess_reviews from public,anon,authenticated,service_role;
  $ddl$,'@s@',ns);
  execute format('alter function public.october_games_%s(text,text,text,jsonb) rename to october_games_%s_before_guess_reviews',env,env);
  execute format('revoke all on function public.october_games_%s_before_guess_reviews(text,text,text,jsonb) from public,anon,authenticated,service_role',env);
  execute replace(replace($wrapper$
   create function public.october_games_@env@(p_action text,p_token text default null,p_pin text default null,p_payload jsonb default '{}')
   returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
   declare result jsonb; attempt record; photo @s@.rounds; purchase @s@.guess_purchases;
     refund integer:=0; award integer:=0;
   begin
    if p_action='review_guess' then
     if p_pin is null or public.verify_supervisor_pin(p_pin) is not true then
      raise exception 'Supervisor authorization required';
     end if;
     -- Serialize against guesses and purchases through the existing game lock.
     perform 1 from @s@.settings where id for update;
     select * into attempt from @s@.guess_history()
      where round=(p_payload->>'round')::integer and attempt_key=p_payload->>'attempt_key';
     if not found then raise exception 'Submitted guess not found'; end if;
     if not attempt.correct and not exists(select 1 from @s@.guess_reviews v
       where v.round=attempt.round and v.attempt_key=attempt.attempt_key) then
      select * into strict photo from @s@.rounds where id=attempt.round for update;
      if photo.solved_at is null then
       perform public.october_games_@env@_before_guess_reviews('accept_guess',p_token,p_pin,p_payload);
       award:=photo.reward_points;
      elsif photo.winner is distinct from attempt.location_id then
       insert into @s@.rewards(event,location_id,points)
        values('mystery-reviewed:'||attempt.round||':'||attempt.location_id,attempt.location_id,photo.reward_points)
        on conflict do nothing
        returning points into award;
      end if;
      select p.* into purchase from @s@.school_guesses g
       join @s@.guess_purchases p on p.id=g.purchase_id and p.round=g.round and p.location_id=g.location_id
       where 'attempt:'||g.id=attempt.attempt_key and g.round=attempt.round and g.location_id=attempt.location_id
        and p.consumed_at is not null and p.refunded_at is null;
      if found then
       refund:=purchase.price;
       perform @s@.guess_points(attempt.location_id,refund,'mystery-guess-refund:'||purchase.id,
        'Refund: accepted answer for Mystery '||attempt.round);
      end if;
      insert into @s@.guess_reviews(round,attempt_key,location_id,refund_points,reward_points)
       values(attempt.round,attempt.attempt_key,attempt.location_id,refund,coalesce(award,0));
     end if;
     p_action:='list';
     p_payload:='{}';
    end if;
    result:=public.october_games_@env@_before_guess_reviews(p_action,p_token,p_pin,p_payload);
    if p_pin is not null and jsonb_typeof(result->'guesses')='array' then
     select jsonb_set(result,'{guesses}',coalesce(jsonb_agg(
      g||jsonb_build_object('paid_points',coalesce(p.price,0))||
      case when v.attempt_key is null then '{}'::jsonb else jsonb_build_object(
       'correct',true,'supervisor_accepted',true,'refund_points',v.refund_points,'reward_points',v.reward_points) end
      order by position),'[]'::jsonb)) into result
     from jsonb_array_elements(result->'guesses') with ordinality as guesses(g,position)
     left join @s@.school_guesses a on g->>'attempt_key'='attempt:'||a.id
     left join @s@.guess_purchases p on p.id=a.purchase_id
     left join @s@.guess_reviews v on v.round=(g->>'round')::integer and v.attempt_key=g->>'attempt_key';
    end if;
    return result;
   end;
   $$;
   revoke all on function public.october_games_@env@(text,text,text,jsonb) from public,anon,authenticated;
   grant execute on function public.october_games_@env@(text,text,text,jsonb) to service_role;
  $wrapper$,'@s@',ns),'@env@',env);
 end loop;
end;
$migration$;
notify pgrst,'reload schema';
commit;
