begin;
-- Isolated side quest. Existing operational tables are never written.
create table public.mystery_access_codes(role text primary key check(role in ('entry','supervisor')),code_hash text not null);
insert into public.mystery_access_codes values
 ('entry',encode(sha256(convert_to('1234','UTF8')),'hex')),
 ('supervisor',encode(sha256(convert_to('0928','UTF8')),'hex'));
create table public.mystery_sessions(token_hash text primary key,role text not null check(role in ('entry','manager','supervisor')),location_id bigint references public.locations(id),expires_at timestamptz not null default now()+interval '12 hours',check((role='manager')=(location_id is not null)));
create table public.mystery_login_attempts(client_key text primary key,attempts int not null,window_start timestamptz not null);
create table public.mystery_balances(location_id bigint primary key references public.locations(id),tokens integer not null default 0 check(tokens between 0 and 1000000),revision integer not null default 1);
create table public.mystery_prizes(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 80),description text not null check(length(description)<=600),icon text not null check(length(icon) between 1 and 24),kind text not null check(kind in ('manual','extra_pull')),active boolean not null default true,inventory integer not null default 0 check(inventory between 0 and 1000000),revision integer not null default 1);
create table public.mystery_wins(id bigint generated always as identity primary key,request_id uuid not null unique,location_id bigint not null references public.locations(id),prize_id uuid not null references public.mystery_prizes(id),prize_name text not null,prize_description text not null,prize_icon text not null,prize_kind text not null,won_at timestamptz not null default now(),token_used integer not null default 1 check(token_used=1),status text not null check(status in ('waiting','received')),fulfilled_at timestamptz,check((status='received')=(fulfilled_at is not null)));
create index mystery_wins_school_idx on public.mystery_wins(location_id,id desc);
create index mystery_wins_waiting_idx on public.mystery_wins(id desc) where status='waiting';
create table public.mystery_admin_changes(request_id uuid primary key,payload jsonb not null,result jsonb not null,changed_at timestamptz not null default now());
insert into public.mystery_prizes(name,description,icon,kind) values
 ('$5 Gift Card','A $5 gift card. Huy will arrange your physical reward.','🎁','manual'),
 ('Candy Bag','A sweet treat bag. Huy will arrange your physical reward.','🍬','manual'),
 ('+2 Passport Stamps','Huy will physically add two stamps to your passport.','🎟️','manual'),
 ('Extra Mystery Pull','EXTRA PULL! +1 Mystery Token, added immediately.','✨','extra_pull'),
 ('Stamp Booster','The next time you earn a passport stamp, earn +1 additional stamp.','🚀','manual');
-- All quantities begin at zero; only the Mystery Pull supervisor sets stock/tokens.
do $$ declare t text; begin
 foreach t in array array['mystery_access_codes','mystery_sessions','mystery_login_attempts','mystery_balances','mystery_prizes','mystery_wins','mystery_admin_changes'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;
revoke all on sequence public.mystery_wins_id_seq from public,anon,authenticated;

create function public.mystery_require(p_token text) returns public.mystery_sessions language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.mystery_sessions;begin
 select * into s from public.mystery_sessions where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now();
 if s.token_hash is null then raise exception 'Mystery Pull session expired. Enter your access code again.';end if;
 if s.role='manager' and not exists(select 1 from public.locations where id=s.location_id and active=true) then raise exception 'This school is not currently active.';end if;
 return s;
end $$;
create function public.mystery_open(p_code text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_role text;v_token text;v_key text;v_attempt public.mystery_login_attempts;
begin
 v_key:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-forwarded-for','unknown');
 v_key:=encode(sha256(convert_to(v_key,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('mystery-login-'||v_key,0));
 select * into v_attempt from public.mystery_login_attempts where client_key=v_key;
 if v_attempt.window_start>now()-interval '15 minutes' and v_attempt.attempts>=10 then return jsonb_build_object('error','Too many attempts. Please wait 15 minutes.');end if;
 select role into v_role from public.mystery_access_codes where code_hash=encode(sha256(convert_to(p_code,'UTF8')),'hex');
 if v_role is null then
  insert into public.mystery_login_attempts values(v_key,1,now()) on conflict(client_key) do update set attempts=case when mystery_login_attempts.window_start>now()-interval '15 minutes' then mystery_login_attempts.attempts+1 else 1 end,window_start=case when mystery_login_attempts.window_start>now()-interval '15 minutes' then mystery_login_attempts.window_start else now() end;
  return jsonb_build_object('error','That access code is not valid.');
 end if;
 -- Successful use of the manager code must not reset failed admin-code attempts.
 delete from public.mystery_sessions where expires_at<now();
 v_token:=gen_random_uuid()::text||gen_random_uuid()::text;
 insert into public.mystery_sessions(token_hash,role) values(encode(sha256(convert_to(v_token,'UTF8')),'hex'),v_role);
 return jsonb_build_object('token',v_token,'role',v_role);
end $$;
create function public.mystery_choose_school(p_token text,p_location_code text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.mystery_sessions;l public.locations;v_token text;begin
 s:=public.mystery_require(p_token);if s.role<>'entry' then raise exception 'Enter the Mystery Pull access code first.';end if;
 select * into l from public.locations where location_code::text=trim(p_location_code) and active=true;
 if l.id is null then raise exception 'School/location code not found.';end if;
 v_token:=gen_random_uuid()::text||gen_random_uuid()::text;
 insert into public.mystery_sessions(token_hash,role,location_id) values(encode(sha256(convert_to(v_token,'UTF8')),'hex'),'manager',l.id);
 delete from public.mystery_sessions where token_hash=s.token_hash;
 insert into public.mystery_balances(location_id) values(l.id) on conflict do nothing;
 return jsonb_build_object('token',v_token,'role','manager');
end $$;
create function public.mystery_close(p_token text) returns void language sql security definer set search_path=public,pg_temp as $$
 delete from public.mystery_sessions where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
$$;
create function public.mystery_context(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.mystery_sessions;result jsonb;begin
 s:=public.mystery_require(p_token);
 if s.role='entry' then return jsonb_build_object('role','entry');end if;
 if s.role='manager' then
  select jsonb_build_object('role','manager','school',jsonb_build_object('id',l.id,'name',l.school_name,'code',l.location_code),'tokens',coalesce(b.tokens,0),'revision',coalesce(b.revision,1),'prizes_available',exists(select 1 from public.mystery_prizes where active and inventory>0)) into result from public.locations l left join public.mystery_balances b on b.location_id=l.id where l.id=s.location_id;
  return result;
 end if;
 return jsonb_build_object('role','supervisor','schools',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.school_name,'code',l.location_code,'tokens',coalesce(b.tokens,0),'revision',coalesce(b.revision,1)) order by l.school_name) from public.locations l left join public.mystery_balances b on b.location_id=l.id where l.active=true),'[]'::jsonb),'prizes',coalesce((select jsonb_agg(to_jsonb(p) order by p.name) from public.mystery_prizes p),'[]'::jsonb));
end $$;
create function public.mystery_history(p_token text,p_before bigint default null,p_waiting_only boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.mystery_sessions;begin
 s:=public.mystery_require(p_token);if s.role='entry' then raise exception 'Choose a school first.';end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.id desc) from (select w.*,l.school_name,l.location_code from public.mystery_wins w join public.locations l on l.id=w.location_id where (s.role='supervisor' or w.location_id=s.location_id) and (p_before is null or w.id<p_before) and (not p_waiting_only or w.status='waiting') order by w.id desc limit 50) r),'[]'::jsonb);
end $$;
create function public.mystery_pull(p_token text,p_request uuid,p_revision integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.mystery_sessions;b public.mystery_balances;p public.mystery_prizes;w public.mystery_wins;
begin
 s:=public.mystery_require(p_token);if s.role<>'manager' then raise exception 'Choose a school to pull.';end if;
 if p_request is null then raise exception 'A pull request is required.';end if;
 -- One lock order for draws and supervisor changes, including different schools competing for the last prize.
 perform pg_advisory_xact_lock(hashtextextended('mystery-prize-pool',0));
 select * into b from public.mystery_balances where location_id=s.location_id for update;
 select * into w from public.mystery_wins where request_id=p_request;
 if w.id is not null then
  if w.location_id<>s.location_id then raise exception 'This pull belongs to another school.';end if;
  return jsonb_build_object('win',to_jsonb(w),'tokens',b.tokens,'revision',b.revision);
 end if;
 if b.location_id is null or b.tokens<1 then raise exception 'No Mystery Pulls are currently available for your school.';end if;
 if b.revision is distinct from p_revision then raise exception 'Your school balance changed. Refresh before starting another pull.';end if;
 -- Uniform random choice among in-stock active prize TYPES; animation never chooses the result.
 select * into p from public.mystery_prizes where active and inventory>0 order by random() limit 1 for update;
 if p.id is null then raise exception 'Prizes are being restocked. Your token has not been used.';end if;
 update public.mystery_balances set tokens=tokens-1+case when p.kind='extra_pull' then 1 else 0 end,revision=revision+1 where location_id=s.location_id returning * into b;
 update public.mystery_prizes set inventory=inventory-1,revision=revision+1 where id=p.id;
 insert into public.mystery_wins(request_id,location_id,prize_id,prize_name,prize_description,prize_icon,prize_kind,status,fulfilled_at)
 values(p_request,s.location_id,p.id,p.name,p.description,p.icon,p.kind,case when p.kind='extra_pull' then 'received' else 'waiting' end,case when p.kind='extra_pull' then now() else null end) returning * into w;
 return jsonb_build_object('win',to_jsonb(w),'tokens',b.tokens,'revision',b.revision);
end $$;
-- Resolve a lost response without starting a new draw or exposing any other school.
create function public.mystery_pull_result(p_token text,p_request uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.mystery_sessions;begin
 s:=public.mystery_require(p_token);if s.role<>'manager' then raise exception 'Choose a school first.';end if;
 return (select to_jsonb(w) from public.mystery_wins w where w.location_id=s.location_id and w.request_id=p_request);
end $$;
create function public.mystery_admin(p_token text,p_request uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.mystery_sessions;prior public.mystery_admin_changes;b public.mystery_balances;p public.mystery_prizes;w public.mystery_wins;result jsonb;action text:=p_payload->>'action';delta int;loc bigint;
begin
 s:=public.mystery_require(p_token);if s.role<>'supervisor' then raise exception 'Mystery Pull supervisor access is required.';end if;
 if p_request is null or p_payload is null then raise exception 'A change request is required.';end if;
 perform pg_advisory_xact_lock(hashtextextended('mystery-prize-pool',0));
 select * into prior from public.mystery_admin_changes where request_id=p_request;
 if prior.request_id is not null then
  if prior.payload<>p_payload then raise exception 'This request was already used for another change.';end if;
  return prior.result;
 end if;
 if action='tokens' then
  loc:=(p_payload->>'location_id')::bigint;delta:=(p_payload->>'delta')::integer;
  if delta is null or delta=0 or abs(delta::bigint)>1000000 or not exists(select 1 from public.locations where id=loc and active=true) then raise exception 'Choose a school and a valid token adjustment.';end if;
  insert into public.mystery_balances(location_id) values(loc) on conflict do nothing;
  select * into b from public.mystery_balances where location_id=loc for update;
  if b.revision is distinct from (p_payload->>'revision')::integer then raise exception 'The balance changed. Refresh and try again.';end if;
  if b.tokens+delta not between 0 and 1000000 then raise exception 'Token balance cannot be negative or exceed 1,000,000.';end if;
  update public.mystery_balances set tokens=tokens+delta,revision=revision+1 where location_id=loc returning * into b;result:=to_jsonb(b);
 elsif action='prize' then
  if p_payload->>'id' is not null then
   select * into p from public.mystery_prizes where id=(p_payload->>'id')::uuid for update;
   if p.id is null or p.revision is distinct from (p_payload->>'revision')::integer then raise exception 'This prize changed. Refresh and try again.';end if;
   update public.mystery_prizes set name=trim(p_payload->>'name'),description=p_payload->>'description',icon=trim(p_payload->>'icon'),kind=p_payload->>'kind',active=(p_payload->>'active')::boolean,revision=revision+1 where id=p.id returning * into p;
  else
   insert into public.mystery_prizes(name,description,icon,kind,active) values(trim(p_payload->>'name'),p_payload->>'description',trim(p_payload->>'icon'),p_payload->>'kind',coalesce((p_payload->>'active')::boolean,true)) returning * into p;
  end if;result:=to_jsonb(p);
 elsif action='stock' then
  delta:=(p_payload->>'delta')::integer;
  select * into p from public.mystery_prizes where id=(p_payload->>'id')::uuid for update;
  if p.id is null or p.revision is distinct from (p_payload->>'revision')::integer then raise exception 'This prize changed. Refresh and try again.';end if;
  if delta is null or delta=0 or abs(delta::bigint)>1000000 or p.inventory+delta not between 0 and 1000000 then raise exception 'Enter an adjustment that leaves a nonnegative stock quantity.';end if;
  update public.mystery_prizes set inventory=inventory+delta,revision=revision+1 where id=p.id returning * into p;result:=to_jsonb(p);
 elsif action='fulfill' then
  select * into w from public.mystery_wins where id=(p_payload->>'id')::bigint for update;
  if w.id is null then raise exception 'Prize record not found.';end if;
  update public.mystery_wins set status='received',fulfilled_at=coalesce(fulfilled_at,now()) where id=w.id returning * into w;result:=to_jsonb(w);
 else raise exception 'Unknown Mystery Pull change.';end if;
 insert into public.mystery_admin_changes(request_id,payload,result) values(p_request,p_payload,result);
 return result;
end $$;
revoke all on function public.mystery_require(text) from public,anon,authenticated;
revoke all on function public.mystery_open(text),public.mystery_choose_school(text,text),public.mystery_close(text),public.mystery_context(text),public.mystery_history(text,bigint,boolean),public.mystery_pull(text,uuid,integer),public.mystery_pull_result(text,uuid),public.mystery_admin(text,uuid,jsonb) from public;
grant execute on function public.mystery_open(text),public.mystery_choose_school(text,text),public.mystery_close(text),public.mystery_context(text),public.mystery_history(text,bigint,boolean),public.mystery_pull(text,uuid,integer),public.mystery_pull_result(text,uuid),public.mystery_admin(text,uuid,jsonb) to anon,authenticated,service_role;
commit;
