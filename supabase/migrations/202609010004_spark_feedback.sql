create table if not exists public.spark_feedback (
  id uuid primary key default gen_random_uuid(),
  location_id bigint references public.locations(id) on delete set null,
  location_code text,
  school_name text,
  employee_id bigint,
  employee_name text,
  category text not null check (category in ('Bug', 'Suggestion', 'Question')),
  message text not null check (char_length(message) between 5 and 2000),
  page_route text not null check (char_length(page_route) between 1 and 120),
  status text not null default 'New' check (status in ('New', 'Reviewing', 'Resolved')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists spark_feedback_status_submitted_idx on public.spark_feedback(status, submitted_at desc);
alter table public.spark_feedback enable row level security;
revoke all on public.spark_feedback from anon, authenticated;

create or replace function public.submit_spark_feedback(
  p_location_id bigint, p_location_code text, p_school_name text,
  p_employee_id bigint, p_employee_name text, p_category text,
  p_message text, p_page_route text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_location public.locations%rowtype;
begin
  if p_category not in ('Bug', 'Suggestion', 'Question') then raise exception 'Invalid feedback category'; end if;
  if char_length(trim(coalesce(p_message, ''))) not between 5 and 2000 then raise exception 'Feedback message must be 5 to 2000 characters'; end if;
  if char_length(trim(coalesce(p_page_route, ''))) not between 1 and 120 then raise exception 'Invalid page route'; end if;
  select * into v_location from public.locations where active = true and (id = p_location_id or location_code = p_location_code) limit 1;
  if v_location.id is null then raise exception 'Active location not found'; end if;
  insert into public.spark_feedback(location_id, location_code, school_name, employee_id, employee_name, category, message, page_route)
  values (v_location.id, v_location.location_code, v_location.school_name, p_employee_id, nullif(left(trim(coalesce(p_employee_name, '')), 160), ''), p_category, trim(p_message), trim(p_page_route))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.list_spark_feedback(p_supervisor_pin text, p_status text default null)
returns setof public.spark_feedback language plpgsql security definer set search_path = public as $$
begin
  if public.verify_supervisor_pin(p_supervisor_pin) is not true then raise exception 'Supervisor authorization failed'; end if;
  if p_status is not null and p_status not in ('New', 'Reviewing', 'Resolved') then raise exception 'Invalid feedback status'; end if;
  return query select * from public.spark_feedback where p_status is null or status = p_status order by submitted_at desc limit 500;
end $$;

create or replace function public.update_spark_feedback_status(p_supervisor_pin text, p_feedback_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.verify_supervisor_pin(p_supervisor_pin) is not true then raise exception 'Supervisor authorization failed'; end if;
  if p_status not in ('New', 'Reviewing', 'Resolved') then raise exception 'Invalid feedback status'; end if;
  update public.spark_feedback set status = p_status, updated_at = now() where id = p_feedback_id;
  if not found then raise exception 'Feedback not found'; end if;
end $$;

revoke all on function public.submit_spark_feedback(bigint,text,text,bigint,text,text,text,text) from public;
revoke all on function public.list_spark_feedback(text,text) from public;
revoke all on function public.update_spark_feedback_status(text,uuid,text) from public;
grant execute on function public.submit_spark_feedback(bigint,text,text,bigint,text,text,text,text) to anon, authenticated;
grant execute on function public.list_spark_feedback(text,text) to anon, authenticated;
grant execute on function public.update_spark_feedback_status(text,uuid,text) to anon, authenticated;
