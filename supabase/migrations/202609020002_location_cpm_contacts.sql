-- Add school-specific Complex Project Manager (CPM) contacts to the shared
-- location directory and keep those contacts editable by supervisors.

alter table public.location_information
  add column if not exists cpm_name text,
  add column if not exists cpm_phone text,
  add column if not exists cpm_cell_phone text,
  add column if not exists cpm_email text;

-- Current CPM assignments from the uploaded 2026 CPM directory.
update public.location_information as location
set cpm_name = source.cpm_name,
    cpm_phone = source.cpm_phone,
    cpm_cell_phone = source.cpm_cell_phone,
    cpm_email = source.cpm_email,
    updated_at = now()
from (values
  ('8575', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('8529', 'Allen Craig', '323-549-2073', '213-272-9989', 'allen.craig@lausd.net'),
  ('8487', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('6867', 'Allen Craig', '323-549-2073', '213-272-9989', 'allen.craig@lausd.net'),
  ('8103', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('8090', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('7781', 'Allen Craig', '323-549-2073', '213-272-9989', 'allen.craig@lausd.net'),
  ('2301', 'Allen Craig', '323-549-2073', '213-272-9989', 'allen.craig@lausd.net'),
  ('4014', 'Allen Craig', '323-549-2073', '213-272-9989', 'allen.craig@lausd.net'),
  ('2527', 'Allen Craig', '323-549-2073', '213-272-9989', 'allen.craig@lausd.net'),
  ('2890', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('2815', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('7329', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('7419', 'Allen Craig', '323-549-2073', '213-272-9989', 'allen.craig@lausd.net'),
  ('3452', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('2089', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('4041', 'Manuel Duenas Sanchez', '310-808-1516', '213-364-0710', 'mxd6526@lausd.net'),
  ('5753', 'Manuel Duenas Sanchez', '310-808-1516', '213-364-0710', 'mxd6526@lausd.net'),
  ('2530', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('2146', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('4829', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('7205', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('2473', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('3384', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('8868', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('3466', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net'),
  ('2836', 'Jose Monreal', '310-808-1514', '818-309-3117', 'jose.monreal@lausd.net')
) as source(location_code, cpm_name, cpm_phone, cpm_cell_phone, cpm_email)
where location.location_code = source.location_code;

update public.location_information
set cpm_name = 'Ramon Saldana',
    cpm_phone = '310-808-1509',
    cpm_cell_phone = '323-997-5357',
    cpm_email = 'rxs7308@lausd.net',
    updated_at = now()
where location_code is null
  and lower(trim(school_name)) = 'willenberg special ed';

-- Replace the previous editor RPC. Latitude/longitude remain stored and are
-- intentionally not touched by this function.
drop function if exists public.update_location_information(
  text, bigint, text, text, text, text, text, text, text, text,
  double precision, double precision
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
  p_cpm_name text,
  p_cpm_phone text,
  p_cpm_cell_phone text,
  p_cpm_email text
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

  update public.location_information
  set location_code = nullif(trim(p_location_code), ''),
      school_name = trim(p_school_name),
      address = nullif(trim(p_address), ''),
      manager_name = nullif(trim(p_manager_name), ''),
      site_type = upper(nullif(trim(p_site_type), '')),
      counting_claiming = upper(nullif(trim(p_counting_claiming), '')),
      cafeteria_phone = nullif(trim(p_cafeteria_phone), ''),
      school_phone = nullif(trim(p_school_phone), ''),
      cpm_name = nullif(trim(p_cpm_name), ''),
      cpm_phone = nullif(trim(p_cpm_phone), ''),
      cpm_cell_phone = nullif(trim(p_cpm_cell_phone), ''),
      cpm_email = nullif(trim(p_cpm_email), ''),
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
  text, bigint, text, text, text, text, text, text, text, text,
  text, text, text, text
) from public;

grant execute on function public.update_location_information(
  text, bigint, text, text, text, text, text, text, text, text,
  text, text, text, text
) to anon, authenticated;
