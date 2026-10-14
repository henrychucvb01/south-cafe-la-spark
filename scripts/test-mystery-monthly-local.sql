BEGIN;
CREATE FUNCTION pg_temp.check_it(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message;END IF;END$$;
DO $$
DECLARE admin_token text; token text; result jsonb; collection uuid; c october_live.mystery_collections; d october_live.mystery_drafts; original jsonb; bank bigint; round_id int; i int; month_text text:=to_char(now() AT TIME ZONE 'America/Los_Angeles','YYYY-MM'); request uuid;
BEGIN
 PERFORM pg_temp.check_it(current_database() IN ('spark_mystery_monthly_tests','spark_mystery_monthly_verify','spark_mystery_monthly_release') AND inet_server_port()=55432,'isolated database');
 DELETE FROM spark_private.login_limits;UPDATE employees SET active=true WHERE id=900001;
 admin_token:=spark_login(p_role=>'supervisor',p_pin=>'1618');
 token:=open_supper_monitoring_session(900001,900001,spark_login(p_role=>'employee',p_employee_id=>900001,p_pin=>'3141'),null);
 INSERT INTO october_live.schools VALUES(900001,true) ON CONFLICT(location_id) DO UPDATE SET participating=true;
 INSERT INTO october_live.rounds(id,collection_id,position,photo_path,answer,pieces,piece_costs,unlocked,unlock_credits,solved_at,winner)
 SELECT n,(SELECT id FROM october_live.mystery_collections WHERE legacy),n,'legacy-fixture.webp','legacy answer','[[[0,0],[1000,0],[0,1000]],[[1000,0],[1000,1000],[0,1000]]]'::jsonb,ARRAY[1,3],1,1,now(),900001 FROM generate_series(1,5)n ON CONFLICT DO NOTHING;
 SELECT jsonb_agg(to_jsonb(r) ORDER BY id) INTO original FROM october_live.rounds r;
 PERFORM pg_temp.check_it(jsonb_array_length(original)=5,'five existing historical mysteries in fixture');
 INSERT INTO october_live.unlock_credit_events(location_id,kind,credits,price,service_date,request_id) VALUES(900001,'purchase',5,20,current_date,gen_random_uuid());
 SELECT coalesce(sum(credits),0) INTO bank FROM october_live.unlock_credit_events WHERE location_id=900001;
 UPDATE october_live.mystery_collections SET month=date_trunc('month',now() AT TIME ZONE 'America/Los_Angeles')::date-interval '1 month' WHERE state='active';
 BEGIN PERFORM public.october_games_live('collection_create',token,null,jsonb_build_object('month',month_text));RAISE EXCEPTION 'FAIL: manager modified collections';EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE;END IF;END;
 result:=public.october_games_live('collection_create',null,admin_token,jsonb_build_object('month',month_text));
 SELECT id INTO collection FROM october_live.mystery_collections WHERE state='draft' AND month=(month_text||'-01')::date;
 PERFORM pg_temp.check_it(collection IS NOT NULL,'draft created');
 PERFORM pg_temp.check_it((SELECT count(*)=10 FROM october_live.mystery_drafts WHERE collection_id=collection),'ten draft slots');
 PERFORM pg_temp.check_it((SELECT jsonb_agg(to_jsonb(r) ORDER BY id)=original FROM october_live.rounds r),'creating draft leaves live mysteries unchanged');
 FOR i IN 1..10 LOOP
  SELECT * INTO c FROM october_live.mystery_collections WHERE id=collection;SELECT * INTO d FROM october_live.mystery_drafts WHERE collection_id=collection AND position=i;
  result:=public.october_games_live('collection_round',null,admin_token,jsonb_build_object('collection_id',collection,'collection_revision',c.revision,'id',d.id,'revision',d.revision,'answer','monthly answer '||i,'aliases','[]'::jsonb,'reward_points',10+i,'piece_count',2,'difficulty',1,'pieces','[[[0,0],[1000,0],[0,1000]],[[1000,0],[1000,1000],[0,1000]]]'::jsonb,'piece_costs','[1,2]'::jsonb,'photo_path','00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.webp'));
 END LOOP;
 SELECT * INTO c FROM october_live.mystery_collections WHERE id=collection;
 BEGIN PERFORM public.october_games_live('collection_activate',null,admin_token,jsonb_build_object('collection_id',collection,'collection_revision',c.revision));RAISE EXCEPTION 'FAIL: missing confirmation accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE;END IF;END;
 result:=public.october_games_live('collection_activate',null,admin_token,jsonb_build_object('collection_id',collection,'collection_revision',c.revision,'confirmed',true));
 PERFORM pg_temp.check_it((SELECT count(*)=10 FROM october_live.rounds WHERE collection_id=collection),'all ten finalized');
 PERFORM pg_temp.check_it((SELECT jsonb_agg(to_jsonb(r) ORDER BY id)=original FROM october_live.rounds r WHERE collection_id<>collection),'historical records preserved');
 PERFORM pg_temp.check_it((SELECT coalesce(sum(credits),0)=bank FROM october_live.unlock_credit_events WHERE location_id=900001),'credit balance carried forward');
 round_id:=(result->>'current_round')::int;
 PERFORM pg_temp.check_it((SELECT position=1 FROM october_live.rounds WHERE id=round_id),'first mystery active');
 BEGIN UPDATE october_live.rounds SET reward_points=999 WHERE id=round_id;RAISE EXCEPTION 'FAIL: live reward changed';EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE;END IF;END;
 FOR i IN 1..10 LOOP
  round_id:=october_live.current_mystery();PERFORM pg_temp.check_it((SELECT position=i FROM october_live.rounds WHERE id=round_id),'sequential progression');
  PERFORM october_live.solve_mystery(round_id,900001);
 END LOOP;
 PERFORM pg_temp.check_it(october_live.current_mystery() IS NULL,'collection completes');
 result:=public.october_games_live('list',token,null,'{}');
 PERFORM pg_temp.check_it(jsonb_array_length(result->'mystery_drafts')=0,'manager cannot read drafts or answers');
 PERFORM pg_temp.check_it((SELECT count(*)=10 FROM october_live.rounds WHERE collection_id=collection AND winner=900001),'winners preserved');
 RAISE NOTICE 'PASS monthly drafts, activation confirmation, ten sequential mysteries, historical preservation, locked layouts, authorization, credit carry-forward';
END$$;
ROLLBACK;
