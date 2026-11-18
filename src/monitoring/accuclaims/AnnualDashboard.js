import React,{useState} from 'react';
import {schoolYear} from '../../supperMonitoring/model';
import {hasCurrentPdf} from '../types';

const namedSites=[
 ['Avalon HS','8529','offsite'],['Eagle Tree HS','8575','offsite'],
 ['De La Torre EL LAUP','2301','program'],['Dolores EEC','3452','eec'],
 ['Wilmington Park EEC','7781','eec'],['Bridges SPAN',null,'offsite'],
 ['Hawthorne Academy',null,'offsite'],['Peary MS',null,'main'],['Riley HS',null,'offsite']
];
const normalize = name => String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function annualSites({schools,sites=[]}){
 const active=schools.filter(s=>!/^test\b/i.test(s.school_name));
 const result=active.flatMap(s=>[{...s,key:`main:${s.id}`,name:s.school_name,kind:'main',siteId:sites.find(t=>String(t.location_id)===String(s.id)&&t.kind==='main')?.id},
 ...sites.filter(t=>String(t.location_id)===String(s.id)&&t.kind!=='main').map(t=>({...s,key:`site:${t.id}`,name:t.name,kind:t.kind,siteId:t.id}))]);
 for(const [name,code,kind] of namedSites){
  const parent=active.find(s=>String(s.location_code)===code);
  const alias=name==='De La Torre EL LAUP'?['delatorreelcspp']:name==='Wilmington Park EEC'?['wilmingtoneec']:[];
  const existing=result.find(s=>[normalize(name),...alias].includes(normalize(s.name)));
  if(existing){existing.rosterKey=`roster:${normalize(name)}`;continue;}
  result.push({...parent,name,kind,key:`roster:${normalize(name)}`});
 }
 return result.sort((a,b)=>a.name.localeCompare(b.name));
}
const formatYear=n=>`${n}-${String(n+1).slice(-2)}`;
const displayDate=d=>{const [y,m,day]=d.split('-');return `${Number(m)}/${Number(day)}/${y}`;};
export default function AnnualDashboard({overview,sites,saved,save,year,setYear,currentYear,onOpen,onUpload,onView,busy}){
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('all');
 const start=Number(currentYear.slice(0,4));
 const years=[...new Set([start,start-1,start-2,...overview.records.map(r=>Number(r.school_year?.slice(0,4))).filter(Number.isFinite),...Object.keys(saved.annual||{}).map(y=>Number(y.slice(0,4)))])].sort((a,b)=>b-a);
 const entries=saved.annual?.[year]||{};
 const rows=sites.map(s=>{
  const recordFor=type=>overview.records.filter(r=>r.school_year===year&&r.monitoring_type===type&&String(r.location_id)===String(s.id)&&(s.siteId?String(r.monitoring_site_id)===String(s.siteId):s.kind==='main'&&!r.monitoring_site_id)&&!['draft','deleted'].includes(r.status)&&r.monitoring_date).sort((a,b)=>b.monitoring_date.localeCompare(a.monitoring_date))[0];
  return {s,lunch:recordFor('lunch'),breakfast:recordFor('breakfast'),entry:{...entries[s.rosterKey],...entries[s.key]}};
 });
 const dateFor=(r,type)=>[r[type]?.monitoring_date,r.entry[type]].filter(Boolean).sort().at(-1);
 const lunchCount=rows.filter(r=>dateFor(r,'lunch')).length;
 const breakfastCount=rows.filter(r=>dateFor(r,'breakfast')).length;
 const selected=rows.filter(r=>r.entry.selected||dateFor(r,'breakfast')).length;
 const goal=Math.ceil(rows.length/2);
 const update=(s,patch)=>save({...saved,annual:{...saved.annual,[year]:{...entries,[s.key]:{...entries[s.rosterKey],...entries[s.key],...patch}}}},'School-year tracker saved.');
 return <div className="ac-dashboard">
 <div className="ac-hero"><span>ANNUAL SITE REVIEWS</span><h2>AccuClaims Monitoring</h2><p>Track visits and keep the original reports by site and school year.</p></div>
 <nav className="ac-year-tabs" aria-label="School year">{years.map(n=><button type="button" key={n} aria-pressed={year===formatYear(n)} onClick={()=>setYear(formatYear(n))}>{n}–{n+1}{n===start?' · Current':''}</button>)}</nav>
 <div className="ac-metrics"><div><span>Lunch visits · 100% goal</span><strong>{lunchCount} / {rows.length}</strong></div><div><span>Breakfast visits · 50% goal</span><strong>{breakfastCount} / {goal}</strong></div><div><span>Breakfast sites selected</span><strong>{selected} / {goal}</strong></div></div>
 <div className="ac-filters"><label>Find a site<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="School, offsite, or EEC"/></label><label>Show<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All sites</option><option value="offsite">Offsites and programs</option><option value="breakfast">Breakfast selected or visited</option><option value="lunch">Lunch visit still needed</option></select></label></div>
 <p className="ac-help">Log dates for visits already done, or upload the original PDF now or later. Drafts don’t count as visits. Manually logged dates and breakfast selections are saved in this browser.</p>
 <div className="ac-table-wrap"><table className="ac-table"><thead><tr><th scope="col">Site</th><th scope="col">Lunch</th><th scope="col">Breakfast</th><th scope="col">Actions</th></tr></thead><tbody>
 {rows.filter(r=>`${r.s.name} ${r.s.school_name||''}`.toLowerCase().includes(query.trim().toLowerCase())&&(filter==='all'||filter==='offsite'&&r.s.kind!=='main'||filter==='breakfast'&&(r.entry.selected||dateFor(r,'breakfast'))||filter==='lunch'&&!dateFor(r,'lunch'))).map(r=><tr key={r.s.key}>
 <th scope="row"><strong>{r.s.name}</strong><small>{r.s.kind==='main'?'Main school':r.s.kind==='eec'?'EEC':r.s.kind==='offsite'?'Offsite':'Program'}{r.s.kind!=='main'&&r.s.school_name?` · ${r.s.school_name}`:''}{!r.s.id?' · School link needed':''}</small></th>
 {['lunch','breakfast'].map(type=><td key={type}><strong>{dateFor(r,type)?displayDate(dateFor(r,type))+(r[type]?.monitoring_date===dateFor(r,type)&&hasCurrentPdf(r[type])?' · PDF on file':''):(type==='breakfast'&&!r.entry.selected?'Not selected':'Not yet logged')}</strong>
 {type==='breakfast'&&<label className="ac-select-site"><input type="checkbox" checked={Boolean(r.entry.selected||dateFor(r,type))} disabled={Boolean(dateFor(r,type))} onChange={e=>update(r.s,{selected:e.target.checked})}/> Select for breakfast</label>}
 <details><summary>{r.entry[type]?'Edit logged date':'Log visit date'}</summary><input aria-label={`${r.s.name} ${type} visit date`} type="date" min={year.slice(0,4)+'-07-01'} max={Number(year.slice(0,4))+1+'-06-30'} value={r.entry[type]||''} onChange={e=>{if(!e.target.value||schoolYear(e.target.value)===year)update(r.s,{[type]:e.target.value});}}/></details>
 {r[type]&&hasCurrentPdf(r[type])&&<button disabled={busy} onClick={()=>onView(r[type])}>Open PDF</button>}
 {r.s.id&&<button disabled={busy} onClick={()=>onUpload(r.s,type,dateFor(r,type)||'')}>{r[type]?'Add another PDF':'Upload original PDF'}</button>}</td>)}
 <td>{r.s.id?<button disabled={busy} onClick={()=>onOpen(r.s,year)}>Open lunch form</button>:<small>Link this site before uploading</small>}</td></tr>)}
 </tbody></table></div></div>;
}
