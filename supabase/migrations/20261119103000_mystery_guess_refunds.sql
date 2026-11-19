begin;
do $migration$
declare env text; ns text;
begin
 foreach env in array array['live','dev'] loop
  ns:='october_'||env;
  execute format('alter table %I.guess_reviews add column accepted boolean not null default true',ns);
  execute replace(replace($wrapper$
   create or replace function public.october_games_@env@(p_action text,p_token text default null,p_pin text default null,p_payload jsonb default '{}')
   returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
   declare result jsonb; attempt record; photo @s@.rounds; purchase @s@.guess_purchases;
     refund integer:=0; award integer:=0; prior @s@.guess_reviews; accepting boolean;
   begin
    if p_action in ('review_guess','refund_guess') then
     accepting:=p_action='review_guess';
     if p_pin is null or public.verify_supervisor_pin(p_pin) is not true then
      raise exception 'Supervisor authorization required';
     end if;
     -- Serialize against guesses and purchases through the existing game lock.
     perform 1 from @s@.settings where id for update;
     select * into attempt from @s@.guess_history()
      where round=(p_payload->>'round')::integer and attempt_key=p_payload->>'attempt_key';
     if not found then raise exception 'Submitted guess not found'; end if;
     select * into prior from @s@.guess_reviews v
      where v.round=attempt.round and v.attempt_key=attempt.attempt_key;
     if attempt.correct then raise exception 'Only incorrect guesses can be reviewed'; end if;
     if not coalesce(prior.accepted,false) and (accepting or prior.attempt_key is null) then
      refund:=coalesce(prior.refund_points,0);
      if accepting then
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
      end if;
      if refund=0 then
       select p.* into purchase from @s@.school_guesses g
        join @s@.guess_purchases p on p.id=g.purchase_id and p.round=g.round and p.location_id=g.location_id
        where 'attempt:'||g.id=attempt.attempt_key and g.round=attempt.round and g.location_id=attempt.location_id
         and p.consumed_at is not null and p.refunded_at is null;
       if found then
        refund:=purchase.price;
        perform @s@.guess_points(attempt.location_id,refund,'mystery-guess-refund:'||purchase.id,
         'Refund: reviewed guess for Mystery '||attempt.round);
       elsif not accepting then
        raise exception 'This guess did not spend SPARK Points';
       end if;
      end if;
      insert into @s@.guess_reviews(round,attempt_key,location_id,refund_points,reward_points,accepted)
       values(attempt.round,attempt.attempt_key,attempt.location_id,refund,coalesce(award,0),accepting)
       on conflict(round,attempt_key) do update set accepted=excluded.accepted,
        reward_points=excluded.reward_points,reviewed_at=now();
     end if;
     p_action:='list';
     p_payload:='{}';
    end if;
    result:=public.october_games_@env@_before_guess_reviews(p_action,p_token,p_pin,p_payload);
    if p_pin is not null and jsonb_typeof(result->'guesses')='array' then
     select jsonb_set(result,'{guesses}',coalesce(jsonb_agg(
      g||jsonb_build_object('paid_points',coalesce(p.price,0))||
      case when v.attempt_key is null then '{}'::jsonb else jsonb_build_object(
       'correct',v.accepted or (g->>'correct')::boolean,'supervisor_accepted',v.accepted or coalesce((g->>'supervisor_accepted')::boolean,false),'refund_points',v.refund_points,'reward_points',v.reward_points) end
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
