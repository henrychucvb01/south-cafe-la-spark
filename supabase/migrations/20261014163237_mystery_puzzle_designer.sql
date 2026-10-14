BEGIN;
SET LOCAL lock_timeout='5s';
DO $$DECLARE env text; ns text; definition text; original text; BEGIN
 FOREACH env IN ARRAY ARRAY['dev','live'] LOOP
  ns:='october_'||env;
  EXECUTE format('ALTER TABLE %I.mystery_drafts ADD COLUMN layout_seed integer CHECK(layout_seed>=0)',ns);
  SELECT pg_get_functiondef(to_regprocedure('public.october_games_'||env||'(text,text,text,jsonb)')) INTO definition;original:=definition;
  definition:=replace(definition,'piece_costs=costs,revision=revision+1 WHERE id=d.id;','piece_costs=costs,layout_seed=(p_payload->>''layout_seed'')::integer,revision=revision+1 WHERE id=d.id;');
  IF definition=original THEN RAISE EXCEPTION 'Monthly collection engine changed; review before updating';END IF;
  EXECUTE definition;
 END LOOP;
END$$;
NOTIFY pgrst,'reload schema';
COMMIT;
