-- Isolated development upgrade only. Not a production migration.
begin;
do $$begin
 if current_setting('spark.rewards_development',true) is distinct from 'on' then
  raise exception 'Rewards builder requires explicit isolated development setup';
 end if;
end;$$;
alter table rewards_dev.catalog drop constraint catalog_type_check;
alter table rewards_dev.catalog add constraint catalog_type_check check(type in('pool','fixed','auction','wheel'));
alter table rewards_dev.settings add column builder_version integer not null default 2;

create or replace function rewards_dev.validate_reward(p rewards_dev.catalog) returns void
language plpgsql set search_path=pg_catalog as $$
declare k text;n numeric;s jsonb;active_count integer:=0;ids text[]:=array[]::text[];
begin
 if p.config is null or jsonb_typeof(p.config)<>'object' then raise exception 'Reward configuration must be an object';end if;
 for k in select jsonb_object_keys(p.config) loop
  if not k=any(array['goal','minimum','maximum','show_names','refund_policy','price','quantity','max_claims','approval_required','sold_out','starting_bid','increment','max_bids','allow_raise','wheel_spins','reserve','anti_sniping','trigger_minutes','extension_minutes','wheel_type','segments','session_limit']) then raise exception 'Unsupported reward configuration';end if;
  if k=any(array['goal','minimum','maximum','price','quantity','max_claims','starting_bid','increment','max_bids','wheel_spins','reserve','trigger_minutes','extension_minutes','session_limit']) and p.config->k<>'null'::jsonb then
   if jsonb_typeof(p.config->k)<>'number' then raise exception 'Enter numeric point and limit values';end if;
   n:=(p.config->>k)::numeric;if n<=0 or n<>trunc(n) or n>2147483647 then raise exception 'Points and limits must be positive whole numbers';end if;
  elsif k=any(array['show_names','approval_required','sold_out','allow_raise','anti_sniping']) and jsonb_typeof(p.config->k)<>'boolean' then raise exception 'Invalid reward option';end if;
 end loop;
 if p.config?'refund_policy' and p.config->>'refund_policy' not in('refund','no_refund','supervisor_review') then raise exception 'Invalid refund policy';end if;
 if length(p.description)>2000 or length(p.icon)>16 then raise exception 'Reward text is too long';end if;
 if p.image_url is not null and p.image_url!~'^https://[^[:space:]]+$' then raise exception 'Image URL must use HTTPS';end if;
 if p.type='auction' then
  if (p.config->>'reserve')::numeric<(p.config->>'starting_bid')::numeric then raise exception 'Reserve must be at least the starting bid';end if;
  foreach k in array array['trigger_minutes','extension_minutes'] loop
   if p.config?k and (p.config->>k)::int not in(1,2,3,5,10) then raise exception 'Choose an auction window of 1, 2, 3, 5 or 10 minutes';end if;
  end loop;
 end if;
 if p.type='wheel' then
  if coalesce(p.config->>'wheel_type','') not in('pull','punishment','positive') then raise exception 'Choose a wheel type';end if;
  if coalesce((p.config->>'session_limit')::int,0) not between 1 and 100 then raise exception 'Session limit must be 1 to 100';end if;
  if jsonb_typeof(p.config->'segments') is distinct from 'array' then raise exception 'Add wheel segments';end if;
  if jsonb_array_length(p.config->'segments')>12 then raise exception 'Use at most 12 wheel segments';end if;
  for s in select value from jsonb_array_elements(p.config->'segments') loop
   if jsonb_typeof(s)<>'object' or length(trim(coalesce(s->>'id',''))) not between 1 and 100 or (s->>'id')=any(ids) then raise exception 'Wheel segments need unique IDs';end if;
   ids:=array_append(ids,s->>'id');
   if length(trim(coalesce(s->>'label',''))) not between 1 and 60 or coalesce(s->>'color','')!~'^#[0-9a-fA-F]{6}$' then raise exception 'Set a short label and valid color for every segment';end if;
   if jsonb_typeof(s->'enabled') is distinct from 'boolean' or jsonb_typeof(s->'approved') is distinct from 'boolean' then raise exception 'Invalid segment approval or enabled flag';end if;
   if (p.config->>'wheel_type'='pull' and coalesce(s->>'outcome','') not in('extra_spins','prize','none')) or (p.config->>'wheel_type'='punishment' and s->>'outcome' is distinct from 'challenge') or (p.config->>'wheel_type'='positive' and s->>'outcome' is distinct from 'activity') then raise exception 'Outcome does not match wheel type';end if;
   if s->>'outcome'='extra_spins' then
    if jsonb_typeof(s->'value') is distinct from 'number' then raise exception 'Extra spins must be numeric';end if;
    n:=(s->>'value')::numeric;if n<>trunc(n) or n not between 1 and 100 then raise exception 'Extra spins must be a whole number from 1 to 100';end if;
   end if;
   if (s->>'enabled')::boolean then
    if p.config->>'wheel_type'<>'punishment' or (s->>'approved')::boolean then active_count:=active_count+1;
    elsif p.status='published' then raise exception 'Approve every enabled challenge before publishing';end if;
   end if;
  end loop;
  if p.status='published' and active_count<2 then raise exception 'Enable at least two approved segments';end if;
 end if;
 if p.status='published' then
  if trim(p.description)='' then raise exception 'Add a description before publishing';end if;
  if p.type in('pool','wheel') and (p.config->>'goal') is null then raise exception 'Set the community point goal';end if;
  if p.type='fixed' and (p.config->>'price') is null then raise exception 'Set a point price';end if;
  if p.type='auction' and ((p.config->>'starting_bid') is null or (p.config->>'reserve') is null or (p.config->>'increment') is null or p.opens_at is null or p.closes_at is null) then raise exception 'Set starting bid, reserve, increment and auction dates';end if;
 end if;
end;$$;
revoke all on function rewards_dev.validate_reward(rewards_dev.catalog) from public,anon,authenticated;
commit;
