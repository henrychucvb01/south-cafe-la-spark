-- PRODUCTION ONLY. Apply after the matching API has deployed and passed its checks.
-- Deliberately outside migrations: development databases must never schedule live delivery.
SELECT cron.schedule('spark-supervisor-notifications','* * * * *',$job$
DO $run$ BEGIN
 PERFORM set_config('app.settings.notification_delivery','production',true);
 PERFORM spark_private.dispatch_supervisor_notifications();
 -- Bound only this job's diagnostic history; leave all other jobs and school history alone.
 DELETE FROM cron.job_run_details WHERE jobid IN(SELECT jobid FROM cron.job WHERE jobname='spark-supervisor-notifications') AND end_time<now()-interval '7 days';
END $run$;
$job$);
