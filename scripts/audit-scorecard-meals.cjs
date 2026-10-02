// Read-only reconciliation of an exported school/date Meal Audit snapshot.
const fs=require('fs'),path=require('path'),assert=require('assert'),babel=require('@babel/core'),Module=require('module');
const root=path.resolve(__dirname,'..');
function load(file){const code=babel.transformFileSync(file,{configFile:false,babelrc:false,plugins:['@babel/plugin-transform-modules-commonjs']}).code;const m=new Module(file);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m.require=id=>id==='../mplhTargets'?load(path.join(root,'src/mplhTargets.js')):require(id);m._compile(code,file);return m.exports;}
const {buildSchoolScorecard}=load(path.join(root,'src/monthlyScorecards/monthlyScorecardCalculations.js'));
const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const data={meal_counts:[],official_meal_counts:[],excluded_days:[]};
for(const r of rows){for(const [prefix,key] of [['official','official_meal_counts'],['finish','meal_counts']])data[key].push({location_id:r.location_id,service_date:r.service_date,...Object.fromEntries(['breakfast','lunch','supper'].map(m=>[m+'_count',r[prefix+'_'+m]]))});if(r.excluded)data.excluded_days.push(r);}
const result=[];
for(const id of new Set(rows.map(r=>r.location_id))){const all=rows.filter(r=>r.location_id===id);const school=all[0];const dates=all.map(r=>r.service_date).sort();const range={startDate:dates[0],endDate:dates[dates.length-1]};const card=buildSchoolScorecard(school,data,range);const operating=all.filter(r=>!r.excluded&&![0,6].includes(new Date(r.service_date+'T12:00:00Z').getUTCDay()));assert.equal(card.current.operatingDays,operating.length,school.school_name);for(const meal of ['breakfast','lunch','supper']){const sum=operating.reduce((s,r)=>s+(r['official_'+meal]>0?r['official_'+meal]:r['finish_'+meal]||0),0);assert.equal(card.current.totals[meal],sum,school.school_name+' '+meal);assert.equal(card.current.averages[meal],sum/operating.length);}
result.push({school:school.school_name,days:operating.length,...card.current.totals,lunchAverage:card.current.averages.lunch.toFixed(1)});}
console.table(result);console.log('PASS: '+result.length+' schools match the exported official/fallback counts and operating-day averages.');
