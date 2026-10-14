BEGIN;
DO $install$
DECLARE env text; ns text; definition text;
BEGIN
FOREACH env IN ARRAY ARRAY['dev','live'] LOOP
ns:='october_'||env;
EXECUTE replace($ddl$
 CREATE TABLE @s@.game_photo_reveals(employee_id text NOT NULL,quest_id int NOT NULL REFERENCES @s@.quests(id),revealed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(employee_id,quest_id));
 ALTER TABLE @s@.game_photo_reveals ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON @s@.game_photo_reveals FROM PUBLIC,anon,authenticated;
 $ddl$,'@s@',ns);
 SELECT pg_get_functiondef(to_regprocedure('public.october_games_'||env||'(text,text,text,jsonb)')) INTO definition;
 definition:=replace(definition,'IF p_action LIKE ''games_%'' THEN',replace($mark$
 IF p_action='games_revealed' THEN
  IF coalesce((actor->>'admin')::boolean,false) THEN RAISE EXCEPTION 'Use a manager session for reveal tracking';END IF;
  IF jsonb_typeof(p_payload->'quests')<>'array' OR jsonb_array_length(p_payload->'quests') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Select completed quests';END IF;
  INSERT INTO @s@.game_photo_reveals(employee_id,quest_id)
  SELECT (public.require_supper_monitoring_session(p_token)).employee_id::text,q.id FROM @s@.quests q JOIN @s@.quest_claims claim ON claim.quest=q.id JOIN @s@.entries e ON e.id=claim.entry
  WHERE q.id IN(SELECT value::int FROM jsonb_array_elements_text(p_payload->'quests')) AND e.state='approved' AND e.photo_path IS NOT NULL
  AND (public.require_supper_monitoring_session(p_token)).employee_id IS NOT NULL ON CONFLICT DO NOTHING;
  p_action:='list';
 END IF;
 IF p_action LIKE 'games_%' THEN
 $mark$,'@s@',ns));
 definition:=replace(definition,'RETURN result;',replace($state$
 IF coalesce((actor->>'admin')::boolean,false) IS NOT TRUE THEN
  result:=result||jsonb_build_object('games_revealed',(SELECT coalesce(jsonb_agg(quest_id),'[]') FROM @s@.game_photo_reveals WHERE employee_id=(public.require_supper_monitoring_session(p_token)).employee_id::text));
 END IF;
 RETURN result;
 $state$,'@s@',ns));
 EXECUTE definition;
 EXECUTE format('REVOKE ALL ON FUNCTION public.october_games_%s(text,text,text,jsonb) FROM PUBLIC,anon,authenticated',env);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.october_games_%s(text,text,text,jsonb) TO service_role',env);
END LOOP;
END $install$;
NOTIFY pgrst,'reload schema';
COMMIT;
