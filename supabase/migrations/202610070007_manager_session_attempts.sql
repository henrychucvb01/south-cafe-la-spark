begin;
-- Keep failed-attempt protection without locking out normal authenticated navigation.
create or replace function public.open_supper_monitoring_session(p_location_id bigint, p_employee_id bigint, p_pin text, p_covering_name text default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_attempt_id bigint; v_name text; v_token text; v_key text := coalesce(p_employee_id::text, 'covering');
begin
  -- Serialize attempts per identity/location so parallel requests cannot bypass
  -- the limit. Return null on failed PIN so the attempt is not rolled back.
  perform pg_advisory_xact_lock(hashtextextended(p_location_id::text || ':' || v_key, 0));
  delete from public.supper_monitoring_attempts where attempted_at < now() - interval '1 day';
  delete from public.supper_monitoring_sessions where expires_at < now();
  if (select count(*) from public.supper_monitoring_attempts where location_id=p_location_id and employee_key=v_key and attempted_at > now() - interval '15 minutes') >= 10 then return null; end if;
  insert into public.supper_monitoring_attempts(location_id, employee_key) values (p_location_id, v_key) returning id into v_attempt_id;
  if not exists(select 1 from public.locations where id=p_location_id and active=true) then return null; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then return null; end if;
  if p_employee_id is null then
    if public.verify_covering_pin(p_pin) is not true then return null; end if;
    v_name := trim(coalesce(p_covering_name, ''));
    if char_length(v_name) not between 3 and 160 then return null; end if;
  else
    select employee_name into v_name from public.employees where id=p_employee_id and location_id=p_location_id and active=true;
    if v_name is null or public.verify_manager_pin(p_employee_id::text, p_pin) is not true then return null; end if;
  end if;
  v_token := gen_random_uuid()::text || gen_random_uuid()::text;
  insert into public.supper_monitoring_sessions(token_hash,location_id,employee_id,monitor_name,covering)
    values(encode(sha256(convert_to(v_token,'UTF8')),'hex'),p_location_id,p_employee_id,v_name,p_employee_id is null);
  -- Successful school-scoped authentication is not a failed PIN attempt.
  delete from public.supper_monitoring_attempts where id=v_attempt_id;
  return v_token;
end $$;
notify pgrst,'reload schema';
commit;
