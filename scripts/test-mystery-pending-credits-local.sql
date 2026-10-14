BEGIN;
DO $$DECLARE entry_id uuid; token text; result jsonb; BEGIN
 IF current_database()<>'spark_mystery_monthly_release' OR inet_server_port()<>55432 THEN RAISE EXCEPTION 'Isolated fixture required';END IF;
 INSERT INTO october_live.quests(id,name,description) VALUES(90002,'Historical queued credit fixture','test');
 INSERT INTO october_live.entries(location_id,quest,photo_path,consent,state) VALUES(900001,90002,'fixture.webp',true,'approved') RETURNING id INTO entry_id;
 INSERT INTO october_live.unlocks(entry,round,pieces) VALUES(entry_id,null,5);
 token:=open_supper_monitoring_session(900001,900001,spark_login(p_role=>'employee',p_employee_id=>900001,p_pin=>'3141'),null);
 PERFORM october_games_live('list',token);PERFORM october_games_live('list',token);
 IF NOT EXISTS(SELECT 1 FROM october_live.unlock_credit_events WHERE quest_entry=entry_id AND credits=5) OR NOT EXISTS(SELECT 1 FROM october_live.unlocks WHERE entry=entry_id AND pieces=5 AND banked) THEN RAISE EXCEPTION 'Historical queued credits changed';END IF;
 IF (SELECT count(*) FROM october_live.unlock_credit_events WHERE quest_entry=entry_id)<>1 THEN RAISE EXCEPTION 'Historical queued credits duplicated';END IF;
 RAISE NOTICE 'PASS historical five-credit award retains its original quantity and is banked once';
END$$;
ROLLBACK;
