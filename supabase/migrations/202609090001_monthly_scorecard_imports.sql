begin;

create table if not exists public.monthly_import_batches (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('production','cost')),
  school_year text not null check (school_year ~ '^20[0-9]{2}-[0-9]{2}$'),
  reporting_month date not null check (reporting_month = date_trunc('month', reporting_month)::date),
  original_filename text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by text,
  status text not null check (status in ('processing','completed','failed')),
  source_row_count integer not null default 0,
  imported_row_count integer not null default 0,
  rejected_row_count integer not null default 0,
  ignored_row_count integer not null default 0,
  out_of_area_row_count integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  parser_version text not null,
  source_checksum text,
  created_at timestamptz not null default now(),
  unique (report_type, school_year, reporting_month)
);

create table if not exists public.monthly_import_raw_rows (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.monthly_import_batches(id) on delete cascade,
  source_row_number integer not null,
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  unique (batch_id, source_row_number)
);

create table if not exists public.monthly_production_rows (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.monthly_import_batches(id) on delete cascade,
  location_id bigint references public.location_information(id),
  source_site_id text not null,
  production_date date not null,
  meal_type text not null check (meal_type in ('breakfast','lunch','supper')),
  menu_name text,
  meals_served integer,
  item_name text not null,
  item_code text,
  planned numeric,
  prepared numeric,
  served numeric,
  leftover numeric,
  mma_oz_eq numeric,
  grain_oz_eq numeric,
  fruit_cups numeric,
  veg_cups numeric,
  milk_cups numeric,
  source_row_number integer not null,
  unique (batch_id, source_row_number)
);

create table if not exists public.monthly_production_cost_rows (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.monthly_import_batches(id) on delete cascade,
  location_id bigint references public.location_information(id),
  source_site_id text not null,
  production_date date not null,
  meal_type text not null check (meal_type in ('breakfast','lunch','supper')),
  food_cost numeric not null,
  source_row_number integer not null,
  unique (batch_id, source_row_number)
);

create table if not exists public.monthly_site_mappings (
  id bigint generated always as identity primary key,
  source_site_id text not null unique,
  main_location_id bigint not null references public.location_information(id),
  source_site_name text,
  program_type text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monthly_excluded_source_sites (
  source_site_id text primary key,
  source_site_name text not null,
  reason text not null,
  active boolean not null default true
);

insert into public.monthly_excluded_source_sites(source_site_id,source_site_name,reason)
values ('1913101','HAWTHORNE ACADEMY','Outside South Café LA supervisory area')
on conflict (source_site_id) do update set source_site_name=excluded.source_site_name,reason=excluded.reason,active=true;

insert into public.monthly_site_mappings(source_site_id,main_location_id,source_site_name,program_type)
select '1' || lpad(location_code,4,'0') || '01',id,school_name,'main' from public.location_information where active=true and location_code ~ '^[0-9]{4}$'
on conflict (source_site_id) do nothing;

-- Existing SPARK location/CPM migrations establish Willenberg as location 1957.
insert into public.monthly_site_mappings(source_site_id,main_location_id,source_site_name,program_type)
select '1195701',id,'WILLENBERG SP ED','main' from public.location_information
where active=true and location_code='1957' and lower(trim(school_name))='willenberg special ed'
on conflict (source_site_id) do update set main_location_id=excluded.main_location_id,source_site_name=excluded.source_site_name,program_type='main',updated_at=now();

insert into public.monthly_site_mappings(source_site_id,main_location_id,source_site_name,program_type)
select mapping.source_site_id,l.id,mapping.source_site_name,mapping.program_type
from (values
  ('1221201','5753','186TH ST EL - CSPP','CSPP'),
  ('1239801','2146','ANNALEE EL - CSPP','CSPP'),
  ('1853101','8529','AVALON HS','offsite'),
  ('1220601','2527','BROAD AVE EL - CSPP','CSPP'),
  ('1857801','8575','EAGLE TREE HS','offsite'),
  ('1231701','2301','DE LA TORRE EL CSPP','CSPP'),
  ('1951401','3452','DOLORES EEC','EEC'),
  ('1958501','7781','WILMINGTON EEC','EEC')
) mapping(source_site_id,main_location_code,source_site_name,program_type)
join public.location_information l on l.location_code=mapping.main_location_code
on conflict (source_site_id) do update set main_location_id=excluded.main_location_id,source_site_name=excluded.source_site_name,program_type=excluded.program_type,updated_at=now();

create table if not exists public.monthly_reimbursement_rates (
  school_year text not null,
  meal_type text not null check (meal_type in ('breakfast','lunch','supper')),
  rate numeric(8,2) not null check (rate >= 0),
  primary key (school_year, meal_type)
);

insert into public.monthly_reimbursement_rates(school_year, meal_type, rate)
values ('2026-27','breakfast',4.08), ('2026-27','lunch',5.90), ('2026-27','supper',5.90)
on conflict (school_year, meal_type) do update set rate = excluded.rate;

create index if not exists monthly_import_batches_period_idx on public.monthly_import_batches(school_year, reporting_month);
create index if not exists monthly_production_location_date_idx on public.monthly_production_rows(location_id, production_date);
create index if not exists monthly_cost_location_date_idx on public.monthly_production_cost_rows(location_id, production_date);

alter table public.monthly_import_batches enable row level security;
alter table public.monthly_import_raw_rows enable row level security;
alter table public.monthly_production_rows enable row level security;
alter table public.monthly_production_cost_rows enable row level security;
alter table public.monthly_site_mappings enable row level security;
alter table public.monthly_excluded_source_sites enable row level security;
alter table public.monthly_reimbursement_rates enable row level security;

revoke all on public.monthly_import_batches, public.monthly_import_raw_rows,
  public.monthly_production_rows, public.monthly_production_cost_rows,
  public.monthly_site_mappings, public.monthly_excluded_source_sites, public.monthly_reimbursement_rates
from anon, authenticated;

create or replace function public.import_monthly_scorecard_report(
  p_supervisor_pin text,
  p_report_type text,
  p_school_year text,
  p_reporting_month date,
  p_original_filename text,
  p_uploaded_by text,
  p_parser_version text,
  p_source_checksum text,
  p_source_row_count integer,
  p_rejected_row_count integer,
  p_ignored_row_count integer,
  p_out_of_area_row_count integer,
  p_raw_rows jsonb,
  p_normalized_rows jsonb,
  p_warnings jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_batch_id uuid;
  v_month date := date_trunc('month', p_reporting_month)::date;
  v_imported integer := jsonb_array_length(coalesce(p_normalized_rows, '[]'::jsonb));
  v_unmapped integer;
begin
  if public.verify_supervisor_pin(p_supervisor_pin) is not true then raise exception 'Supervisor authorization failed'; end if;
  if p_report_type not in ('production','cost') then raise exception 'Unsupported monthly report type'; end if;
  if p_school_year !~ '^20[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid school year'; end if;
  if jsonb_typeof(p_raw_rows) <> 'array' or jsonb_typeof(p_normalized_rows) <> 'array' then raise exception 'Import rows must be arrays'; end if;

  insert into public.monthly_import_batches(report_type, school_year, reporting_month, original_filename, uploaded_by, status,
    source_row_count, imported_row_count, rejected_row_count, ignored_row_count, out_of_area_row_count, warnings, parser_version, source_checksum)
  values (p_report_type, p_school_year, v_month, left(p_original_filename,255), left(p_uploaded_by,160), 'processing',
    p_source_row_count, 0, 0, 0, 0, coalesce(p_warnings,'[]'::jsonb), p_parser_version, p_source_checksum)
  on conflict (report_type, school_year, reporting_month) do update set
    original_filename=excluded.original_filename, uploaded_at=now(), uploaded_by=excluded.uploaded_by, status='processing',
    source_row_count=excluded.source_row_count, imported_row_count=0, rejected_row_count=0, ignored_row_count=0, out_of_area_row_count=0,
    warnings=excluded.warnings, errors='[]'::jsonb, parser_version=excluded.parser_version, source_checksum=excluded.source_checksum
  returning id into v_batch_id;

  delete from public.monthly_import_raw_rows where batch_id=v_batch_id;
  insert into public.monthly_import_raw_rows(batch_id, source_row_number, row_data)
  select v_batch_id, (x->>'source_row_number')::integer, x->'row_data' from jsonb_array_elements(p_raw_rows) x;

  if p_report_type='production' then
    delete from public.monthly_production_rows where batch_id=v_batch_id;
    insert into public.monthly_production_rows(batch_id,location_id,source_site_id,production_date,meal_type,menu_name,meals_served,item_name,item_code,planned,prepared,served,leftover,mma_oz_eq,grain_oz_eq,fruit_cups,veg_cups,milk_cups,source_row_number)
    select v_batch_id,l.id,x->>'source_site_id',(x->>'production_date')::date,x->>'meal_type',nullif(x->>'menu_name',''),nullif(x->>'meals_served','')::integer,x->>'item_name',nullif(x->>'item_code',''),
      nullif(x->>'planned','')::numeric,nullif(x->>'prepared','')::numeric,nullif(x->>'served','')::numeric,nullif(x->>'leftover','')::numeric,
      nullif(x->>'mma_oz_eq','')::numeric,nullif(x->>'grain_oz_eq','')::numeric,nullif(x->>'fruit_cups','')::numeric,nullif(x->>'veg_cups','')::numeric,nullif(x->>'milk_cups','')::numeric,(x->>'source_row_number')::integer
    from jsonb_array_elements(p_normalized_rows) x left join public.monthly_site_mappings sm on sm.source_site_id=x->>'source_site_id' and sm.active=true
    left join public.location_information l on l.id=sm.main_location_id
    where not exists (select 1 from public.monthly_excluded_source_sites e where e.source_site_id=x->>'source_site_id' and e.active=true);
  elsif p_report_type='cost' then
    delete from public.monthly_production_cost_rows where batch_id=v_batch_id;
    insert into public.monthly_production_cost_rows(batch_id,location_id,source_site_id,production_date,meal_type,food_cost,source_row_number)
    select v_batch_id,l.id,x->>'source_site_id',(x->>'production_date')::date,x->>'meal_type',(x->>'food_cost')::numeric,(x->>'source_row_number')::integer
    from jsonb_array_elements(p_normalized_rows) x left join public.monthly_site_mappings sm on sm.source_site_id=x->>'source_site_id' and sm.active=true
    left join public.location_information l on l.id=sm.main_location_id
    where not exists (select 1 from public.monthly_excluded_source_sites e where e.source_site_id=x->>'source_site_id' and e.active=true);
  end if;

  select count(*) into v_unmapped from (
    select location_id from public.monthly_production_rows where batch_id=v_batch_id and location_id is null
    union all select location_id from public.monthly_production_cost_rows where batch_id=v_batch_id and location_id is null
  ) q;

  update public.monthly_import_batches set status='completed', imported_row_count=v_imported,
    rejected_row_count=greatest(0,p_rejected_row_count), ignored_row_count=greatest(0,p_ignored_row_count), out_of_area_row_count=greatest(0,p_out_of_area_row_count),
    warnings=case when v_unmapped>0 then warnings || jsonb_build_array(v_unmapped || ' normalized rows have unmapped site IDs') else warnings end
  where id=v_batch_id;
  return v_batch_id;
end $$;

create or replace function public.list_monthly_scorecard_imports(p_supervisor_pin text,p_school_year text,p_reporting_month date)
returns setof public.monthly_import_batches language plpgsql security definer set search_path=public as $$
begin
  if public.verify_supervisor_pin(p_supervisor_pin) is not true then raise exception 'Supervisor authorization failed'; end if;
  return query select * from public.monthly_import_batches where school_year=p_school_year and reporting_month=date_trunc('month',p_reporting_month)::date order by report_type;
end $$;

create or replace function public.get_monthly_scorecard_dataset(
  p_supervisor_pin text,p_school_year text,p_reporting_month date
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_month date := date_trunc('month',p_reporting_month)::date;
  v_next date := (date_trunc('month',p_reporting_month)+interval '1 month')::date;
  v_previous date := (date_trunc('month',p_reporting_month)-interval '1 month')::date;
begin
  if public.verify_supervisor_pin(p_supervisor_pin) is not true then raise exception 'Supervisor authorization failed'; end if;
  return jsonb_build_object(
    'schools',coalesce((select jsonb_agg(to_jsonb(s) order by s.school_name) from (
      select d.id directory_id,o.id location_id,d.location_code,d.school_name,d.site_type,
        o.enrollment,o.labor_type,o.budget_labor_hours
      from public.location_information d
      left join public.locations o on o.location_code=d.location_code and o.active=true
      where d.active=true and lower(trim(d.school_name)) not in ('test high school','hawthorne academy')
    ) s),'[]'::jsonb),
    'meal_counts',coalesce((select jsonb_agg(to_jsonb(m)) from public.meal_counts m join public.locations l on l.id=m.location_id
      where l.active=true and lower(trim(l.school_name))<>'test high school' and m.service_date>=v_previous and m.service_date<v_next),'[]'::jsonb),
    'labor_hours',coalesce((select jsonb_agg(to_jsonb(h)) from public.labor_hours h join public.locations l on l.id=h.location_id
      where l.active=true and lower(trim(l.school_name))<>'test high school' and h.service_date>=v_previous and h.service_date<v_next),'[]'::jsonb),
    'production_rows',coalesce((select jsonb_agg(to_jsonb(p)) from public.monthly_production_rows p join public.monthly_import_batches b on b.id=p.batch_id
      where b.school_year=p_school_year and p.production_date>=v_previous and p.production_date<v_next),'[]'::jsonb),
    'cost_rows',coalesce((select jsonb_agg(to_jsonb(c)) from public.monthly_production_cost_rows c join public.monthly_import_batches b on b.id=c.batch_id
      where b.school_year=p_school_year and c.production_date>=v_previous and c.production_date<v_next),'[]'::jsonb),
    'rates',coalesce((select jsonb_agg(to_jsonb(r)) from public.monthly_reimbursement_rates r where r.school_year=p_school_year),'[]'::jsonb),
    'batches',coalesce((select jsonb_agg(to_jsonb(b)) from public.monthly_import_batches b
      where b.school_year=p_school_year and b.reporting_month in (v_previous,v_month)),'[]'::jsonb)
  );
end $$;

revoke all on function public.import_monthly_scorecard_report(text,text,text,date,text,text,text,text,integer,integer,integer,integer,jsonb,jsonb,jsonb) from public;
revoke all on function public.list_monthly_scorecard_imports(text,text,date) from public;
revoke all on function public.get_monthly_scorecard_dataset(text,text,date) from public;
grant execute on function public.import_monthly_scorecard_report(text,text,text,date,text,text,text,text,integer,integer,integer,integer,jsonb,jsonb,jsonb) to anon,authenticated;
grant execute on function public.list_monthly_scorecard_imports(text,text,date) to anon,authenticated;
grant execute on function public.get_monthly_scorecard_dataset(text,text,date) to anon,authenticated;

commit;
