// Compile the existing frozen puzzle schedule into the private server bank.
// This does not connect to a database or alter any school's progress.
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');
const babel=require('@babel/core');const root=path.resolve('src');
const original=Module._extensions['.js'];
Module._extensions['.js']=(module,filename)=>{
  if(!filename.startsWith(root+path.sep))return original(module,filename);
  const code=babel.transformSync(fs.readFileSync(filename,'utf8'),{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-modules-commonjs']}).code;
  module._compile(code,filename);
};
let selectSeasonPuzzle;
try{({selectSeasonPuzzle}=require('../src/dailyBites/games/seasonPuzzles'));}finally{Module._extensions['.js']=original;}
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const rows=[];const answers=[];
for(let d=new Date('2026-08-12T12:00:00Z');d<=new Date('2027-06-04T12:00:00Z');d.setUTCDate(d.getUTCDate()+1)){
  if(d.getUTCDay()===0||d.getUTCDay()===6)continue;
  const date=d.toISOString().slice(0,10);
  for(const type of ['word','spark-sort']){
    const puzzle=selectSeasonPuzzle(type,date);
    if(type==='word')answers.push(puzzle.answer);
    rows.push(`(${q(puzzle.puzzleId)},${q(type==='word'?'word':'spark_sort')},${q(date)},${q(JSON.stringify(puzzle))}::jsonb)`);
  }
}
const source=fs.readFileSync('src/data/validWordGuesses.js','utf8');
const words=[...new Set([...source.match(/const VALID_FIVE_LETTER_WORDS = `([\s\S]*?)`/)[1].trim().split(/\s+/),...answers].map(w=>w.toUpperCase()).filter(w=>/^[A-Z]{5}$/.test(w)))];
const output=`-- BEGIN GENERATED PRIVATE PUZZLE BANK\nINSERT INTO spark_private.game_puzzles(puzzle_id,game_type,service_date,puzzle) VALUES\n${rows.join(',\n')};\nINSERT INTO spark_private.word_guesses(word) VALUES ${words.map(w=>'('+q(w)+')').join(',')};\n-- END GENERATED PRIVATE PUZZLE BANK`;
const file='supabase/migrations/20261008173201_spark_security_phase1.sql';
let migration=fs.readFileSync(file,'utf8');
if(migration.includes('-- BEGIN GENERATED PRIVATE PUZZLE BANK'))migration=migration.replace(/-- BEGIN GENERATED PRIVATE PUZZLE BANK[\s\S]*?-- END GENERATED PRIVATE PUZZLE BANK/,output);
else migration=migration.replace(/COMMIT;\s*$/,output+'\nCOMMIT;\n');
fs.writeFileSync(file,migration);
console.log(`Prepared ${rows.length} existing daily puzzles and ${words.length} allowed guesses; no database accessed.`);
