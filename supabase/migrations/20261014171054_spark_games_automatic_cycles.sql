BEGIN;
SET LOCAL lock_timeout='5s';
DO $install$
DECLARE env text; ns text; definition text;
BEGIN
FOREACH env IN ARRAY ARRAY['dev','live'] LOOP
ns:='october_'||env;
EXECUTE replace($ddl$
 CREATE TABLE @s@.game_wave_wins(wave_id uuid NOT NULL REFERENCES @s@.game_waves(id),location_id bigint NOT NULL REFERENCES public.locations(id),entry_id uuid PRIMARY KEY REFERENCES @s@.entries(id),quest_id int NOT NULL UNIQUE REFERENCES @s@.quests(id),awarded_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX ON @s@.game_wave_wins(wave_id,location_id);
 ALTER TABLE @s@.game_wave_wins ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON @s@.game_wave_wins FROM PUBLIC,anon,authenticated;
 CREATE OR REPLACE FUNCTION @s@.games_reconcile() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,@s@,pg_temp AS $body$
  #variable_conflict use_column
 DECLARE next_cycle @s@.game_cycles; opening timestamptz; w @s@.game_waves; released int;
 BEGIN
 PERFORM 1 FROM @s@.settings WHERE id FOR UPDATE;
 -- A prepared competition starts on its first scheduled Monday, never on an unapproved generation.
 FOR next_cycle IN SELECT c.* FROM @s@.game_cycles c WHERE c.state='planned'
 AND (SELECT min(w.release_at) FROM @s@.game_waves w WHERE w.cycle_id=c.id AND EXISTS(SELECT 1 FROM @s@.game_drafts d WHERE d.wave_id=w.id AND d.state='approved'))<=now()
 AND EXISTS(SELECT 1 FROM @s@.game_drafts WHERE cycle_id=c.id AND state='approved') ORDER BY c.month LOOP
  SELECT min(w.release_at) INTO opening FROM @s@.game_waves w WHERE w.cycle_id=next_cycle.id AND EXISTS(SELECT 1 FROM @s@.game_drafts d WHERE d.wave_id=w.id AND d.state='approved');
  IF EXISTS(SELECT 1 FROM @s@.game_cycles WHERE state='active' AND month>next_cycle.month) THEN CONTINUE;END IF;
  UPDATE @s@.game_cycles SET state='archived',closed_at=opening WHERE state='active' AND month<next_cycle.month;
  UPDATE @s@.game_cycles SET state='active',opened_at=opening WHERE id=next_cycle.id;
 END LOOP;
 FOR w IN SELECT w.* FROM @s@.game_waves w JOIN @s@.game_cycles c ON c.id=w.cycle_id WHERE c.state='active' AND w.state='planned' AND w.release_at<=now() ORDER BY w.release_at LOOP
  UPDATE @s@.quests q SET enabled=true WHERE q.wave_id=w.id AND EXISTS(SELECT 1 FROM @s@.game_drafts d WHERE d.quest_id=q.id AND d.state='approved');
  GET DIAGNOSTICS released=ROW_COUNT;
  UPDATE @s@.game_waves SET state='released',released_at=w.release_at,released_count=released WHERE id=w.id;
  UPDATE @s@.settings SET revision=revision+1,changed_at=now(),quests_state=CASE WHEN released>0 THEN 'active' ELSE quests_state END WHERE id;
 END LOOP;
 END $body$;
 REVOKE ALL ON FUNCTION @s@.games_reconcile() FROM PUBLIC,anon,authenticated;
 CREATE FUNCTION @s@.games_guard(p_action text,p_payload jsonb,actor jsonb) RETURNS void LANGUAGE plpgsql SET search_path=public,@s@,pg_temp AS $body$
 #variable_conflict use_column
 DECLARE q @s@.quests; e @s@.entries; school bigint; wins int;
 BEGIN
 IF p_action='quest_create' THEN RAISE EXCEPTION 'Use Games planning to create and approve new challenges';
 ELSIF p_action='submit' AND (p_payload->>'quest')::int>0 THEN
  SELECT * INTO q FROM @s@.quests WHERE id=(p_payload->>'quest')::int;
  IF q.wave_id IS NULL THEN
   IF EXISTS(SELECT 1 FROM @s@.game_cycles WHERE state IN('active','archived')) THEN RAISE EXCEPTION 'This historical competition is closed';END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM @s@.game_waves w JOIN @s@.game_cycles c ON c.id=w.cycle_id WHERE w.id=q.wave_id AND w.state='released' AND c.state='active') THEN RAISE EXCEPTION 'This competition is closed or has not released';END IF;
 ELSIF p_action IN('quest','reward') THEN
  IF p_action='quest' THEN
   SELECT * INTO q FROM @s@.quests WHERE id=(p_payload->>'id')::int;
   IF q.wave_id IS NOT NULL THEN RAISE EXCEPTION 'Edit scheduled challenges in Games planning';END IF;
  END IF;
 ELSIF p_action='review' THEN
  IF coalesce((actor->>'admin')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Supervisor authorization required';END IF;
  SELECT * INTO e FROM @s@.entries WHERE id=(p_payload->>'id')::uuid;
  SELECT * INTO q FROM @s@.quests WHERE id=e.quest;
  IF q.wave_id IS NOT NULL AND p_payload->>'state'='approved' AND NOT EXISTS(SELECT 1 FROM @s@.game_wave_wins WHERE entry_id=e.id) THEN
   IF NOT EXISTS(SELECT 1 FROM @s@.game_cycles WHERE id=q.cycle_id AND state='active') THEN RAISE EXCEPTION 'This competition is closed';END IF;
   SELECT count(*) INTO wins FROM @s@.game_wave_wins WHERE wave_id=q.wave_id AND location_id=e.location_id;
   IF wins>=2 THEN RAISE EXCEPTION 'This school has reached its two-win limit for this wave. Its submission remains available for review without another winning award.';END IF;
  ELSIF q.wave_id IS NULL AND e.quest>0 AND p_payload->>'state'='approved' AND NOT EXISTS(SELECT 1 FROM @s@.quest_claims WHERE entry=e.id) AND EXISTS(SELECT 1 FROM @s@.game_cycles WHERE state IN('active','archived')) THEN RAISE EXCEPTION 'This historical competition is closed';END IF;
 END IF;
 END $body$;
 REVOKE ALL ON FUNCTION @s@.games_guard(text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
 $ddl$,'@s@',ns);
 SELECT pg_get_functiondef(to_regprocedure('public.october_games_'||env||'(text,text,text,jsonb)')) INTO definition;
 definition:=replace(definition,'result:='||ns||'.games_legacy(p_action,p_token,p_pin,p_payload);',replace($injection$
  PERFORM @s@.games_guard(p_action,p_payload,actor);
  result:=@s@.games_legacy(p_action,p_token,p_pin,p_payload);
  IF p_action='review' AND p_payload->>'state'='approved' THEN
   INSERT INTO @s@.game_wave_wins(wave_id,location_id,entry_id,quest_id)
   SELECT q.wave_id,e.location_id,e.id,q.id FROM @s@.entries e JOIN @s@.quests q ON q.id=e.quest
   JOIN @s@.quest_claims claim ON claim.entry=e.id WHERE e.id=(p_payload->>'id')::uuid AND q.wave_id IS NOT NULL ON CONFLICT(entry_id) DO NOTHING;
  END IF;
  -- Keep completed historical quests, but hide unreleased and closed unfinished challenges from managers.
  IF coalesce((actor->>'admin')::boolean,false) IS NOT TRUE THEN
   result:=jsonb_set(result,'{quests}',(SELECT coalesce(jsonb_agg(item),'[]') FROM jsonb_array_elements(result->'quests')item
    WHERE item->>'first_school' IS NOT NULL OR
      (item->>'wave_id' IS NULL AND NOT EXISTS(SELECT 1 FROM @s@.game_cycles WHERE state IN('active','archived'))) OR
      EXISTS(SELECT 1 FROM @s@.game_waves w JOIN @s@.game_cycles c ON c.id=w.cycle_id WHERE w.id=(item->>'wave_id')::uuid AND w.state='released' AND c.state='active')));
  END IF;
  result:=result||jsonb_build_object(
   'game_cycles',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY month),'[]') FROM @s@.game_cycles c),
   'game_waves',(SELECT coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('approved_count',(SELECT count(*) FROM @s@.game_drafts WHERE wave_id=w.id AND state='approved')) ORDER BY release_at),'[]') FROM @s@.game_waves w),
   'game_wave_wins',(SELECT coalesce(jsonb_agg(jsonb_build_object('wave_id',wave_id,'location_id',location_id,'wins',n)),'[]') FROM (SELECT wave_id,location_id,count(*) n FROM @s@.game_wave_wins GROUP BY wave_id,location_id) counts),
   'game_next_missing',NOT EXISTS(SELECT 1 FROM @s@.game_cycles c JOIN @s@.game_drafts d ON d.cycle_id=c.id WHERE c.month>coalesce((SELECT max(month) FROM @s@.game_cycles WHERE state='active'),date_trunc('month',now() AT TIME ZONE 'America/Los_Angeles')::date) AND d.state='approved'));
 $injection$,'@s@',ns));
 IF position('games_guard' IN definition)=0 THEN RAISE EXCEPTION 'Planning wrapper does not match. Stop deployment.';END IF;
 EXECUTE definition;
 EXECUTE format('REVOKE ALL ON FUNCTION public.october_games_%s(text,text,text,jsonb) FROM PUBLIC,anon,authenticated',env);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.october_games_%s(text,text,text,jsonb) TO service_role',env);
END LOOP;
END $install$;
-- No browser activity is required. Server-side catch-up is idempotent and uses stored LA-derived timestamps.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('spark-games-weekly-releases','* * * * *','SELECT october_live.games_reconcile();');
NOTIFY pgrst,'reload schema';
COMMIT;
