begin;
create or replace function public.submit_supper_monitoring(p_token text, p_id uuid, p_revision integer)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  raise exception 'Submit through the secure report service.';
end $$;
-- Private PDF bytes and the completed record commit in one transaction. No
-- public bucket, client upload, or orphaned PDF can bypass server validation.
create table public.supper_monitoring_documents (
  monitoring_id uuid primary key references public.supper_monitorings(id),
  pdf_bytes bytea not null check (octet_length(pdf_bytes) between 100 and 2097152),
  sha256 text not null,
  created_at timestamptz not null default now()
);
alter table public.supper_monitoring_documents enable row level security;
revoke all on public.supper_monitoring_documents from public, anon, authenticated;

create function public.finalize_supper_monitoring(p_token text, p_id uuid, p_revision integer, p_template_version text, p_pdf_base64 text, p_pdf_sha256 text)
returns public.supper_monitorings language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.supper_monitoring_sessions; v_record public.supper_monitorings; v_pdf bytea;
begin
  v_session := public.require_supper_monitoring_session(p_token);
  select * into v_record from public.supper_monitorings where id=p_id and location_id=v_session.location_id for update;
  if v_record.id is null then raise exception 'Monitoring not found for this school.'; end if;
  if v_record.status='completed' then return v_record; end if;
  if p_revision is null or v_record.revision<>p_revision then raise exception 'Draft revision changed. Reopen before submitting.'; end if;
  if p_template_version is distinct from 'lausd-supper-2022-09-08' then raise exception 'Unverified report template.'; end if;
  if p_pdf_base64 is null or length(p_pdf_base64)>2800000 then raise exception 'Report size is unsupported.'; end if;
  v_pdf := decode(p_pdf_base64,'base64');
  if substring(v_pdf from 1 for 5)<>convert_to('%PDF-','UTF8') or encode(sha256(v_pdf),'hex') is distinct from p_pdf_sha256 then raise exception 'PDF integrity check failed.'; end if;
  insert into public.supper_monitoring_documents(monitoring_id,pdf_bytes,sha256) values(p_id,v_pdf,p_pdf_sha256);
  update public.supper_monitorings set status='completed',submitted_at=now(),updated_at=now(),revision=revision+1,
    template_version=p_template_version,pdf_storage_path='db:supper_monitoring_documents/'||p_id::text,pdf_sha256=p_pdf_sha256,current_section=8
    where id=p_id returning * into v_record;
  return v_record;
end $$;

create function public.read_supper_monitoring_pdf(p_token text, p_id uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_record public.supper_monitorings; v_pdf bytea;
begin
  v_record := public.get_supper_monitoring(p_token,p_id);
  if v_record.status<>'completed' then raise exception 'This monitoring has not been submitted.'; end if;
  select pdf_bytes into v_pdf from public.supper_monitoring_documents where monitoring_id=p_id;
  if v_pdf is null then raise exception 'Stored report is unavailable.'; end if;
  return encode(v_pdf,'base64');
end $$;

-- Only the application server can call these after validating the saved data,
-- signature content hashes and official PDF layout. Anonymous clients cannot.
revoke all on function public.finalize_supper_monitoring(text,uuid,integer,text,text,text), public.read_supper_monitoring_pdf(text,uuid) from public, anon, authenticated;
grant execute on function public.finalize_supper_monitoring(text,uuid,integer,text,text,text), public.read_supper_monitoring_pdf(text,uuid) to service_role;
grant execute on function public.get_supper_monitoring(text,uuid) to service_role;
commit;
