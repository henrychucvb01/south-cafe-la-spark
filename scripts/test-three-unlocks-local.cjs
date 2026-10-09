const fs=require('fs'),{sql}=require('./test-security-auth-local.cjs');
const test=fs.readFileSync('scripts/test-three-unlocks-local.sql','utf8');
console.log('Live schema:',sql(test));
console.log('Development schema:',sql(test.replaceAll('october_live','october_dev').replaceAll('october_games_live','october_games_dev')));
