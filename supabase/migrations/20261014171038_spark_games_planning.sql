BEGIN;
SET LOCAL lock_timeout='5s';
DO $install$
DECLARE env text; ns text; definition text;
BEGIN
FOREACH env IN ARRAY ARRAY['dev','live'] LOOP
ns:='october_'||env;
EXECUTE replace($ddl$
 CREATE TABLE @s@.game_cycles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), month date NOT NULL UNIQUE CHECK(month=date_trunc('month',month)::date), state text NOT NULL DEFAULT 'planned' CHECK(state IN('planned','active','archived')), opened_at timestamptz, closed_at timestamptz);
 CREATE TABLE @s@.game_waves(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cycle_id uuid NOT NULL REFERENCES @s@.game_cycles(id),monday date NOT NULL UNIQUE CHECK(extract(isodow from monday)=1),release_at timestamptz NOT NULL,state text NOT NULL DEFAULT 'planned' CHECK(state IN('planned','released')),released_at timestamptz,released_count int NOT NULL DEFAULT 0);
 ALTER TABLE @s@.quests ADD COLUMN cycle_id uuid REFERENCES @s@.game_cycles(id), ADD COLUMN wave_id uuid REFERENCES @s@.game_waves(id), ADD COLUMN goal text;
 CREATE TABLE @s@.game_drafts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cycle_id uuid NOT NULL REFERENCES @s@.game_cycles(id),wave_id uuid REFERENCES @s@.game_waves(id),quest_id int UNIQUE REFERENCES @s@.quests(id),library_id text,title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 100),description text NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 1000),goal text NOT NULL CHECK(length(trim(goal)) BETWEEN 1 AND 300),reward_points int NOT NULL CHECK(reward_points BETWEEN 1 AND 1000),state text NOT NULL DEFAULT 'proposed' CHECK(state IN('proposed','approved','rejected')),revision int NOT NULL DEFAULT 1,UNIQUE(cycle_id,title));
 ALTER TABLE @s@.game_cycles ENABLE ROW LEVEL SECURITY;
 ALTER TABLE @s@.game_waves ENABLE ROW LEVEL SECURITY;
 ALTER TABLE @s@.game_drafts ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON @s@.game_cycles,@s@.game_waves,@s@.game_drafts FROM PUBLIC,anon,authenticated;
 CREATE FUNCTION @s@.games_plan(p_action text,p_payload jsonb) RETURNS void LANGUAGE plpgsql SET search_path=public,@s@,pg_temp AS $body$
 #variable_conflict use_column
 DECLARE cycle uuid; wave uuid; item jsonb; row @s@.game_drafts; month_date date; day date; release_time time; identifier uuid; next_id int; amount int;
 BEGIN
 IF p_action IN('games_generate','games_time') THEN
  IF coalesce(p_payload->>'month','') !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Select a valid competition month';END IF;
  month_date:=(p_payload->>'month'||'-01')::date;release_time:=coalesce(p_payload->>'release_time','07:00')::time;
  IF month_date<date_trunc('month',now() AT TIME ZONE 'America/Los_Angeles')::date THEN RAISE EXCEPTION 'Historical competition planning is locked';END IF;
  INSERT INTO @s@.game_cycles(month) VALUES(month_date) ON CONFLICT(month) DO NOTHING;
  SELECT id INTO cycle FROM @s@.game_cycles WHERE month=month_date;
  FOR day IN SELECT d::date FROM generate_series(month_date::timestamp,(month_date+interval '1 month' - interval '1 day')::timestamp,interval '1 day')d WHERE extract(isodow FROM d)=1 LOOP
   INSERT INTO @s@.game_waves(cycle_id,monday,release_at) VALUES(cycle,day,(day+release_time) AT TIME ZONE 'America/Los_Angeles') ON CONFLICT(monday) DO NOTHING;
  END LOOP;
  IF p_action='games_time' THEN
   IF EXISTS(SELECT 1 FROM @s@.game_waves WHERE cycle_id=cycle AND state='planned' AND (monday+release_time) AT TIME ZONE 'America/Los_Angeles'<=now()) THEN RAISE EXCEPTION 'Release times must be in the future';END IF;
   UPDATE @s@.game_waves SET release_at=(monday+release_time) AT TIME ZONE 'America/Los_Angeles' WHERE cycle_id=cycle AND state='planned';
  ELSE
   IF jsonb_typeof(p_payload->'prompts')<>'array' OR jsonb_array_length(p_payload->'prompts') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Generate 1–50 prompts';END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'prompts') LOOP
    wave:=NULL;IF item->>'monday' IS NOT NULL THEN SELECT id INTO wave FROM @s@.game_waves WHERE cycle_id=cycle AND monday=(item->>'monday')::date AND state='planned';IF wave IS NULL THEN RAISE EXCEPTION 'Select an unreleased Monday in this month';END IF;END IF;
    INSERT INTO @s@.game_drafts(cycle_id,wave_id,library_id,title,description,goal,reward_points) VALUES(cycle,wave,item->>'library_id',trim(item->>'title'),trim(item->>'description'),trim(item->>'goal'),coalesce((item->>'reward_points')::int,10)) ON CONFLICT(cycle_id,title) DO NOTHING;
   END LOOP;
  END IF;
 ELSIF p_action='games_draft' THEN
  SELECT * INTO row FROM @s@.game_drafts WHERE id=(p_payload->>'id')::uuid FOR UPDATE;
  IF row.id IS NULL OR row.revision IS DISTINCT FROM (p_payload->>'revision')::int THEN RAISE EXCEPTION 'Suggestion changed. Refresh first.';END IF;
  IF EXISTS(SELECT 1 FROM @s@.game_waves WHERE id=row.wave_id AND state='released') THEN RAISE EXCEPTION 'Released challenges are locked';END IF;
  wave:=NULL;IF p_payload->>'monday' IS NOT NULL THEN SELECT id INTO wave FROM @s@.game_waves WHERE cycle_id=row.cycle_id AND monday=(p_payload->>'monday')::date AND state='planned';IF wave IS NULL THEN RAISE EXCEPTION 'Invalid Monday';END IF;END IF;
  IF p_payload->>'state' NOT IN('proposed','rejected') THEN RAISE EXCEPTION 'Changes require approval again';END IF;
  UPDATE @s@.game_drafts SET title=trim(p_payload->>'title'),description=trim(p_payload->>'description'),goal=trim(p_payload->>'goal'),reward_points=(p_payload->>'reward_points')::int,wave_id=wave,library_id=p_payload->>'library_id',state=p_payload->>'state',revision=revision+1 WHERE id=row.id;
  IF row.quest_id IS NOT NULL THEN UPDATE @s@.quests SET enabled=false WHERE id=row.quest_id;END IF;
 ELSIF p_action='games_approve' THEN
  IF jsonb_typeof(p_payload->'ids')<>'array' OR jsonb_array_length(p_payload->'ids') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Select 1–50 suggestions';END IF;
  FOR identifier IN SELECT DISTINCT value::uuid FROM jsonb_array_elements_text(p_payload->'ids') LOOP
   SELECT * INTO row FROM @s@.game_drafts WHERE id=identifier FOR UPDATE;
   IF row.id IS NULL OR row.wave_id IS NULL THEN RAISE EXCEPTION 'Assign each suggestion to a Monday';END IF;
   IF row.state='approved' THEN CONTINUE;END IF;
   IF NOT EXISTS(SELECT 1 FROM @s@.game_waves WHERE id=row.wave_id AND state='planned' AND release_at>now()) THEN RAISE EXCEPTION 'Approve only future unreleased waves';END IF;
   SELECT count(*) INTO amount FROM @s@.game_drafts WHERE wave_id=row.wave_id AND state='approved';
   IF amount>=10 THEN RAISE EXCEPTION 'A Monday wave can contain at most 10 approved quests';END IF;
   next_id:=row.quest_id;IF next_id IS NULL THEN SELECT coalesce(max(id),0)+1 INTO next_id FROM @s@.quests;END IF;
   INSERT INTO @s@.quests(id,name,description,goal,reward_points,enabled,cycle_id,wave_id) VALUES(next_id,row.title,row.description,row.goal,row.reward_points,false,row.cycle_id,row.wave_id)
   ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,goal=excluded.goal,reward_points=excluded.reward_points,enabled=false,cycle_id=excluded.cycle_id,wave_id=excluded.wave_id,revision=@s@.quests.revision+1;
   UPDATE @s@.game_drafts SET quest_id=next_id,state='approved',revision=revision+1 WHERE id=row.id;
  END LOOP;
 ELSE RAISE EXCEPTION 'Unknown planning action';END IF;
 END $body$;
 CREATE FUNCTION @s@.games_reconcile() RETURNS void LANGUAGE plpgsql AS $body$ BEGIN RETURN;END $body$;
 REVOKE ALL ON FUNCTION @s@.games_plan(text,jsonb),@s@.games_reconcile() FROM PUBLIC,anon,authenticated;
 $ddl$,'@s@',ns);
 -- Preserve the current installed implementation, including later Mystery Photo changes.
 SELECT pg_get_functiondef(to_regprocedure('public.october_games_'||env||'(text,text,text,jsonb)')) INTO definition;
 IF definition IS NULL THEN RAISE EXCEPTION 'October Games % function missing',env;END IF;
 definition:=replace(definition,'FUNCTION public.october_games_'||env||'(','FUNCTION '||ns||'.games_legacy(');
 EXECUTE definition;
 EXECUTE format('REVOKE ALL ON FUNCTION %I.games_legacy(text,text,text,jsonb) FROM PUBLIC,anon,authenticated',ns);
 EXECUTE replace(replace($wrapper$
 CREATE OR REPLACE FUNCTION public.october_games_@env@(p_action text,p_token text DEFAULT NULL,p_pin text DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,@s@,pg_temp AS $body$
 #variable_conflict use_column
 DECLARE actor jsonb; result jsonb; wave uuid; cycle uuid; school bigint; wins int; entry @s@.entries; quest @s@.quests;
 BEGIN
 actor:=@s@.games_legacy('authorize',p_token,p_pin,'{}');
 PERFORM 1 FROM @s@.settings WHERE id FOR UPDATE;
 IF p_action LIKE 'games_%' THEN
  IF coalesce((actor->>'admin')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Supervisor authorization required';END IF;
  PERFORM @s@.games_plan(p_action,p_payload);p_action:='list';
 END IF;
 result:=@s@.games_legacy(p_action,p_token,p_pin,p_payload);
 IF coalesce((actor->>'admin')::boolean,false) THEN
  result:=result||jsonb_build_object('games_planning',jsonb_build_object(
   'cycles',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY month),'[]') FROM @s@.game_cycles c),
   'waves',(SELECT coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('month',to_char(c.month,'YYYY-MM')) ORDER BY w.monday),'[]') FROM @s@.game_waves w JOIN @s@.game_cycles c ON c.id=w.cycle_id),
   'drafts',(SELECT coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('month',to_char(c.month,'YYYY-MM'),'monday',w.monday) ORDER BY w.monday NULLS LAST,d.title),'[]') FROM @s@.game_drafts d JOIN @s@.game_cycles c ON c.id=d.cycle_id LEFT JOIN @s@.game_waves w ON w.id=d.wave_id),
   'warnings',(SELECT coalesce(jsonb_agg('Monday '||w.monday||': '||(SELECT count(*) FROM @s@.game_drafts d WHERE d.wave_id=w.id AND d.state='approved')||' of 10 quests approved'),'[]') FROM @s@.game_waves w WHERE w.state='planned' AND (SELECT count(*) FROM @s@.game_drafts d WHERE d.wave_id=w.id AND d.state='approved')<10)));
 END IF;
 RETURN result;
 END $body$;
 REVOKE ALL ON FUNCTION public.october_games_@env@(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.october_games_@env@(text,text,text,jsonb) TO service_role;
 $wrapper$,'@s@',ns),'@env@',env);
END LOOP;
END $install$;
NOTIFY pgrst,'reload schema';
COMMIT;
