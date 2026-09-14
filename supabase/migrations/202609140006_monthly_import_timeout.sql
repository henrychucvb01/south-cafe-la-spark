begin;

-- Production reports contain roughly 20,000 normalized rows plus source audit
-- rows. Extend only this import RPC; normal SPARK queries retain their existing
-- timeout settings.
alter function public.import_monthly_scorecard_report(
  text,text,text,date,text,text,text,text,
  integer,integer,integer,integer,jsonb,jsonb,jsonb
)
set statement_timeout = '120s';

notify pgrst,'reload schema';
commit;
