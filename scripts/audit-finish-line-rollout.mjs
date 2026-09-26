import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {getLocalDateString,isSubmissionOnTime,SCHOOL_YEAR_START,SCHOOL_YEAR_END} from '../src/sparkPolicy.js';
const LAUNCH='2026-09-03',today=getLocalDateString();
const config=await readFile('src/supabaseClient.js','utf8');
const base=config.match(/const supabaseUrl = "([^"]+)"/)[1],key=config.match(/const supabaseKey = "([^"]+)"/)[1];
async function rows(table,select,filters=''){
 const all=[];
 for(let offset=0;;offset+=500){const res=await fetch(`${base}/rest/v1/${table}?select=${select}&${filters}&order=id.asc&offset=${offset}&limit=500`,{headers:{apikey:key}});if(!res.ok)throw Error(`${table}: ${res.status} ${await res.text()}`);const page=await res.json();all.push(...page);if(page.length<500)return all;}
}
const filters=`service_date=gte.${SCHOOL_YEAR_START}&service_date=lte.${today}`;
const [locations,checks,excluded,points]=await Promise.all([
 rows('locations','id,school_name,location_code,active'),rows('finish_line_checks','id,location_id,service_date,status,submitted_at',filters),rows('spark_excluded_days','id,location_id,service_date',filters),rows('spark_points','id,location_id,points,point_type,service_date,unique_key,description,adjustment_reason,created_at',filters)
]);
const day=d=>new Date(`${d}T12:00:00Z`),keyDate=d=>d.toISOString().slice(0,10);
function dates(start,end){const result=[];for(const d=day(start);keyDate(d)<=end;d.setUTCDate(d.getUTCDate()+1))if(d.getUTCDay()>0&&d.getUTCDay()<6)result.push(keyDate(d));return result;}
const schools=locations.filter(s=>s.school_name.trim().toLowerCase()!=='test high school').map(s=>{
 const sc=checks.filter(r=>r.location_id===s.id),sp=points.filter(r=>r.location_id===s.id),ex=new Set(excluded.filter(r=>r.location_id===s.id).map(r=>r.service_date));
 const eligible=d=>d<LAUNCH||sc.some(r=>r.service_date===d&&r.status==='complete'&&isSubmissionOnTime(d,r.submitted_at));
 const daily=dates(SCHOOL_YEAR_START,today<SCHOOL_YEAR_END?today:SCHOOL_YEAR_END).filter(d=>!ex.has(d)).map(d=>{const check=sc.find(r=>r.service_date===d);const expected=d<LAUNCH?5:check&&['complete','attention'].includes(check.status)?(isSubmissionOnTime(d,check.submitted_at)?5:2):0;const entries=sp.filter(p=>p.service_date===d&&['finish_line','finish_line_late'].includes(p.point_type));const actual=entries.reduce((n,p)=>n+Number(p.points),0);return {date:d,expected,actual,missing:Math.max(0,expected-actual),extra:Math.max(0,actual-expected),checkStatus:check?.status||'missing',entries:entries.map(p=>p.id)};});
 const expectedBonuses=[];
 for(const month=day('2026-08-01');keyDate(month)<=SCHOOL_YEAR_END;month.setUTCMonth(month.getUTCMonth()+1)){
  const endDate=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0,12));const end=keyDate(endDate);if(end>today)break;
  const required=dates(keyDate(month)<SCHOOL_YEAR_START?SCHOOL_YEAR_START:keyDate(month),end>SCHOOL_YEAR_END?SCHOOL_YEAR_END:end).filter(d=>!ex.has(d));
  if(required.length&&required.every(eligible))expectedBonuses.push({kind:'month',date:end,points:100});
 }
 // Existing published Perfect Week policy uses full Monday-Friday weeks.
 // The partial opening week Aug 12-14 is listed separately for policy review, not charged.
 for(const monday=day('2026-08-17');;monday.setUTCDate(monday.getUTCDate()+7)){
  const friday=new Date(monday);friday.setUTCDate(friday.getUTCDate()+4);const end=keyDate(friday);if(end>today||end>SCHOOL_YEAR_END)break;
  const required=dates(keyDate(monday),end).filter(d=>!ex.has(d));
  if(required.length&&required.every(eligible))expectedBonuses.push({kind:'week',date:end,points:25});
 }
 const bonusRows=sp.filter(p=>['perfect_week','perfect_month','weekly_streak_bonus','monthly_streak_bonus'].includes(p.point_type));
 const bonus=expectedBonuses.map(a=>{const entries=bonusRows.filter(p=>p.service_date===a.date&&(/week/.test(p.point_type)?'week':'month')===a.kind);const actual=entries.reduce((n,p)=>n+Number(p.points),0);return {...a,actual,missing:Math.max(0,a.points-actual),overlap:Math.max(0,actual-a.points),entries:entries.map(p=>p.id)};});
 const adjustments=sp.filter(p=>p.point_type==='supervisor_adjustment');
 const sum=(rs,k)=>rs.reduce((n,r)=>n+r[k],0);
 return {...s,daily,bonus,adjustments,augustDailyMissing:sum(daily.filter(d=>d.date<'2026-09-01'),'missing'),sepGraceMissing:sum(daily.filter(d=>d.date>='2026-09-01'&&d.date<LAUNCH),'missing'),postLaunchDailyMissing:sum(daily.filter(d=>d.date>=LAUNCH),'missing'),bonusMissing:sum(bonus,'missing'),augustBonusOverlap:sum(bonus.filter(d=>d.date<'2026-09-01'),'overlap'),septemberBonusOverlap:sum(bonus.filter(d=>d.date>='2026-09-01'),'overlap'),manualAdjustmentPoints:adjustments.reduce((n,p)=>n+Number(p.points),0)};
});
const result={checkedAt:new Date().toISOString(),today,schoolStart:SCHOOL_YEAR_START,officialLaunch:LAUNCH,graceThrough:'2026-09-02',counts:{schools:schools.length,checks:checks.length,points:points.length},schools};
await mkdir('test-results/streak-audit',{recursive:true});await writeFile('test-results/streak-audit/rollout-audit.json',JSON.stringify(result,null,2));
await writeFile('test-results/streak-audit/rollout-snapshot.json',JSON.stringify({locations,checks,excluded,points},null,2));
const lines=[`# Corrected checklist and streak audit`,``,`Checked ${result.checkedAt}. ${schools.length} schools; test school excluded. Read-only.`,``,`Full daily checklist credit through September 2, regardless of missing/late submissions. Normal on-time rules begin September 3. Approved excluded days are skipped. August monthly and full-week bonuses are eligible for every school. Existing August rollout credits are approved; overlapping entries are informational, not an instruction to remove points. Monthly bonuses are checked only after their period ends.`,``,`Scope: checklist points and weekly/monthly checklist bonuses. Meal-count, games, training and other rewards are outside this audit. Missing amounts below compare the named award entries by date/period; separate Supervisor adjustments are listed for reconciliation and are not automatically netted against a missing award.`,``,`The partial opening week August 12–14 has no full Monday-Friday week under the current implementation. A separate +25 opening-week award is not assumed. If intended, add 25 per school to this audit.`,``,`| School | August checklist gap | Sep 1–2 gap | Sep 3+ checklist gap | Bonus gap | August overlapping credits | Supervisor adjustments |`,`|---|---:|---:|---:|---:|---:|---:|`,...schools.map(s=>`| ${s.school_name} | ${s.augustDailyMissing} | ${s.sepGraceMissing} | ${s.postLaunchDailyMissing} | ${s.bonusMissing} | ${s.augustBonusOverlap} | ${s.manualAdjustmentPoints} |`),``,`## Missing award details`];
for(const s of schools){const missing=[...s.daily.filter(d=>d.missing).map(d=>`${d.date}: checklist +${d.missing} (${d.actual}/${d.expected} recorded)`),...s.bonus.filter(b=>b.missing).map(b=>`${b.date}: ${b.kind} bonus +${b.missing}`)];if(missing.length)lines.push(``,`### ${s.school_name}`,...missing.map(v=>`- ${v}`));}
lines.push(``,`## Banning HS`,``,...schools.find(s=>s.school_name==='Banning HS').bonus.map(b=>`- ${b.date}: ${b.kind}, expected ${b.points}, recorded ${b.actual}, missing ${b.missing}.`),``,`## Code findings`,``,`The corrected policy starts normal timing on September 3. Migration 202609250008 awards eligible bonuses on checklist/exclusion saves and hourly, with period-based duplicate protection across legacy keys. This report only reads data and does not change points.`);
await writeFile('test-results/streak-audit/rollout-summary.md',lines.join('\n')+'\n');
console.log(JSON.stringify({checkedAt:result.checkedAt,schools:schools.length,totals:Object.fromEntries(['augustDailyMissing','sepGraceMissing','postLaunchDailyMissing','bonusMissing','augustBonusOverlap','septemberBonusOverlap','manualAdjustmentPoints'].map(k=>[k,schools.reduce((n,s)=>n+s[k],0)])),gaps:schools.filter(s=>s.augustDailyMissing+s.sepGraceMissing+s.postLaunchDailyMissing+s.bonusMissing).map(s=>({school:s.school_name,aug:s.augustDailyMissing,sepGrace:s.sepGraceMissing,postLaunch:s.postLaunchDailyMissing,bonus:s.bonusMissing,adjustments:s.adjustments})),banning:schools.find(s=>s.school_name==='Banning HS')},null,2));
