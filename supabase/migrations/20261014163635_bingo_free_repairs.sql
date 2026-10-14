begin;
set local lock_timeout='5s';
do $repairs$
declare plan jsonb; count_repaired integer; before_cards jsonb; before_points text;
begin
 perform 1 from public.spark_bingo_cards order by location_id,cycle for update;
 plan:=public.spark_bingo_repair_plan();
 if jsonb_array_length(plan)>54 then
  raise exception 'Repair plan exceeds the approved retired squares. No repairs applied';
 end if;
 select jsonb_agg(jsonb_build_object('id',id,'cycle',cycle,'start',started_at,'date',started_on,'completed',completed_ids,'blackout',blackout_at) order by id) into before_cards from public.spark_bingo_cards;
 select md5(coalesce(string_agg(to_jsonb(p)::text,',' order by p.id),'')) into before_points from public.spark_points p;
 count_repaired:=public.spark_bingo_apply_repairs(plan);
 if count_repaired<>jsonb_array_length(plan) then raise exception 'Repair count mismatch'; end if;
 if before_cards is distinct from (select jsonb_agg(jsonb_build_object('id',id,'cycle',cycle,'start',started_at,'date',started_on,'completed',completed_ids,'blackout',blackout_at) order by id) from public.spark_bingo_cards)
 then raise exception 'Protected Bingo progress changed. All repairs rolled back'; end if;
 if before_points is distinct from (select md5(coalesce(string_agg(to_jsonb(p)::text,',' order by p.id),'')) from public.spark_points p)
 then raise exception 'Point ledger changed. All repairs rolled back'; end if;
end;
$repairs$;
commit;
