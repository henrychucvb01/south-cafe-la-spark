create or replace function public.get_accuclaims_production_menu(
  p_supervisor_pin text, p_location_code text, p_source_site_id text,
  p_visit_date date, p_meal_type text
) returns table (
  item_name text, mma_oz_eq numeric, grain_oz_eq numeric,
  fruit_cups numeric, veg_cups numeric, milk_cups numeric
)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if public.verify_supervisor_pin(p_supervisor_pin) is not true then
    raise exception 'Supervisor authorization failed';
  end if;
  if p_meal_type not in ('breakfast','lunch')
    or p_visit_date > (now() at time zone 'America/Los_Angeles')::date then
    return;
  end if;

  return query
    select p.item_name,p.mma_oz_eq,p.grain_oz_eq,p.fruit_cups,p.veg_cups,p.milk_cups
    from public.monthly_production_rows p
    join public.monthly_site_mappings m on m.source_site_id=p.source_site_id and m.active
    join public.location_information d on d.id=m.main_location_id
    where d.location_code=p_location_code
      and ((p_source_site_id is null and m.program_type='main')
        or (p_source_site_id is not null and m.source_site_id=p_source_site_id and m.program_type<>'main'))
      and p.production_date=p_visit_date and p.meal_type=p_meal_type
      and (p.served is null or p.served>0)
    order by p.source_row_number;
end;
$$;

revoke all on function public.get_accuclaims_production_menu(text,text,text,date,text) from public;
grant execute on function public.get_accuclaims_production_menu(text,text,text,date,text) to anon,authenticated;
notify pgrst,'reload schema';
