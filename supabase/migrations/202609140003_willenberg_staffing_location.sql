begin;

-- Willenberg exists in location_information and monthly_site_mappings, but older
-- SPARK installations may not yet have its matching operational location row.
update public.location_information
set location_code = '1957', active = true, updated_at = now()
where lower(trim(school_name)) in ('willenberg special ed','willenberg sp ed');

do $$
begin
  if exists (
    select 1 from public.locations where location_code = '1957'
  ) then
    update public.locations
    set active = true
    where location_code = '1957';
  elsif exists (
    select 1
    from public.locations
    where lower(trim(school_name)) in ('willenberg special ed','willenberg sp ed')
  ) then
    update public.locations
    set location_code = '1957', active = true
    where lower(trim(school_name)) in ('willenberg special ed','willenberg sp ed');
  else
    insert into public.locations(location_code,school_name,active)
    values ('1957','Willenberg Special Ed',true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from public.monthly_site_mappings m
    join public.location_information d on d.id = m.main_location_id
    join public.locations l on l.location_code = d.location_code
    where m.source_site_id = '1195701'
      and m.active = true
      and m.program_type = 'main'
      and l.active = true
  ) then
    raise exception 'Willenberg staffing location bridge could not be verified';
  end if;
end $$;

notify pgrst,'reload schema';
commit;
