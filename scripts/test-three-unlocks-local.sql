BEGIN;
DO $$
DECLARE admin_token text; first_entry uuid:=gen_random_uuid(); queued_entry uuid:=gen_random_uuid(); old_entry uuid:=gen_random_uuid(); result jsonb; revision int; credits int;
BEGIN
 IF current_database()<>'spark_security' OR inet_server_port()<>55432 THEN RAISE EXCEPTION 'Local fixture required';END IF;
 DELETE FROM spark_private.login_limits;admin_token:=spark_login(p_role=>'supervisor',p_pin=>'1618');
 INSERT INTO october_live.settings(id) VALUES(true) ON CONFLICT DO NOTHING;
 INSERT INTO october_live.rounds(id) SELECT generate_series(1,5) ON CONFLICT DO NOTHING;
 DELETE FROM october_live.unlocks;
 UPDATE october_live.settings SET mystery_state='active',quests_state='active';
 UPDATE october_live.rounds SET solved_at=null,photo_path='synthetic.webp',answer='synthetic',pieces=(SELECT jsonb_agg('[[0,0],[1000,0],[0,1000]]'::jsonb) FROM generate_series(1,32)),piece_costs=array_fill(1,ARRAY[32]),unlock_credits=5,unlocked=5;
 INSERT INTO october_live.quests(id,name,description) VALUES(999101,'Synthetic quest A','Test'),(999102,'Synthetic quest B','Test'),(999103,'Previously approved quest','Test');
 INSERT INTO october_live.entries(id,location_id,quest,photo_path,consent) VALUES(first_entry,900001,999101,'test.webp',true),(queued_entry,900001,999102,'test.webp',true),(old_entry,900001,999103,'test.webp',true);
 result:=october_games_live('review',null,admin_token,jsonb_build_object('id',first_entry,'revision',1,'state','approved'));
 SELECT unlock_credits INTO credits FROM october_live.rounds WHERE id=1;
 IF credits<>8 OR (SELECT pieces FROM october_live.unlocks WHERE entry=first_entry)<>3 THEN RAISE EXCEPTION 'New approval must add exactly three credits';END IF;
 PERFORM october_games_live('review',null,admin_token,jsonb_build_object('id',first_entry,'revision',2,'state','approved'));
 IF (SELECT unlock_credits FROM october_live.rounds WHERE id=1)<>8 THEN RAISE EXCEPTION 'Reapproval duplicated credits';END IF;
 UPDATE october_live.settings SET mystery_state='paused';
 PERFORM october_games_live('review',null,admin_token,jsonb_build_object('id',queued_entry,'revision',1,'state','approved'));
 IF (SELECT unlock_credits FROM october_live.rounds WHERE id=1)<>8 OR (SELECT pieces FROM october_live.unlocks WHERE entry=queued_entry)<>3 THEN RAISE EXCEPTION 'Paused approval should queue three credits';END IF;
 -- A pre-update queued approval retains the old five-credit value.
 UPDATE october_live.entries SET state='approved' WHERE id=old_entry;
 INSERT INTO october_live.unlocks(entry,round,pieces) VALUES(old_entry,null,5);
 SELECT s.revision INTO revision FROM october_live.settings s WHERE id;
 PERFORM october_games_live('settings',null,admin_token,jsonb_build_object('revision',revision,'game','mystery','state','active'));
 IF (SELECT unlock_credits FROM october_live.rounds WHERE id=1)<>16 THEN RAISE EXCEPTION 'Activation must apply new three and historical five exactly once';END IF;
 PERFORM october_games_live('list',null,admin_token);
 IF (SELECT unlock_credits FROM october_live.rounds WHERE id=1)<>16 THEN RAISE EXCEPTION 'Refresh duplicated queued credits';END IF;
END$$;
ROLLBACK;
SELECT 'PASS three-credit approvals, reapproval protection, paused approvals, historical five-credit queue and refresh idempotency; all fixture writes rolled back.';
