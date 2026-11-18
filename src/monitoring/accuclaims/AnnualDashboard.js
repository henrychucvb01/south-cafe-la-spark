import React,{useState} from 'react';

const namedSites=[
 ['Avalon HS','8529','offsite'],['Eagle Tree HS','8575','offsite'],
 ['De La Torre EL LAUP','2301','program'],['Dolores EEC','3452','eec'],
 ['Wilmington Park EEC','7781','eec'],
 ['Riley HS','5753','offsite']
];
const normalize = name => String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function annualSites({schools,sites=[]}){
 const excluded=name=>/^(hawthorneacademy|pearyms|rileyhs)$/.test(normalize(name));
 const active=schools.filter(s=>!/^test\b/i.test(s.school_name)&&!excluded(s.school_name));
 const isBridges=s=>String(s.location_code)==='6867';
 const result=active.flatMap(s=>[{...s,key:`main:${s.id}`,name:s.school_name,kind:'main',...(isBridges(s)?{rosterKey:'roster:bridgesspan'}:{}),siteId:sites.find(t=>String(t.location_id)===String(s.id)&&t.kind==='main')?.id},
 ...sites.filter(t=>String(t.location_id)===String(s.id)&&t.kind!=='main'&&!excluded(t.name)&&!(isBridges(s)&&['bridgesspan','harrybridgesel'].includes(normalize(t.name)))).map(t=>({...s,key:`site:${t.id}`,name:t.name,kind:t.kind,siteId:t.id}))]);
 for(const [name,code,kind] of namedSites){
  const parent=active.find(s=>String(s.location_code)===code);
  const alias=name==='De La Torre EL LAUP'?['delatorreelcspp']:name==='Wilmington Park EEC'?['wilmingtoneec']:[];
  const existing=result.find(s=>[normalize(name),...alias].includes(normalize(s.name)));
  if(existing){existing.rosterKey=`roster:${normalize(name)}`;continue;}
  result.push({...parent,name,kind,key:`roster:${normalize(name)}`});
 }
 return result.sort((a,b)=>a.name.localeCompare(b.name));
}
const breakfastHistoryYear='2025-26';
// Visit dates from the district SNP-23 breakfast reviews.
const breakfastHistory=new Map([
 ['2026-01-22','186thstel'],
 ['2025-09-26','232ndplel','232ndel'],
 ['2026-01-16','amblerel'],
 ['2026-01-15','banninghs'],
 ['2025-12-11','carnegiems'],
 ['2026-01-23','carsonhs'],
 ['2025-09-25','curtissms'],
 ['2025-12-10','delatorreellaup','delatorreelcspp','delatorrelaup'],
 ['2025-12-09','delamoel'],
 ['2025-12-04','doloresel'],
 ['2025-09-30','gardenael'],
 ['2025-12-02','ranchodominguezprephs','ranchodominguezhs'],
 ['2026-01-19','rileyhs'],
 ['2026-01-12','vandeeneel','whitems'],
 ['2025-12-12','wilmingtonparkel']
].flatMap(([date,...names])=>names.map(name=>[name,date])));
export const breakfastSuggested=(site,year)=>year==='2026-27'&&breakfastHistory.has(normalize(site.name));
const formatYear=n=>`${n}-${String(n+1).slice(-2)}`;
const displayDate=d=>{const [y,m,day]=d.split('-');return `${Number(m)}/${Number(day)}/${y}`;};
export default function AnnualDashboard({sites,saved,save,year,setYear,currentYear,onOpen,busy}){
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('all');
 const start=Number(currentYear.slice(0,4));
 const years=[...new Set([start,Number(breakfastHistoryYear.slice(0,4)),...Object.keys(saved.completed||{}).map(y=>Number(y.slice(0,4))).filter(Number.isInteger)])].sort((a,b)=>b-a);
 const entries=saved.annual?.[year]||{};
 const visitsFor=(s,y)=>({...saved.completed?.[y]?.[s.rosterKey],...saved.completed?.[y]?.[s.key]});
 const rows=sites.map(s=>{
  const entry={...entries[s.rosterKey],...entries[s.key]};
  const visits=visitsFor(s,year);
  const historicalBreakfastDate=breakfastHistory.get(normalize(s.name));
  const previousYear=formatYear(Number(year.slice(0,4))-1);
  const previousBreakfastDate=visitsFor(s,previousYear).breakfast?.date||
   (previousYear===breakfastHistoryYear?historicalBreakfastDate:undefined);
  return {s,visits,previousBreakfastDate,
   historicalBreakfastDate:year===breakfastHistoryYear?historicalBreakfastDate:undefined,
   selected:entry.selected??breakfastSuggested(s,year)};
 });
 const dateFor=(r,type)=>r.visits[type]?.date||(type==='breakfast'?r.historicalBreakfastDate:undefined);
 const lunchCount=rows.filter(r=>dateFor(r,'lunch')).length;
 const breakfastCount=rows.filter(r=>dateFor(r,'breakfast')).length;
 const selected=rows.filter(r=>r.selected||dateFor(r,'breakfast')).length;
 const goal=Math.ceil(rows.length/2);
 const update=(s,patch)=>save({...saved,annual:{...saved.annual,[year]:{...entries,[s.key]:{...entries[s.rosterKey],...entries[s.key],...patch}}}},'School-year tracker saved.');
 return <div className="ac-dashboard">
 <div className="ac-hero"><span>ANNUAL SITE REVIEWS</span><h2>AccuClaims Monitoring</h2><p>Complete lunch and breakfast forms and track visits by school year.</p></div>
 <nav className="ac-year-tabs" aria-label="School year">{years.map(n=><button type="button" key={n} aria-pressed={year===formatYear(n)} onClick={()=>setYear(formatYear(n))}>{n}–{n+1}{n===start?' · Current':''}</button>)}</nav>
 <div className="ac-metrics"><div><span>Lunch visits · 100% goal</span><strong>{lunchCount} / {rows.length}</strong></div><div><span>Breakfast visits · 50% goal</span><strong>{breakfastCount} / {goal}</strong></div><div><span>Breakfast sites selected</span><strong>{selected} / {goal}</strong></div></div>
 <div className="ac-filters"><label>Find a site<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="School, offsite, or EEC"/></label><label>Show<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All sites</option><option value="offsite">Offsites and programs</option><option value="breakfast">Breakfast selected or visited</option><option value="lunch">Lunch visit still needed</option></select></label></div>
 <p className="ac-help">Completed visit dates come from filed forms and prior-year breakfast reviews. Breakfast selections start from last year’s sites for 2026–2027 and can be changed. Visits and selections are saved in this browser.</p>
 <div className="ac-table-wrap"><table className="ac-table"><thead><tr><th scope="col">Site</th><th scope="col">Lunch</th><th scope="col">Breakfast</th><th scope="col">Actions</th></tr></thead><tbody>
 {rows.filter(r=>`${r.s.name} ${r.s.school_name||''}`.toLowerCase().includes(query.trim().toLowerCase())&&(filter==='all'||filter==='offsite'&&r.s.kind!=='main'||filter==='breakfast'&&(r.selected||dateFor(r,'breakfast'))||filter==='lunch'&&!dateFor(r,'lunch'))).map(r=><tr key={r.s.key}>
 <th scope="row"><strong>{r.s.name}</strong><small>{r.s.kind==='main'?'Main school':r.s.kind==='eec'?'EEC':r.s.kind==='offsite'?'Offsite':'Program'}{r.s.kind!=='main'&&r.s.school_name?` · ${r.s.school_name}`:''}{!r.s.id?' · School link needed':''}</small></th>
 {['lunch','breakfast'].map(type=><td key={type}><strong>{dateFor(r,type)?displayDate(dateFor(r,type)):'—'}</strong>
 {type==='breakfast'&&r.previousBreakfastDate&&<small>Last year: {displayDate(r.previousBreakfastDate)}</small>}
 {type==='breakfast'&&<label className="ac-select-site"><input type="checkbox" checked={Boolean(r.selected||dateFor(r,type))} disabled={Boolean(dateFor(r,type))} onChange={e=>update(r.s,{selected:e.target.checked})}/> Selected for breakfast</label>}</td>)}
 <td>{r.s.id?<>{['lunch','breakfast'].map(type=><button key={type} disabled={busy} onClick={()=>onOpen(r.s,year,type,r.visits[type])}>{r.visits[type]?'Open':'Start'} {type}</button>)}</>:<small>School link needed</small>}</td></tr>)}
 </tbody></table></div></div>;
}
