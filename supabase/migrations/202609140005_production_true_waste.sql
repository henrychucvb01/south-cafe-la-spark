begin;

alter table public.monthly_production_rows
  add column if not exists wasted numeric;

create or replace function public.import_monthly_scorecard_report(
  p_supervisor_pin text,p_report_type text,p_school_year text,p_reporting_month date,
  p_original_filename text,p_uploaded_by text,p_parser_version text,p_source_checksum text,
  p_source_row_count integer,p_rejected_row_count integer,p_ignored_row_count integer,
  p_out_of_area_row_count integer,p_raw_rows jsonb,p_normalized_rows jsonb,
  p_warnings jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_batch_id uuid;
  v_month date:=date_trunc('month',p_reporting_month)::date;
  v_imported integer:=jsonb_array_length(coalesce(p_normalized_rows,'[]'::jsonb));
  v_unmapped integer;
begin
  if public.verify_supervisor_pin(p_supervisor_pin) is not true then raise exception 'Supervisor authorization failed'; end if;
  if p_report_type not in ('production','cost') then raise exception 'Unsupported monthly report type'; end if;
  if p_school_year !~ '^20[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid school year'; end if;
  if jsonb_typeof(p_raw_rows)<>'array' or jsonb_typeof(p_normalized_rows)<>'array' then raise exception 'Import rows must be arrays'; end if;

  insert into public.monthly_import_batches(report_type,school_year,reporting_month,original_filename,uploaded_by,status,
    source_row_count,imported_row_count,rejected_row_count,ignored_row_count,out_of_area_row_count,warnings,parser_version,source_checksum)
  values(p_report_type,p_school_year,v_month,left(p_original_filename,255),left(p_uploaded_by,160),'processing',
    p_source_row_count,0,0,0,0,coalesce(p_warnings,'[]'::jsonb),p_parser_version,p_source_checksum)
  on conflict(report_type,school_year,reporting_month) do update set
    original_filename=excluded.original_filename,uploaded_at=now(),uploaded_by=excluded.uploaded_by,status='processing',
    source_row_count=excluded.source_row_count,imported_row_count=0,rejected_row_count=0,ignored_row_count=0,out_of_area_row_count=0,
    warnings=excluded.warnings,errors='[]'::jsonb,parser_version=excluded.parser_version,source_checksum=excluded.source_checksum
  returning id into v_batch_id;

  delete from public.monthly_import_raw_rows where batch_id=v_batch_id;
  insert into public.monthly_import_raw_rows(batch_id,source_row_number,row_data)
  select v_batch_id,(x->>'source_row_number')::integer,x->'row_data' from jsonb_array_elements(p_raw_rows) x;

  if p_report_type='production' then
    delete from public.monthly_production_rows where batch_id=v_batch_id;
    insert into public.monthly_production_rows(batch_id,location_id,source_site_id,production_date,meal_type,menu_name,meals_served,item_name,item_code,planned,prepared,served,leftover,wasted,mma_oz_eq,grain_oz_eq,fruit_cups,veg_cups,milk_cups,source_row_number)
    select v_batch_id,l.id,x->>'source_site_id',(x->>'production_date')::date,x->>'meal_type',nullif(x->>'menu_name',''),nullif(x->>'meals_served','')::integer,x->>'item_name',nullif(x->>'item_code',''),
      nullif(x->>'planned','')::numeric,nullif(x->>'prepared','')::numeric,nullif(x->>'served','')::numeric,nullif(x->>'leftover','')::numeric,nullif(x->>'wasted','')::numeric,
      nullif(x->>'mma_oz_eq','')::numeric,nullif(x->>'grain_oz_eq','')::numeric,nullif(x->>'fruit_cups','')::numeric,nullif(x->>'veg_cups','')::numeric,nullif(x->>'milk_cups','')::numeric,(x->>'source_row_number')::integer
    from jsonb_array_elements(p_normalized_rows) x
    left join public.monthly_site_mappings sm on sm.source_site_id=x->>'source_site_id' and sm.active=true
    left join public.location_information l on l.id=sm.main_location_id
    where not exists(select 1 from public.monthly_excluded_source_sites e where e.source_site_id=x->>'source_site_id' and e.active=true);
  else
    delete from public.monthly_production_cost_rows where batch_id=v_batch_id;
    insert into public.monthly_production_cost_rows(batch_id,location_id,source_site_id,production_date,meal_type,food_cost,source_row_number)
    select v_batch_id,l.id,x->>'source_site_id',(x->>'production_date')::date,x->>'meal_type',(x->>'food_cost')::numeric,(x->>'source_row_number')::integer
    from jsonb_array_elements(p_normalized_rows) x
    left join public.monthly_site_mappings sm on sm.source_site_id=x->>'source_site_id' and sm.active=true
    left join public.location_information l on l.id=sm.main_location_id
    where not exists(select 1 from public.monthly_excluded_source_sites e where e.source_site_id=x->>'source_site_id' and e.active=true);
  end if;

  select count(*) into v_unmapped from(
    select location_id from public.monthly_production_rows where batch_id=v_batch_id and location_id is null
    union all select location_id from public.monthly_production_cost_rows where batch_id=v_batch_id and location_id is null
  ) q;
  update public.monthly_import_batches set status='completed',imported_row_count=v_imported,
    rejected_row_count=greatest(0,p_rejected_row_count),ignored_row_count=greatest(0,p_ignored_row_count),out_of_area_row_count=greatest(0,p_out_of_area_row_count),
    warnings=case when v_unmapped>0 then warnings||jsonb_build_array(v_unmapped||' normalized rows have unmapped site IDs') else warnings end
  where id=v_batch_id;
  return v_batch_id;
end $$;

revoke all on function public.import_monthly_scorecard_report(text,text,text,date,text,text,text,text,integer,integer,integer,integer,jsonb,jsonb,jsonb) from public;
grant execute on function public.import_monthly_scorecard_report(text,text,text,date,text,text,text,text,integer,integer,integer,integer,jsonb,jsonb,jsonb) to anon,authenticated;

notify pgrst,'reload schema';
commit;
