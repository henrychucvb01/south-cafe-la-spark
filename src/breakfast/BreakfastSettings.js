import React,{useEffect,useState} from 'react';
import {settings} from './service';
import {usePageNavigation} from '../navigation/PageNavigation';
export default function BreakfastSettings({token,onBack}){
 usePageNavigation({title:'Breakfast settings',destination:'Breakfast',onNavigate:onBack,level:2});
 const [values,setValues]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;settings(token).then(v=>{if(active)setValues(v);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[token]);
 async function save(e){e.preventDefault();setBusy(true);setError('');setMessage('');try{setValues(await settings(token,values));setMessage('Breakfast settings saved.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="ba-panel"><button onClick={onBack}>← Breakfast</button><h2>Breakfast settings</h2><p>The LAUSD training page and supplied teacher quick-tips PDF are included by default. Optional URLs below override those links.</p>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}{values&&<form onSubmit={save} className="ba-form"><label>Teacher reporting cutoff (Los Angeles time)<input type="time" required value={values.teacher_cutoff.slice(0,5)} onChange={e=>setValues({...values,teacher_cutoff:e.target.value})}/></label>{[['training_url','Training Video URL'],['tips_url','1-Page Setup & Quick Tips URL']].map(([key,label])=><label key={key}>{label} (optional, HTTPS)<input type="url" pattern="https://.*" maxLength={2000} value={values[key]} onChange={e=>setValues({...values,[key]:e.target.value})}/></label>)}<button className="ba-primary" disabled={busy}>Save settings</button></form>}</section>;
}
