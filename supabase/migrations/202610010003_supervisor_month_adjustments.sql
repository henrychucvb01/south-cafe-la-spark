begin;
-- Supervisor adjustments belong to the selected earning month. If the Cup has
-- closed, apply only this adjustment to its saved score; never repay Pull tokens.
create or replace function public.spark_adjust_closed_cup() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare target_month date:=date_trunc('month',new.service_date)::date;
begin
 if new.point_type<>'supervisor_adjustment' or new.source is distinct from 'supervisor' then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('mystery-prize-pool',0));
 update public.spark_monthly_cup_results set points=points+new.points
 where month=target_month and location_id=new.location_id;
 if found then
  with ranked as (select location_id,rank() over(order by points desc)::integer corrected_rank
   from public.spark_monthly_cup_results where month=target_month)
  update public.spark_monthly_cup_results r set rank=v.corrected_rank from ranked v
   where r.month=target_month and r.location_id=v.location_id;
 end if;
 return new;
end $$;
revoke all on function public.spark_adjust_closed_cup() from public,anon,authenticated;
create trigger spark_adjust_closed_cup after insert on public.spark_points
 for each row when (new.point_type='supervisor_adjustment' and new.source='supervisor')
 execute function public.spark_adjust_closed_cup();
commit;
