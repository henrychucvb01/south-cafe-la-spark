// This helper can only connect to the isolated loopback fixture.
const fs=require('node:fs');
const {sql}=require('./test-security-auth-local.cjs');
if(sql('select current_database()')!=='spark_security')throw Error('Local test database required');
sql(fs.readFileSync('supabase/local/supervisor-notification-preview-counts.sql','utf8'));
console.log(sql(fs.readFileSync('scripts/test-notifications-local.sql','utf8')));
