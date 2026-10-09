// Fixed isolated loopback database. All test records roll back.
const {sql}=require('./test-security-auth-local.cjs');
console.log(sql(require('fs').readFileSync('scripts/test-mystery-paid-guesses-local.sql','utf8')));
