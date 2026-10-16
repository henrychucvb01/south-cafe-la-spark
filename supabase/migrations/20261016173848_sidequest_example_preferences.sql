begin;
set local lock_timeout='5s';
do $install$
declare ns text;
begin
 foreach ns in array array['october_dev','october_live'] loop
  execute format('alter table %I.game_drafts add column example_excluded boolean not null default false',ns);
  execute format('alter function %I.games_plan(text,jsonb) rename to games_plan_before_examples',ns);
  execute replace($ddl$
   create function @s@.games_plan(p_action text,p_payload jsonb) returns void
   language plpgsql set search_path=public,@s@,pg_temp as $body$
   begin
    if p_action='games_example' then
     if jsonb_typeof(p_payload->'excluded') is distinct from 'boolean' then raise exception 'Choose an example preference';end if;
     update @s@.game_drafts set example_excluded=(p_payload->>'excluded')::boolean
     where id=(p_payload->>'id')::uuid and state='approved';
     if not found then raise exception 'Approved example required';end if;
    else perform @s@.games_plan_before_examples(p_action,p_payload);end if;
   end;
   $body$;
   revoke all on function @s@.games_plan(text,jsonb),@s@.games_plan_before_examples(text,jsonb) from public,anon,authenticated;
  $ddl$,'@s@',ns);
 end loop;
end;
$install$;
notify pgrst,'reload schema';
commit;
