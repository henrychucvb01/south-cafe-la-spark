-- Allow the supervisor location editor to maintain the school address while
-- preserving the existing map latitude/longitude values behind the scenes.

drop function if exists public.update_location_information(
  text,
  bigint,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision
);

create or replace function public.update_location_information(
  p_supervisor_pin text,
  p_id bigint,
  p_location_code text,
  p_school_name text,
  p_address text,
  p_manager_name text,
  p_site_type text,
  p_counting_claiming text,
  p_cafeteria_phone text,
  p_school_phone text,
  p_latitude double precision,
  p_longitude double precision
) returns public.location_information
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.location_information;
begin
  if public.verify_supervisor_pin(p_supervisor_pin) is not true then
    raise exception 'Supervisor authorization failed';
  end if;

  if nullif(trim(p_school_name), '') is null then
    raise exception 'School name is required';
  end if;

  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'Latitude must be between -90 and 90';
  end if;

  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'Longitude must be between -180 and 180';
  end if;

  update public.location_information
  set location_code = nullif(trim(p_location_code), ''),
      school_name = trim(p_school_name),
      address = nullif(trim(p_address), ''),
      manager_name = nullif(trim(p_manager_name), ''),
      site_type = upper(nullif(trim(p_site_type), '')),
      counting_claiming = upper(nullif(trim(p_counting_claiming), '')),
      cafeteria_phone = nullif(trim(p_cafeteria_phone), ''),
      school_phone = nullif(trim(p_school_phone), ''),
      latitude = p_latitude,
      longitude = p_longitude,
      updated_at = now()
  where id = p_id
  returning * into v_record;

  if v_record.id is null then
    raise exception 'Location record not found';
  end if;

  return v_record;
end;
$$;

revoke all on function public.update_location_information(
  text,
  bigint,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision
) from public;

grant execute on function public.update_location_information(
  text,
  bigint,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision
) to anon, authenticated;
