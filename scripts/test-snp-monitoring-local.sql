-- Run only against the isolated loopback spark_security database. Everything rolls back.
begin;
do $$ begin if current_database()<>'spark_security' or inet_server_addr()<>'127.0.0.1'::inet then raise exception 'Local test database required'; end if; end $$;
insert into public.locations(id,location_code,school_name,active) values
 (990001,'9901','Dolores El',true),(990002,'9902','Wilmington Park El',true),(990003,'9903','Banning HS',true),(990004,'9904','Carson HS',true);
insert into public.employees(id,location_id,employee_name,active,manager_pin_hash) values(990001,990001,'SNP Synthetic Manager',true,extensions.crypt('3141',extensions.gen_salt('bf')));
do $$ declare login text; t text; begin
 login:=public.spark_login(p_role=>'supervisor',p_pin=>'1618');
 if login is null then raise exception 'Local supervisor fixture unavailable'; end if;
 perform set_config('snp.test.supervisor',public.open_supper_supervisor_session(990001,login),true);
 perform set_config('snp.test.supervisor2',public.open_supper_supervisor_session(990002,login),true);
 perform set_config('snp.test.supervisor3',public.open_supper_supervisor_session(990003,login),true);
 perform set_config('snp.test.supervisor4',public.open_supper_supervisor_session(990004,login),true);
 login:=public.spark_login(p_role=>'employee',p_employee_id=>990001,p_pin=>'3141');
 perform set_config('snp.test.manager',public.open_supper_monitoring_session(990001,990001,login,null),true);
 perform set_config('snp.test.other',public.open_supper_monitoring_session(990002,990001,login,null),true);
 login:=public.spark_login(p_role=>'covering',p_pin=>'2718',p_covering_name=>'SNP Synthetic Cover');
 perform set_config('snp.test.cover',public.open_supper_monitoring_session(990001,null,login,'SNP Synthetic Cover'),true);
end $$;
set local role anon;
do $$ declare t text:=current_setting('snp.test.supervisor'); r jsonb; d jsonb:='{"siteName":"Dolores EEC","visitDate":"2026-10-12","meal":"Breakfast","observations":{"4":{"followup":true}},"additional":[]}'; id uuid:='99000000-0000-4000-8000-000000000001'; begin
 if has_table_privilege('anon','public.snp_records','SELECT') or has_table_privilege('anon','public.snp_documents','SELECT') or has_function_privilege('anon','public.snp_finalize(text,uuid,integer,text,text)','EXECUTE') then raise exception 'Public access is too broad'; end if;
 begin perform public.snp_list('fake'); raise exception 'INVALID TOKEN ACCEPTED'; exception when invalid_authorization_specification then null; end;
 if public.snp_sites(t)->1->>'name'<>'Dolores EEC' then raise exception 'Dolores parent mismatch'; end if;
 if public.snp_sites(current_setting('snp.test.supervisor2'))->1->>'name'<>'Wilmington Park EEC' then raise exception 'Wilmington parent mismatch'; end if;
 if public.snp_sites(current_setting('snp.test.supervisor3'))->1->>'name'<>'Avalon HS' then raise exception 'Avalon parent mismatch'; end if;
 if public.snp_sites(current_setting('snp.test.supervisor4'))->1->>'name'<>'Eagle Tree HS' then raise exception 'Eagle Tree parent mismatch'; end if;
 if public.snp_sites(t)->1->>'staff'<>'SNP Synthetic Manager' then raise exception 'Parent manager missing'; end if;
 r:=public.snp_save(t,id,0,'dolores-eec',d,3);if (r->>'revision')::int<>1 then raise exception 'Create failed';end if;
 if public.snp_list(current_setting('snp.test.manager'))<>'[]'::jsonb then raise exception 'Manager can see drafts';end if;
 if (public.snp_save(t,id,0,'dolores-eec',d,3)->>'revision')::int<>1 then raise exception 'Retry duplicated draft';end if;
 begin perform public.snp_save(current_setting('snp.test.manager'),id,1,'dolores-eec',d,3);raise exception 'MANAGER EDIT ACCEPTED';exception when insufficient_privilege then null;end;
 begin perform public.snp_get(current_setting('snp.test.supervisor2'),id);raise exception 'OTHER SCHOOL ACCEPTED';exception when insufficient_privilege then null;end;
 begin perform public.snp_sites(current_setting('snp.test.other'));raise exception 'UNASSIGNED ACCESS ACCEPTED';exception when insufficient_privilege then null;end;
 r:=public.snp_save(t,id,1,'dolores-eec',d||'{"staff":"Changed"}',3);
 begin perform public.snp_save(t,id,1,'dolores-eec',d||'{"staff":"Stale change"}',3);raise exception 'STALE SAVE ACCEPTED';exception when serialization_failure then null;end;
 if (public.snp_get(t,id)->>'revision')::int<>2 then raise exception 'Failed save changed revision';end if;
end $$;
reset role;
set local role service_role;
do $$ declare t text:=current_setting('snp.test.supervisor'); id uuid:='99000000-0000-4000-8000-000000000001'; r jsonb; begin
 begin perform public.snp_finalize(t,id,1,encode(convert_to('%PDF-test','UTF8'),'base64'),encode(sha256(convert_to('%PDF-test','UTF8')),'hex'));raise exception 'STALE FINAL ACCEPTED';exception when serialization_failure then null;end;
 r:=public.snp_finalize(t,id,2,encode(convert_to('%PDF-test','UTF8'),'base64'),encode(sha256(convert_to('%PDF-test','UTF8')),'hex'));
 if r->>'status'<>'finalized' then raise exception 'Finalization failed';end if;
 if public.snp_finalize(t,id,2,encode(convert_to('%PDF-test','UTF8'),'base64'),encode(sha256(convert_to('%PDF-test','UTF8')),'hex'))->>'revision'<>'3' then raise exception 'Finalization retry duplicated';end if;
end $$;
reset role;
set local role anon;
do $$ declare t text:=current_setting('snp.test.supervisor'); id uuid:='99000000-0000-4000-8000-000000000001'; r jsonb; original jsonb; begin
 r:=public.snp_get(current_setting('snp.test.manager'),id);if r->>'status'<>'finalized' then raise exception 'Assigned manager cannot view final';end if;
 if public.snp_pdf(current_setting('snp.test.cover'),id) is null then raise exception 'Covering manager cannot download';end if;
 original:=r->'payload';
 begin perform public.snp_followup(current_setting('snp.test.manager'),id,3,'4','Invalid manager edit','2026-10-12');raise exception 'MANAGER FOLLOWUP ACCEPTED';exception when insufficient_privilege then null;end;
 r:=public.snp_followup(t,id,3,'4','Observed the corrected procedure','2026-10-12');
 if r->'payload'<>original then raise exception 'Follow-up altered signed original';end if;
 if jsonb_array_length(r->'history')<>4 then raise exception 'Audit events missing';end if;
end $$;
reset role;
set local role anon;
do $$ declare t text:=current_setting('snp.test.supervisor'); id uuid:='99000000-0000-4000-8000-000000000099'; d jsonb:='{"program":"eec-snack","siteName":"Dolores EEC","meal":"Snack"}'; begin
 if jsonb_array_length(public.snack_sites(t))<>1 then raise exception 'Non-EEC site offered';end if;
 perform public.snp_save(t,id,0,'dolores-eec',d,1);
 if jsonb_array_length(public.snack_list(t))<>1 or jsonb_array_length(public.snp_list(t))<>1 then raise exception 'Program histories mixed';end if;
 if public.snack_list(current_setting('snp.test.manager'))<>'[]'::jsonb then raise exception 'Manager sees snack draft';end if;
 begin perform public.snp_save(t,id,1,'dolores-eec',d||'{"program":"snp"}',1);raise exception 'Program switch accepted';exception when raise_exception then if sqlerrm not like '%program cannot change%' then raise;end if;end;
 begin perform public.snack_list('fake');raise exception 'Invalid snack token accepted';exception when invalid_authorization_specification then null;end;
 begin perform public.snp_get(current_setting('snp.test.supervisor2'),id);raise exception 'Other school sees snack';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'SNP isolated database: roster, inheritance, role checks, school isolation, idempotency, stale revisions, atomic finalization, immutable originals, follow-up and audit passed.';
