BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE TABLE spark_private.finish_line_requests (
  request_id uuid PRIMARY KEY, actor text NOT NULL, payload jsonb NOT NULL,
  result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE spark_private.finish_line_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON spark_private.finish_line_requests FROM PUBLIC,anon,authenticated;

-- One transaction owns the answers, counts, audit and every daily award.
-- Existing bonus triggers participate in that same transaction.
CREATE FUNCTION public.spark_submit_finish_line(p_request_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  s spark_private.sessions; prior spark_private.finish_line_requests;
  c public.finish_line_checks; m public.meal_counts; saved public.finish_line_checks;
  loc bigint; day date; actor text; required text[]; k text; v jsonb;
  items jsonb; old_values jsonb; new_values jsonb; result jsonb;
  status text; breakfast integer; lunch integer; supper integer; is_edit boolean;
BEGIN
  loc:=(p_payload->>'location_id')::bigint; day:=(p_payload->>'service_date')::date;
  s:=spark_private.require_actor(loc);
  actor:=s.actor_role||':'||coalesce(s.employee_id::text,s.actor_name);
  IF p_request_id IS NULL OR jsonb_typeof(p_payload)<>'object' OR day IS NULL
    OR day>(now() AT TIME ZONE 'America/Los_Angeles')::date THEN
    RAISE EXCEPTION 'Invalid Finish Line submission.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('finish-request-'||p_request_id,0));
  SELECT * INTO prior FROM spark_private.finish_line_requests WHERE request_id=p_request_id;
  IF FOUND THEN
    IF prior.actor<>actor OR prior.payload<>p_payload THEN RAISE EXCEPTION 'This submission identifier has already been used.'; END IF;
    RETURN prior.result;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('finish-save-'||loc||'-'||day,0));
  SELECT * INTO c FROM public.finish_line_checks WHERE location_id=loc AND service_date=day FOR UPDATE;
  SELECT * INTO m FROM public.meal_counts WHERE location_id=loc AND service_date=day FOR UPDATE;
  is_edit:=c.id IS NOT NULL;
  IF coalesce(c.updated_at,c.submitted_at) IS DISTINCT FROM (p_payload->>'expected_check_version')::timestamptz
    OR m.updated_at IS DISTINCT FROM (p_payload->>'expected_meal_version')::timestamptz THEN
    RAISE EXCEPTION 'This school was updated while you were editing. Reload Finish Line and review the latest values before saving.' USING ERRCODE='PT409';
  END IF;
  required:=ARRAY['previous_meal_counts','dairy_order_created','receivers_completed','production_worksheet','production_record','meal_count_entered','reports_reviewed'];
  CASE extract(isodow FROM day)::integer
    WHEN 1 THEN required:=required||ARRAY['monday_missing_meal_report','monday_all_meal_counts_entered'];
    WHEN 2 THEN required:=array_append(required,'tuesday_meal_plan');
    WHEN 3 THEN required:=array_append(required,'wednesday_order_status');
    WHEN 4 THEN required:=array_append(required,'thursday_orders_complete');
    ELSE NULL;
  END CASE;
  IF date_trunc('month',day::timestamp)<>date_trunc('month',(day+CASE WHEN extract(isodow FROM day)=5 THEN 3 ELSE 1 END)::timestamp) THEN
    required:=array_append(required,'month_end_inventory');
  END IF;
  items:=p_payload->'items';
  IF jsonb_typeof(items) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Checklist answers are required.'; END IF;
  status:='complete';
  FOREACH k IN ARRAY required LOOP
    v:=items->k;
    IF coalesce(v->>'answer','') NOT IN ('yes','no','na') THEN RAISE EXCEPTION 'Complete every required checklist answer.'; END IF;
    IF v->>'answer' IN ('no','na') AND nullif(btrim(v->>'comment'),'') IS NULL THEN RAISE EXCEPTION 'Explain each No or N/A response.'; END IF;
    IF v->>'answer'='no' THEN status:='attention'; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['equipment','prepAreas','floors','trash','kitchenReady'] LOOP
    IF p_payload->'closing'->k IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Complete Closing and Readiness.'; END IF;
  END LOOP;
  IF coalesce(p_payload->'meals'->>'breakfast','') !~ '^\d+$' OR coalesce(p_payload->'meals'->>'lunch','') !~ '^\d+$'
    OR (p_payload->'meals'->>'supper' IS NOT NULL AND p_payload->'meals'->>'supper' !~ '^\d+$') THEN RAISE EXCEPTION 'Enter valid nonnegative meal counts.'; END IF;
  breakfast:=(p_payload->'meals'->>'breakfast')::integer;
  lunch:=(p_payload->'meals'->>'lunch')::integer;
  supper:=(p_payload->'meals'->>'supper')::integer;
  SELECT coalesce(jsonb_object_agg(item_key,answer),'{}') INTO old_values FROM public.finish_line_items WHERE finish_line_check_id=c.id;
  old_values:=old_values||jsonb_build_object('Comments',c.comments,'Finish Line Status',c.status,
    'Breakfast meal count',m.breakfast_count,'Lunch meal count',m.lunch_count,'Supper meal count',m.supper_count);
  INSERT INTO public.finish_line_checks(location_id,service_date,employee_id,employee_name,comments,status,submitted_at,updated_at)
    VALUES(loc,day,s.employee_id,s.actor_name,nullif(p_payload->>'comments',''),status,now(),clock_timestamp())
    ON CONFLICT(location_id,service_date) DO UPDATE SET employee_id=excluded.employee_id,employee_name=excluded.employee_name,
      comments=excluded.comments,status=excluded.status,updated_at=excluded.updated_at RETURNING * INTO saved;
  DELETE FROM public.finish_line_items WHERE finish_line_check_id=saved.id;
  new_values:='{}';
  FOREACH k IN ARRAY required LOOP
    v:=items->k;
    INSERT INTO public.finish_line_items(finish_line_check_id,item_key,item_label,answer,requires_attention)
      VALUES(saved.id,k,left(coalesce(nullif(v->>'label',''),k),300),v->>'answer',v->>'answer'='no');
    new_values:=new_values||jsonb_build_object(k,v->>'answer');
    IF v->>'answer' IN ('no','na') THEN
      INSERT INTO public.finish_line_items(finish_line_check_id,item_key,item_label,answer)
        VALUES(saved.id,k||'_comment',left(coalesce(v->>'label',k),300)||' — explanation',btrim(v->>'comment'));
      new_values:=new_values||jsonb_build_object(k||'_comment',btrim(v->>'comment'));
    END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['equipment','prepAreas','floors','trash','kitchenReady'] LOOP
    INSERT INTO public.finish_line_items(finish_line_check_id,item_key,item_label,answer) VALUES(saved.id,'closing_'||k,'Closing: '||k,'yes');
    new_values:=new_values||jsonb_build_object('closing_'||k,'yes');
  END LOOP;
  INSERT INTO public.meal_counts(location_id,service_date,breakfast_count,lunch_count,supper_count,supper_status,entered_by,updated_at)
    VALUES(loc,day,breakfast,lunch,supper,CASE WHEN supper IS NULL THEN 'pending' ELSE 'complete' END,s.actor_name,clock_timestamp())
    ON CONFLICT(location_id,service_date) DO UPDATE SET breakfast_count=excluded.breakfast_count,lunch_count=excluded.lunch_count,
      supper_count=excluded.supper_count,supper_status=excluded.supper_status,entered_by=excluded.entered_by,updated_at=excluded.updated_at;
  new_values:=new_values||jsonb_build_object('Comments',saved.comments,'Finish Line Status',status,
    'Breakfast meal count',breakfast,'Lunch meal count',lunch,'Supper meal count',supper);
  -- Derive changes from locked database values, never a stale browser snapshot.
  INSERT INTO public.finish_line_audit_log(finish_line_check_id,location_id,service_date,employee_name,field_name,old_value,new_value)
    SELECT saved.id,loc,day,s.actor_name,keys.key,CASE WHEN is_edit THEN old_values->>keys.key END,new_values->>keys.key
    FROM (SELECT jsonb_object_keys(old_values||new_values) AS key) keys
    WHERE (CASE WHEN is_edit THEN old_values->keys.key END) IS DISTINCT FROM new_values->keys.key;
  IF day<date '2026-09-03' OR (extract(isodow FROM day)<=5 AND NOT EXISTS(SELECT FROM public.spark_excluded_days WHERE location_id=loc AND service_date=day)) THEN
    PERFORM public.spark_claim_school_points(loc,day,'breakfast_meal_count');
    PERFORM public.spark_claim_school_points(loc,day,'lunch_meal_count');
    IF supper IS NOT NULL THEN PERFORM public.spark_claim_school_points(loc,day,'supper_meal_count'); END IF;
    PERFORM public.spark_claim_school_points(loc,day,'finish_line');
  END IF;
  result:=jsonb_build_object('check',to_jsonb(saved),'was_edit',is_edit);
  INSERT INTO spark_private.finish_line_requests(request_id,actor,payload,result) VALUES(p_request_id,actor,p_payload,result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.spark_submit_finish_line(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spark_submit_finish_line(uuid,jsonb) TO anon,authenticated;
COMMIT;
