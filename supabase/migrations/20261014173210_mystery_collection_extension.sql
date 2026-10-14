BEGIN;
SET LOCAL lock_timeout='5s';
DO $install$
DECLARE env text; ns text; definition text; original text; old_rounds jsonb; after_rounds jsonb;
BEGIN
FOREACH env IN ARRAY ARRAY['dev','live'] LOOP
 ns:='october_'||env;
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),''[]'') FROM %I.rounds r',ns) INTO old_rounds;
 EXECUTE format('ALTER TABLE %I.mystery_drafts DROP CONSTRAINT mystery_drafts_piece_count_check, ADD CONSTRAINT mystery_drafts_piece_count_check CHECK(piece_count BETWEEN 2 AND 48)',ns);
 SELECT pg_get_functiondef(to_regprocedure(ns||'.selection_legacy(text,text,text,jsonb)')) INTO definition;original:=definition;
 EXECUTE format('INSERT INTO %I.monthly_engine_backup(signature,definition) VALUES($1,$2)',ns) USING 'extension:selection_legacy',original;
 definition:=replace(definition,'ARRAY[12,14,16,18,20,22,24,25,28,28]','ARRAY[32,32,32,36,36,40,40,44,48,48]');
 definition:=replace(definition,'IF c.id IS NULL OR c.state<>''draft'' THEN','IF c.id IS NULL OR (c.state<>''draft'' AND NOT (c.state=''active'' AND p_action IN(''collection_round'',''collection_move'',''collection_append''))) THEN');
 definition:=replace(definition,'IF d.id IS NULL OR d.revision IS DISTINCT FROM', 'IF EXISTS(SELECT 1 FROM '||ns||'.rounds WHERE collection_id=c.id AND position=d.position) THEN RAISE EXCEPTION ''Activated mysteries cannot be edited'';END IF; IF d.id IS NULL OR d.revision IS DISTINCT FROM');
 definition:=replace(definition,'SET CONSTRAINTS ALL DEFERRED;', 'IF NOT EXISTS(SELECT 1 FROM '||ns||'.mystery_drafts WHERE collection_id=c.id AND position=target_position) OR EXISTS(SELECT 1 FROM '||ns||'.rounds WHERE collection_id=c.id AND position=target_position) THEN RAISE EXCEPTION ''Cannot move across an activated mystery'';END IF; SET CONSTRAINTS ALL DEFERRED;');
 definition:=replace(definition,'ELSIF p_action=''collection_activate'' THEN',replace($append$
   ELSIF p_action='collection_append' THEN
    IF c.state<>'active' OR (p_payload->>'confirmed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Confirm adding mysteries to the active collection';END IF;
    SELECT count(*) INTO ready FROM @s@.mystery_drafts md WHERE md.collection_id=c.id AND NOT EXISTS(SELECT 1 FROM @s@.rounds r WHERE r.collection_id=c.id AND r.position=md.position);
    IF ready=0 THEN RAISE EXCEPTION 'No additional mysteries to activate';END IF;
    IF EXISTS(SELECT 1 FROM @s@.mystery_drafts md WHERE md.collection_id=c.id AND NOT EXISTS(SELECT 1 FROM @s@.rounds r WHERE r.collection_id=c.id AND r.position=md.position) AND (md.photo_path IS NULL OR trim(md.answer)='' OR jsonb_array_length(md.pieces)<>md.piece_count OR cardinality(md.piece_costs)<>md.piece_count)) THEN RAISE EXCEPTION 'Finish all additional mysteries before activating';END IF;
    SELECT coalesce(max(id),0) INTO next_id FROM @s@.rounds;
    FOR row IN SELECT md.* FROM @s@.mystery_drafts md WHERE md.collection_id=c.id AND NOT EXISTS(SELECT 1 FROM @s@.rounds r WHERE r.collection_id=c.id AND r.position=md.position) ORDER BY md.position LOOP
     next_id:=next_id+1;
     INSERT INTO @s@.rounds(id,photo_path,answer,aliases,pieces,piece_costs,reward_points,collection_id,position,revealed_indices) VALUES(next_id,row.photo_path,row.answer,row.aliases,row.pieces,row.piece_costs,row.reward_points,c.id,row.position,'{}');
    END LOOP;
    UPDATE @s@.mystery_collections SET revision=revision+1 WHERE id=c.id;
    UPDATE @s@.settings SET mystery_state='active' WHERE id;
   ELSIF p_action='collection_activate' THEN
$append$,'@s@',ns));
 IF definition=original OR position('Finish all additional mysteries' IN definition)=0 OR position('ARRAY[12,14' IN definition)>0 THEN RAISE EXCEPTION 'Unexpected collection engine';END IF;
 EXECUTE definition;
 SELECT pg_get_functiondef(to_regprocedure(ns||'.lock_monthly_mystery()')) INTO definition;original:=definition;
 EXECUTE format('INSERT INTO %I.monthly_engine_backup(signature,definition) VALUES($1,$2)',ns) USING 'extension:lock_monthly_mystery',original;
 definition:=replace(definition,'IF EXISTS(', 'IF (OLD.revealed_indices IS NOT NULL OR EXISTS(');
 definition:=replace(definition,'AND NOT legacy) AND (','AND NOT legacy)) AND (');
 IF definition=original THEN RAISE EXCEPTION 'Unexpected layout lock';END IF;EXECUTE definition;
 -- Requested October extension: five blank drafts, never overwrite an existing photo or draft.
 EXECUTE format('INSERT INTO %I.mystery_drafts(collection_id,position,piece_count,reward_points,difficulty) SELECT c.id,n,(ARRAY[32,36,40,44,48])[n-5],(ARRAY[35,40,45,50,60])[n-5],3 FROM %I.mystery_collections c CROSS JOIN generate_series(6,10)n WHERE c.month=DATE ''2026-10-01'' AND c.state=''active'' AND NOT EXISTS(SELECT 1 FROM %I.rounds r WHERE r.collection_id=c.id AND r.position=n) AND NOT EXISTS(SELECT 1 FROM %I.mystery_drafts d WHERE d.collection_id=c.id AND d.position=n)',ns,ns,ns,ns);
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),''[]'') FROM %I.rounds r',ns) INTO after_rounds;
 IF old_rounds IS DISTINCT FROM after_rounds THEN RAISE EXCEPTION 'Historical round preservation failed';END IF;
END LOOP;
END $install$;
NOTIFY pgrst,'reload schema';
COMMIT;
