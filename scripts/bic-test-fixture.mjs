import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
export async function bicTestDatabase(){const db=new PGlite({extensions:{pgcrypto}});try{
 await db.exec(`create role anon;create role authenticated;
 create table locations(id bigint primary key,active boolean);create table employees(id bigint primary key,location_id bigint,employee_name text,active boolean);
 insert into locations values(1,true),(2,true);insert into employees values(11,1,'Manager A',true),(22,2,'Manager B',true);
 create function verify_manager_pin(text,text) returns boolean language sql as $$select $2='1234'$$;
 create function verify_covering_pin(text) returns boolean language sql as $$select $1='5678'$$;
 create table meal_counts(location_id bigint,breakfast_count int);insert into meal_counts values(1,642);`);
 await db.exec(await readFile('supabase/migrations/202609230001_supper_monitoring.sql','utf8'));
 await db.exec("alter table supper_monitoring_sessions add column actor_role text not null default 'manager';");
 const old=await readFile('supabase/migrations/202609240001_supper_monitoring_review.sql','utf8');const start=old.indexOf('create or replace function public.require_supper_monitoring_session');await db.exec(old.slice(start,old.indexOf('end $$;',start)+7));
 await db.exec(await readFile('supabase/migrations/202610060001_breakfast_foundation.sql','utf8'));

 await db.exec("create table test_clock(value timestamptz);insert into test_clock values('2026-10-06 15:00:00+00');create function test_now() returns timestamptz language sql as $$select value from public.test_clock$$;");
 // Controlled test clock only; production always uses PostgreSQL clock_timestamp().
 await db.exec((await readFile('supabase/migrations/202610060002_breakfast_teacher.sql','utf8')).replaceAll('clock_timestamp()', 'public.test_now()'));
 await db.exec("create table staffing_positions(id bigint,location_id bigint,active boolean,employee_name text,linked_employee_id bigint,school_year text);insert into staffing_positions values(101,1,true,'Worker A',null,'2026-27'),(102,2,true,'Worker B',null,'2026-27');alter table locations add column school_name text default 'School';alter table locations add column location_code text default 'TEST';");
 await db.exec((await readFile('supabase/migrations/202610070001_breakfast_worker.sql','utf8')).replaceAll('clock_timestamp()', 'public.test_now()'));
 await db.exec("insert into breakfast_worker_access(location_id,pin_hash) values(1,extensions.crypt('4321',extensions.gen_salt('bf',10)));");
 await db.exec((await readFile('supabase/migrations/202610070002_breakfast_operations.sql','utf8')).replaceAll('clock_timestamp()', 'public.test_now()'));
 await db.exec((await readFile('supabase/migrations/202610070003_breakfast_item_packing.sql','utf8')).replaceAll('clock_timestamp()', 'public.test_now()'));
 await db.exec((await readFile('supabase/migrations/202610070004_breakfast_adult_meal.sql','utf8')).replaceAll('clock_timestamp()', 'public.test_now()'));
 await db.exec('create table spark_excluded_days(location_id bigint,service_date date);');
 await db.exec((await readFile('supabase/migrations/202610070005_breakfast_preorders.sql','utf8')).replaceAll('clock_timestamp()', 'public.test_now()'));

 for(const file of ['20261013220405_breakfast_pilot_improvements.sql','20261013222842_breakfast_pilot_teacher_return_review.sql','20261021163452_breakfast_manager_day_corrections.sql'])await db.exec((await readFile('supabase/migrations/'+file,'utf8')).replaceAll('clock_timestamp()', 'public.test_now()'));

 await db.exec((await readFile('supabase/migrations/20261022172727_bic_classroom_menu_groups.sql','utf8')).replaceAll('clock_timestamp()', 'public.test_now()'));
return db;}catch(error){await db.close();throw error;}}
