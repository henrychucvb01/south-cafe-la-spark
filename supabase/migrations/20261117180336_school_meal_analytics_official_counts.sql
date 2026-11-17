begin;
-- Read only, school-scoped data for an existing verified manager/temporary
-- manager or Supervisor session. No meal records or rollup rules are changed.
create function public.school_meal_analytics(p_token text,p_start_date date,p_end_date date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role not in ('manager','supervisor') or s.actor_role is null then raise exception 'School access required'; end if;
 if p_start_date is null or p_end_date is null or p_end_date<p_start_date or p_end_date-p_start_date>366 then
  raise exception 'Choose a valid date range of at most one year';
 end if;
 return jsonb_build_object(
  'official_rows',coalesce((select jsonb_agg(jsonb_build_object('location_id',o.location_id,'service_date',o.service_date,
   'breakfast_count',o.breakfast_count,'lunch_count',o.lunch_count,'supper_count',o.supper_count) order by o.service_date)
   from public.official_meal_counts o where o.location_id=s.location_id and o.service_date between p_start_date and p_end_date),'[]'::jsonb),
  'meal_rows',coalesce((select jsonb_agg(to_jsonb(m) order by m.service_date) from public.meal_counts m
   where m.location_id=s.location_id and m.service_date between p_start_date and p_end_date),'[]'::jsonb),
  'labor_rows',coalesce((select jsonb_agg(to_jsonb(l) order by l.service_date) from public.labor_hours l
   where l.location_id=s.location_id and l.service_date between p_start_date and p_end_date),'[]'::jsonb)
 );
end $$;
revoke all on function public.school_meal_analytics(text,date,date) from public;
grant execute on function public.school_meal_analytics(text,date,date) to anon,authenticated;
notify pgrst,'reload schema';
commit;
