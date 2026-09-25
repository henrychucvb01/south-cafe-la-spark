begin;

-- Atomically replace the current PDF and its transformed markup. No version archive.
-- The API rotates the stored PDF, never accepting replacement PDF bytes from a reviewer.
create function public.save_monitoring_rotated_review(
 p_token text,p_id uuid,p_revision integer,p_document_version integer,
 p_page_count integer,p_annotations jsonb,p_comment text,p_action text,
 p_pdf_base64 text,p_pdf_sha256 text
) returns public.monitoring_records language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;m public.monitoring_records;v integer;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'supervisor' then raise exception 'Supervisor authorization required.'; end if;
 select * into m from public.monitoring_records where id=p_id and location_id=s.location_id for update;
 if m.id is null then raise exception 'Monitoring not found for this school.'; end if;
 if m.revision is distinct from p_revision or m.document_version is distinct from p_document_version then raise exception 'PDF or monitoring revision changed. Reopen before reviewing.'; end if;
 if m.locked or m.status not in ('submitted','corrections_requested') or m.document_version=0 then raise exception 'This PDF review is read-only. Unlock the monitoring before changing it.'; end if;
 v:=public.supper_store_pdf(p_id,p_pdf_base64,p_pdf_sha256);
 -- Existing review validation, comments, state transitions and authorization apply.
 -- Any failure rolls back both the PDF and the review in this transaction.
 return public.save_supper_pdf_review(p_token,p_id,p_revision,v,p_page_count,p_annotations,p_comment,p_action);
end $$;
revoke all on function public.save_monitoring_rotated_review(text,uuid,integer,integer,integer,jsonb,text,text,text,text) from public,anon,authenticated;
grant execute on function public.save_monitoring_rotated_review(text,uuid,integer,integer,integer,jsonb,text,text,text,text) to service_role;

commit;
