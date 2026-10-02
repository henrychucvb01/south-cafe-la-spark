begin;
-- Merge small, retry-safe chunks. File dates alone determine month and school year.
create or replace function public.merge_monthly_scorecard_rows(
 p_supervisor_pin text,p_report_type text,p_filename text,p_checksum text,
 p_source_count integer,p_rejected_count integer,p_rows jsonb
) returns jsonb language plpgsql security definer set search_path=public set statement_timeout='60s' as $$
declare v_month date;v_year integer;v_batch uuid;v_offset integer;v_rows jsonb;v_count integer:=0;
begin
 if public.verify_supervisor_pin(p_supervisor_pin) is not true then raise exception 'Supervisor authorization failed'; end if;
 if p_report_type not in ('cost','production') then raise exception 'Unsupported report type'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 250 then raise exception 'Supply 1 to 250 records per request'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x where nullif(x->>'source_site_id','') is null
  or nullif(x->>'production_date','') is null or coalesce(x->>'meal_type','') not in ('breakfast','lunch','supper')) then raise exception 'Invalid site, date or meal'; end if;
 perform pg_advisory_xact_lock(hashtextextended('monthly-scorecard-merge-'||p_report_type,0));
 for v_month in select distinct date_trunc('month',(x->>'production_date')::date)::date from jsonb_array_elements(p_rows) x order by 1 loop
  v_year:=extract(year from v_month)::integer-case when extract(month from v_month)<7 then 1 else 0 end;
  select jsonb_agg(value order by ordinal) into v_rows from (
   select distinct on(value->>'source_site_id',value->>'production_date',value->>'meal_type',
    case when p_report_type='cost' then '' else coalesce(nullif(value->>'item_code',''),value->>'item_name') end) value,ordinal
   from jsonb_array_elements(p_rows) with ordinality t(value,ordinal)
   where date_trunc('month',(value->>'production_date')::date)::date=v_month
    and not exists(select 1 from monthly_excluded_source_sites e where e.source_site_id=value->>'source_site_id' and e.active)
   order by value->>'source_site_id',value->>'production_date',value->>'meal_type',
    case when p_report_type='cost' then '' else coalesce(nullif(value->>'item_code',''),value->>'item_name') end,ordinal desc
  ) deduped;
  if v_rows is null then continue; end if;
  insert into monthly_import_batches(report_type,school_year,reporting_month,original_filename,uploaded_by,status,source_row_count,rejected_row_count,parser_version,source_checksum)
  values(p_report_type,v_year||'-'||right((v_year+1)::text,2),v_month,left(p_filename,255),'Supervisor','processing',p_source_count,p_rejected_count,'2.0.0',p_checksum)
  on conflict(report_type,school_year,reporting_month) do update set original_filename=excluded.original_filename,
   uploaded_at=now(),status='processing',source_row_count=excluded.source_row_count,rejected_row_count=excluded.rejected_row_count,
   source_checksum=excluded.source_checksum,parser_version=excluded.parser_version,errors='[]'::jsonb
  returning id into v_batch;
  select greatest(coalesce((select max(source_row_number) from monthly_import_raw_rows where batch_id=v_batch),0),
   coalesce((select max(source_row_number) from monthly_production_rows where batch_id=v_batch),0),
   coalesce((select max(source_row_number) from monthly_production_cost_rows where batch_id=v_batch),0)) into v_offset;
  if p_report_type='cost' then
   delete from monthly_production_cost_rows old using jsonb_array_elements(v_rows) x
   where old.batch_id=v_batch and old.source_site_id=x->>'source_site_id'
    and old.production_date=(x->>'production_date')::date and old.meal_type=x->>'meal_type'
   ;
   insert into monthly_production_cost_rows(batch_id,location_id,source_site_id,production_date,meal_type,food_cost,source_row_number)
   select v_batch,m.main_location_id,r.source_site_id,r.production_date,r.meal_type,r.food_cost,v_offset+t.ordinal::integer
   from jsonb_array_elements(v_rows) with ordinality t(value,ordinal)
   cross join lateral jsonb_populate_record(null::monthly_production_cost_rows,t.value) r
   left join monthly_site_mappings m on m.source_site_id=r.source_site_id and m.active;
  elsif p_report_type='production' then
   delete from monthly_production_rows old using jsonb_array_elements(v_rows) x
   where old.batch_id=v_batch and old.source_site_id=x->>'source_site_id'
    and old.production_date=(x->>'production_date')::date and old.meal_type=x->>'meal_type'
    and coalesce(nullif(old.item_code,''),old.item_name)=coalesce(nullif(x->>'item_code',''),x->>'item_name')
   ;
   insert into monthly_production_rows(batch_id,location_id,source_site_id,production_date,meal_type,menu_name,meals_served,item_name,item_code,planned,prepared,served,leftover,wasted,mma_oz_eq,grain_oz_eq,fruit_cups,veg_cups,milk_cups,source_row_number)
   select v_batch,m.main_location_id,r.source_site_id,r.production_date,r.meal_type,r.menu_name,r.meals_served,r.item_name,r.item_code,r.planned,r.prepared,r.served,r.leftover,r.wasted,r.mma_oz_eq,r.grain_oz_eq,r.fruit_cups,r.veg_cups,r.milk_cups,v_offset+t.ordinal::integer
   from jsonb_array_elements(v_rows) with ordinality t(value,ordinal)
   cross join lateral jsonb_populate_record(null::monthly_production_rows,t.value) r
   left join monthly_site_mappings m on m.source_site_id=r.source_site_id and m.active;
  end if;
  -- Keep compact evidence for imported rows, not the entire multi-month report layout.
  insert into monthly_import_raw_rows(batch_id,source_row_number,row_data)
  select v_batch,v_offset+ordinal::integer,value from jsonb_array_elements(v_rows) with ordinality t(value,ordinal);
  update monthly_import_batches set status='completed',imported_row_count=
   case when p_report_type='cost' then (select count(*) from monthly_production_cost_rows where batch_id=v_batch)
   else (select count(*) from monthly_production_rows where batch_id=v_batch) end where id=v_batch;
  v_count:=v_count+jsonb_array_length(v_rows);
 end loop;
 return jsonb_build_object('saved',v_count);
end $$;
revoke all on function public.merge_monthly_scorecard_rows(text,text,text,text,integer,integer,jsonb) from public;
grant execute on function public.merge_monthly_scorecard_rows(text,text,text,text,integer,integer,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
