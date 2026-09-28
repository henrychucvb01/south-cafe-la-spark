begin;
-- Clear review comments without unlocking or changing the final document.
create function public.clear_monitoring_review_comments(p_token text,p_id uuid,p_revision integer)
returns public.monitoring_records language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;m public.monitoring_records;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'supervisor' then raise exception 'Supervisor authorization required.';end if;
 select * into m from public.monitoring_records where id=p_id and location_id=s.location_id for update;
 if m.id is null then raise exception 'Monitoring not found for this school.';end if;
 if m.revision is distinct from p_revision then raise exception 'Monitoring revision changed. Reopen before continuing.';end if;
 if m.status not in ('submitted','corrections_requested','accepted','completed') then raise exception 'This monitoring is not ready for review.';end if;
 update public.monitoring_pdf_review r set comments='',annotations=coalesce((select jsonb_agg(a.value order by a.ordinality) from jsonb_array_elements(r.annotations) with ordinality a where a.value->>'type' is distinct from 'comment'),'[]'::jsonb),record_revision=m.revision+1 where r.monitoring_id=m.id;
 update public.monitoring_records set review_comments='',revision=revision+1,updated_at=now() where id=m.id returning * into m;
 return m;
end $$;
revoke all on function public.clear_monitoring_review_comments(text,uuid,integer) from public;
grant execute on function public.clear_monitoring_review_comments(text,uuid,integer) to anon,authenticated,service_role;
commit;
