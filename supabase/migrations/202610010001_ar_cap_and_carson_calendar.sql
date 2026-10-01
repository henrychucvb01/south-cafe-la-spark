begin;
-- Keep the correction and closed Cup standings atomic. Never reissue Pulls.
select pg_advisory_xact_lock(hashtextextended('mystery-prize-pool',0));
lock table public.ar_training_location_cycles, public.ar_training_daily_progress,
 public.ar_training_attempts, public.spark_points in share row exclusive mode;

alter table public.ar_training_attempts drop constraint ar_training_attempts_points_awarded_check;
alter table public.ar_training_attempts add constraint ar_training_attempts_points_awarded_check check(points_awarded in (0,1,2));

-- Reconcile October awards already earned before deployment. September is untouched.
-- Preserve the existing Double Daily Bites multiplier; this is a five BASE point cap.
create temporary table ar_cap_attempts on commit drop as
 select *, least(points_awarded,greatest(0,5-coalesce(sum(points_awarded) over(
  partition by location_id,service_date order by answered_at,id rows between unbounded preceding and 1 preceding),0)))::integer new_points
 from public.ar_training_attempts where service_date >= date '2026-10-01';
create temporary table ar_cap_awards on commit drop as
 select location_id,service_date,question_id,sum(points_awarded)::integer old_points,sum(new_points)::integer new_points
 from ar_cap_attempts group by location_id,service_date,question_id having sum(points_awarded)>0;
update public.spark_points p set points=p.points*a.new_points/a.old_points
 from ar_cap_awards a where p.point_type='ar_training'
 and p.unique_key=format('ar-training-%s-%s-%s',a.location_id,a.service_date,a.question_id)
 and a.old_points<>a.new_points;
update public.ar_training_attempts a set points_awarded=c.new_points from ar_cap_attempts c
 where a.id=c.id and a.points_awarded<>c.new_points;
update public.ar_training_daily_progress set points_awarded=least(points_awarded,5)
 where service_date >= date '2026-10-01' and points_awarded>5;
alter table public.ar_training_daily_progress add constraint ar_training_october_daily_cap
 check(service_date < date '2026-10-01' or points_awarded<=5);

create or replace function public.submit_ar_training_answer(
  p_location_id bigint, p_employee_id bigint, p_employee_name text, p_service_date date,
  p_question_id text, p_selected_index integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_correct_index integer; v_is_correct boolean; v_progress public.ar_training_daily_progress%rowtype;
  v_points integer := 0; v_already_awarded boolean := false; v_is_weekday boolean;
  v_state public.ar_training_location_cycles%rowtype; v_answered jsonb; v_batch_advanced boolean := false;
  v_in_batch boolean := false;
  v_daily_cap integer := case when p_service_date >= date '2026-10-01' then 5 else 10 end;
begin
  if p_location_id is null or p_service_date is null then raise exception 'Location and service date are required'; end if;
  if p_service_date <> (now() at time zone 'America/Los_Angeles')::date then raise exception 'AR Training answers must use today in America/Los_Angeles'; end if;
  if p_selected_index < 0 or p_selected_index > 3 then raise exception 'Invalid answer selection'; end if;
  insert into public.ar_training_location_cycles (location_id) values (p_location_id) on conflict do nothing;
  select * into v_state from public.ar_training_location_cycles where location_id = p_location_id for update;
  select exists (
    select 1 from (
      select q.id from public.ar_training_questions q where q.active = true
      order by case when v_state.cycle_number = 0 then lpad(q.bank_order::text, 6, '0')
                    else md5(q.id || ':' || v_state.cycle_number::text || ':' || p_location_id::text) end
      offset v_state.batch_index * 50 limit 50
    ) batch where batch.id = p_question_id
  ) into v_in_batch;
  if not v_in_batch then raise exception 'Question is not in the active AR Training batch'; end if;
  select correct_index into v_correct_index from public.ar_training_questions where id = p_question_id and active = true;
  if not found then raise exception 'Unknown AR training question'; end if;
  v_is_correct := p_selected_index = v_correct_index;
  v_is_weekday := extract(isodow from p_service_date) between 1 and 5;
  insert into public.ar_training_daily_progress (location_id, service_date) values (p_location_id, p_service_date) on conflict do nothing;
  select * into v_progress from public.ar_training_daily_progress where location_id = p_location_id and service_date = p_service_date for update;
  v_already_awarded := v_progress.awarded_question_ids ? p_question_id;
  if v_is_correct and (v_is_weekday or p_service_date >= date '2026-10-01') and not v_already_awarded and v_progress.points_awarded < v_daily_cap then v_points := least(2, v_daily_cap - v_progress.points_awarded); end if;
  update public.ar_training_daily_progress set
    points_awarded = points_awarded + v_points,
    correct_answers = correct_answers + case when v_is_correct then 1 else 0 end,
    total_attempts = total_attempts + 1,
    awarded_question_ids = case when v_points > 0 then awarded_question_ids || to_jsonb(p_question_id) else awarded_question_ids end,
    updated_at = now()
  where location_id = p_location_id and service_date = p_service_date returning * into v_progress;
  insert into public.ar_training_attempts (location_id, employee_id, employee_name, service_date, question_id, selected_index, is_correct, points_awarded)
  values (p_location_id, p_employee_id, p_employee_name, p_service_date, p_question_id, p_selected_index, v_is_correct, v_points);
  if v_points > 0 then
    insert into public.spark_points (location_id, points, point_type, description, service_date, source, employee_id, employee_name, unique_key)
    values (p_location_id, v_points, 'ar_training', 'AR Training correct answer', p_service_date, 'automatic', p_employee_id, p_employee_name, format('ar-training-%s-%s-%s', p_location_id, p_service_date, p_question_id)) on conflict (unique_key) do nothing;
  end if;
  v_answered := case when v_state.answered_question_ids ? p_question_id then v_state.answered_question_ids else v_state.answered_question_ids || to_jsonb(p_question_id) end;
  if jsonb_array_length(v_answered) >= 50 then
    v_batch_advanced := true;
    update public.ar_training_location_cycles set
      cycle_number = case when batch_index = 9 then cycle_number + 1 else cycle_number end,
      batch_index = case when batch_index = 9 then 0 else batch_index + 1 end,
      answered_question_ids = '[]'::jsonb, updated_at = now()
    where location_id = p_location_id returning * into v_state;
  else
    update public.ar_training_location_cycles set answered_question_ids = v_answered, updated_at = now()
    where location_id = p_location_id returning * into v_state;
  end if;
  return jsonb_build_object('correct', v_is_correct, 'correct_index', v_correct_index, 'points_earned', v_points, 'daily_points', v_progress.points_awarded,
    'cap_reached', v_progress.points_awarded >= v_daily_cap, 'already_awarded', v_already_awarded, 'weekday', v_is_weekday,
    'batch_advanced', v_batch_advanced, 'batch_index', v_state.batch_index, 'cycle_number', v_state.cycle_number);
end; $$;

revoke all on function public.submit_ar_training_answer(bigint, bigint, text, date, text, integer) from public;
grant execute on function public.submit_ar_training_answer(bigint, bigint, text, date, text, integer) to anon, authenticated;

-- Daily Bites, games, AR, and period bonuses are deliberately outside this guard.
-- Zero-point rows retain their unique key so old clients cannot reaward them.
create or replace function public.spark_guard_school_day_points() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.service_date >= date '2026-09-03'
 and new.point_type in ('breakfast_meal_count','lunch_meal_count','supper_meal_count','finish_line','finish_line_late','mystery_checklist_makeup')
 and (extract(isodow from new.service_date)>5 or exists(
  select 1 from public.spark_excluded_days e where e.location_id=new.location_id and e.service_date=new.service_date)) then
  new.points:=0;
  new.description:='No checklist points — non-operating school day';
 end if;
 return new;
end $$;
revoke all on function public.spark_guard_school_day_points() from public,anon,authenticated;
create trigger spark_guard_school_day_points before insert or update on public.spark_points
 for each row execute function public.spark_guard_school_day_points();

-- Correct only the eight audited Carson awards, retaining source evidence and
-- the valid Perfect Week bonus whose week-ending date is September 4.
create temporary table carson_correction on commit drop as
 select coalesce(sum(p.points),0)::bigint delta from public.spark_points p
 join public.locations l on l.id=p.location_id
 where l.location_code='2836' and l.school_name='Carson El'
 and p.service_date in (date '2026-09-04',date '2026-09-07')
 and p.source='automatic' and p.point_type in ('breakfast_meal_count','lunch_meal_count','supper_meal_count','finish_line_late');
update public.spark_points p set points=0,description='No checklist points — non-operating school day'
 from public.locations l where l.id=p.location_id and l.location_code='2836' and l.school_name='Carson El'
 and p.service_date in (date '2026-09-04',date '2026-09-07') and p.source='automatic'
 and p.point_type in ('breakfast_meal_count','lunch_meal_count','supper_meal_count','finish_line_late');

-- Adjust only Carson's closed score and rerank. Never reissue or revoke tokens,
-- or include unrelated activity posted after the September Cup closed.
update public.spark_monthly_cup_results r set points=r.points-c.delta
 from carson_correction c where r.month=date '2026-09-01' and r.location_code='2836' and r.school_name='Carson El';
with ranked as (select location_id,rank() over(order by points desc)::integer corrected_rank
 from public.spark_monthly_cup_results where month=date '2026-09-01')
update public.spark_monthly_cup_results r set rank=v.corrected_rank from ranked v
 where r.month=date '2026-09-01' and r.location_id=v.location_id;
do $$ begin
 if exists(select 1 from public.spark_monthly_cup_results where month=date '2026-09-01'
 and tokens<>case when points>0 and rank<=5 then 2 when points>0 and rank<=17 then 1 else 0 end) then
  raise exception 'Correction changes a paid Cup reward tier; review before applying';
 end if;
end $$;
commit;

