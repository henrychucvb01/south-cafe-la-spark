// Fixed loopback database; every synthetic test write is rolled back.
const {sql}=require('./test-security-auth-local.cjs');
const fs=require('fs');
console.log(sql(fs.readFileSync('scripts/test-custom-prizes-local.sql','utf8')));
