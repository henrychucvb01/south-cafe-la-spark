BEGIN;
CREATE FUNCTION pg_temp.check_it(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message;END IF;END$$;
DO $$DECLARE admin_token text; token text; c uuid; rev int; d october_live.mystery_drafts; result jsonb; before_rows jsonb; i int;
BEGIN
 PERFORM pg_temp.check_it(current_database()='spark_mystery_extension_tests' AND inet_server_port()=55432,'isolated test database');
 DELETE FROM spark_private.login_limits;UPDATE employees SET active=true WHERE id=900001;
 admin_token:=spark_login(p_role=>'supervisor',p_pin=>'1618');
 token:=open_supper_monitoring_session(900001,900001,spark_login(p_role=>'employee',p_employee_id=>900001,p_pin=>'3141'),null);
 SELECT id,revision INTO c,rev FROM october_live.mystery_collections WHERE state='active';
 INSERT INTO october_live.rounds(id,collection_id,position,answer,pieces,piece_costs,reward_points,solved_at,winner) SELECT n,c,n,'original',jsonb_build_array(jsonb_build_array(jsonb_build_array(0,0),jsonb_build_array(1000,0),jsonb_build_array(0,1000))),ARRAY[1],25,now(),900001 FROM generate_series(1,5)n;
 SELECT jsonb_agg(to_jsonb(r) ORDER BY id) INTO before_rows FROM october_live.rounds r;
 PERFORM pg_temp.check_it((SELECT count(*)=5 AND min(piece_count)=32 AND max(piece_count)=48 FROM october_live.mystery_drafts WHERE collection_id=c),'five blank October slots 32 to 48');
 BEGIN PERFORM october_games_live('collection_append',null,admin_token,jsonb_build_object('collection_id',c,'collection_revision',rev,'confirmed',true));RAISE EXCEPTION 'FAIL incomplete accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Finish all additional%' THEN RAISE;END IF;END;
 BEGIN PERFORM october_games_live('collection_append',token,null,jsonb_build_object('collection_id',c,'collection_revision',rev,'confirmed',true));RAISE EXCEPTION 'FAIL manager accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Supervisor authorization%' THEN RAISE;END IF;END;
 FOR d IN SELECT * FROM october_live.mystery_drafts WHERE collection_id=c ORDER BY position LOOP
  result:=october_games_live('collection_round',null,admin_token,jsonb_build_object('collection_id',c,'collection_revision',rev,'id',d.id,'revision',d.revision,'answer','answer','question','What is this object?','aliases','[]'::jsonb,'reward_points',d.reward_points,'piece_count',d.piece_count,'difficulty',3,'layout_seed',123,'pieces',(SELECT jsonb_agg('[[0,0],[1000,0],[0,1000]]'::jsonb) FROM generate_series(1,d.piece_count)),'piece_costs',array_fill(1,ARRAY[d.piece_count]),'photo_path',gen_random_uuid()||'/'||gen_random_uuid()||'.webp'));
  rev:=rev+1;
 END LOOP;
 SELECT * INTO d FROM october_live.mystery_drafts WHERE collection_id=c AND position=6;
 BEGIN PERFORM october_games_live('collection_move',null,admin_token,jsonb_build_object('collection_id',c,'collection_revision',rev,'id',d.id,'revision',d.revision,'direction',-1));RAISE EXCEPTION 'FAIL moved into original';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Cannot move across%' THEN RAISE;END IF;END;
 BEGIN PERFORM october_games_live('collection_append',null,admin_token,jsonb_build_object('collection_id',c,'collection_revision',rev));RAISE EXCEPTION 'FAIL no confirmation';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Confirm adding%' THEN RAISE;END IF;END;
 result:=october_games_live('collection_append',null,admin_token,jsonb_build_object('collection_id',c,'collection_revision',rev,'confirmed',true));
 PERFORM pg_temp.check_it((SELECT question='What is this object?' FROM october_live.rounds WHERE id=6),'question survives activation');
 PERFORM pg_temp.check_it((SELECT count(*)=10 FROM october_live.rounds) AND (result->>'current_round')::int=6,'five appended, first new mystery active');
 PERFORM pg_temp.check_it((SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM october_live.rounds r WHERE id<=5)=before_rows,'original five completely unchanged');
 PERFORM pg_temp.check_it((SELECT count(*)=5 FROM october_live.rounds WHERE id>5 AND revealed_indices='{}'),'appended mysteries use selected pieces');
 BEGIN UPDATE october_live.rounds SET reward_points=99 WHERE id=6;RAISE EXCEPTION 'FAIL published layout mutable';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%permanently locked%' THEN RAISE;END IF;END;
 BEGIN PERFORM october_games_live('collection_append',null,admin_token,jsonb_build_object('collection_id',c,'collection_revision',rev,'confirmed',true));RAISE EXCEPTION 'FAIL duplicate accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Collection changed%' THEN RAISE;END IF;END;
 BEGIN PERFORM october_games_live('collection_round',null,admin_token,jsonb_build_object('collection_id',c,'collection_revision',rev+1,'id',d.id,'revision',d.revision));RAISE EXCEPTION 'FAIL published draft mutable';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Activated mysteries cannot%' THEN RAISE;END IF;END;
 BEGIN UPDATE october_live.mystery_drafts SET piece_count=49 WHERE id=d.id;RAISE EXCEPTION 'FAIL 49 pieces allowed';EXCEPTION WHEN check_violation THEN NULL;END;
 FOR i IN 6..10 LOOP
  PERFORM pg_temp.check_it(october_live.current_mystery()=i,'sequential progression');
  UPDATE october_live.rounds SET solved_at=now(),winner=900001 WHERE id=i;
 END LOOP;
 PERFORM pg_temp.check_it(october_live.current_mystery() IS NULL,'collection finishes after tenth');
 RAISE NOTICE 'PASS extension: five slots, 48 cap, draft edits, authorization, confirmation, original preservation, selectable pieces, locks, repeat protection and progression';
END$$;
ROLLBACK;
