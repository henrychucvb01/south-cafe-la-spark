import React,{useCallback,useEffect,useRef,useState} from 'react';
import {mysteryRpc,newRequest,readSaved,dateLabel} from './service';
const emptyPrize=()=>({name:'',description:'',icon:'🎁',kind:'manual',active:true});
const pendingKey='spark-mystery-admin-pending';
export default function MysterySupervisor({token,onExpired}) {
 const [data,setData]=useState(null),[rows,setRows]=useState([]),[tab,setTab]=useState('tokens'),[waiting,setWaiting]=useState(true),[more,setMore]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[pending,setPending]=useState(()=>readSaved(pendingKey));
 const [school,setSchool]=useState(''),[tokenCount,setTokenCount]=useState('1'),[tokenDirection,setTokenDirection]=useState('add'),[editor,setEditor]=useState(null),[stock,setStock]=useState('1'),[stockDirection,setStockDirection]=useState('add');
 const lock=useRef(false),alive=useRef(true),readVersion=useRef(0);
 const refresh=useCallback(async()=>{const version=++readVersion.current;const [next,history]=await Promise.all([mysteryRpc('context',{p_token:token}),mysteryRpc('history',{p_token:token,p_waiting_only:waiting})]);if(alive.current&&version===readVersion.current){setData(next);setRows(history);setMore(history.length===50);}},[token,waiting]);
 useEffect(()=>{alive.current=true;setBusy(true);refresh().catch(e=>setError(e.message)).finally(()=>setBusy(false));return()=>{alive.current=false;};},[refresh]);
 async function save(payload,retry=false){if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');let request;
  try {request=retry?pending:{id:newRequest(),payload};if(!request)throw Error('No saved change to retry.');sessionStorage.setItem(pendingKey,JSON.stringify(request));setPending(request);
   await mysteryRpc('admin',{p_token:token,p_request:request.id,p_payload:request.payload});sessionStorage.removeItem(pendingKey);setPending(null);setEditor(null);setMessage('Saved. Changes are available across devices.');await refresh().catch(e=>setError(e.message));
  }catch(e){setError(e.message);if(e.confirmed&&!/expired/i.test(e.message)){sessionStorage.removeItem(pendingKey);setPending(null);await refresh().catch(()=>{});}}
  finally{lock.current=false;setBusy(false);}
 }
 async function reload(){setBusy(true);try{await refresh();setError('');setEditor(null);}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function older(){setBusy(true);try{const next=await mysteryRpc('history',{p_token:token,p_before:rows.at(-1)?.id,p_waiting_only:waiting});setRows(current=>[...current,...next]);setMore(next.length===50);}catch(e){setError(e.message);}finally{setBusy(false);}}
 const disabled=busy||!!pending,selected=data?.schools.find(s=>String(s.id)===school),selectedPrize=editor?.id?data?.prizes.find(p=>p.id===editor.id):null;
 return <div className="mystery-admin"><header className="mystery-school-heading"><div><p className="mystery-eyebrow">SUPERVISOR AREA</p><h1>Mystery Pull Control Room</h1><p>Tokens, prizes, and deliveries. Separate from SPARK operations.</p></div><button className="mystery-secondary" onClick={reload} disabled={busy}>Refresh</button></header>
  {error&&<div className="mystery-error" role="alert">{error}{/expired/i.test(error)&&<button onClick={onExpired}>Enter access code again</button>}</div>}
  {message&&<p className="mystery-success" role="status">{message}</p>}
  {pending&&<div className="mystery-error"><p>A saved change needs confirmation. Retry it safely before making another change.</p><button className="mystery-primary" disabled={busy} onClick={()=>save(null,true)}>Retry saved change</button></div>}
  <nav className="mystery-tabs" aria-label="Mystery Pull management">{[['tokens','School tokens'],['prizes','Prize inventory'],['history','Prizes & history']].map(([id,label])=><button key={id} type="button" aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}>{label}</button>)}</nav>
  {data&&tab==='tokens'&&<section><h2>School token balances</h2><form className="mystery-admin-form" onSubmit={e=>{e.preventDefault();if(selected)save({action:'tokens',location_id:selected.id,revision:selected.revision,delta:Number(tokenCount)*(tokenDirection==='add'?1:-1)});}}>
   <label>School<select required value={school} onChange={e=>setSchool(e.target.value)}><option value="">Choose a school</option>{data.schools.map(s=><option value={s.id} key={s.id}>{s.name} · {s.code}</option>)}</select></label>
   <label>Token action<select value={tokenDirection} onChange={e=>setTokenDirection(e.target.value)}><option value="add">Add tokens</option><option value="subtract">Subtract tokens</option></select></label>
   <label>Number of tokens<input type="number" min="1" max="1000000" step="1" required value={tokenCount} onChange={e=>setTokenCount(e.target.value)}/></label>
   {selected&&<p>Current balance: <strong>{selected.tokens}</strong></p>}<button className="mystery-primary" disabled={disabled||!selected}>Save token change</button>
  </form><div className="mystery-table-wrap"><table><thead><tr><th>School</th><th>Location</th><th>Tokens</th></tr></thead><tbody>{data.schools.map(s=><tr key={s.id}><td>{s.name}</td><td>{s.code}</td><td>{s.tokens}</td></tr>)}</tbody></table></div></section>}
  {data&&tab==='prizes'&&<section><div className="mystery-section-title"><h2>Prize inventory</h2><button className="mystery-primary" disabled={disabled} onClick={()=>setEditor(emptyPrize())}>Add a prize</button></div><p>Only active prizes with stock are eligible. Extra Pull prizes also have stock; winning one automatically adds a token.</p>
   {editor&&<div className="mystery-editor"><form className="mystery-admin-form" onSubmit={e=>{e.preventDefault();save({action:'prize',...editor});}}><h3>{editor.id?'Edit prize':'New prize'}</h3>
    <label>Prize name<input required maxLength="80" value={editor.name} onChange={e=>setEditor({...editor,name:e.target.value})}/></label>
    <label>Prize description<textarea required maxLength="600" rows="3" value={editor.description} onChange={e=>setEditor({...editor,description:e.target.value})}/></label>
    <label>Prize icon<input required maxLength="24" value={editor.icon} onChange={e=>setEditor({...editor,icon:e.target.value})}/></label>
    <label>Fulfillment<select value={editor.kind} onChange={e=>setEditor({...editor,kind:e.target.value})}><option value="manual">Manual · Huy fulfills</option><option value="extra_pull">Automatic · +1 Mystery Token</option></select></label>
    <label className="mystery-checkbox"><input type="checkbox" checked={editor.active} onChange={e=>setEditor({...editor,active:e.target.checked})}/> Active</label>
    <button className="mystery-primary" disabled={disabled}>Save prize</button><button type="button" className="mystery-secondary" disabled={busy} onClick={()=>setEditor(null)}>Cancel</button>
   </form>{selectedPrize&&<form className="mystery-admin-form" onSubmit={e=>{e.preventDefault();save({action:'stock',id:selectedPrize.id,revision:selectedPrize.revision,delta:Number(stock)*(stockDirection==='add'?1:-1)});}}><h3>Adjust stock · {selectedPrize.inventory} remaining</h3><label>Inventory action<select value={stockDirection} onChange={e=>setStockDirection(e.target.value)}><option value="add">Add inventory</option><option value="subtract">Subtract inventory</option></select></label><label>Quantity<input required type="number" min="1" max="1000000" step="1" value={stock} onChange={e=>setStock(e.target.value)}/></label><button className="mystery-primary" disabled={disabled}>Save inventory change</button></form>}</div>}
   <div className="mystery-prize-grid">{data.prizes.map(p=><article className="mystery-prize-card" key={p.id}><span aria-hidden="true">{p.icon}</span><div><h3>{p.name}</h3><p>{p.description}</p><strong className="mystery-status">{p.inventory===0?'OUT OF STOCK':`${p.inventory} remaining`} · {p.active?'Active':'Inactive'}</strong><button className="mystery-secondary" disabled={disabled} onClick={()=>{setEditor({...p});setStock('1');}}>Edit {p.name}</button></div></article>)}</div>
  </section>}
  {data&&tab==='history'&&<section><h2>Prizes & permanent history</h2><label className="mystery-history-filter">Show<select value={waiting?'waiting':'all'} onChange={e=>setWaiting(e.target.value==='waiting')}><option value="waiting">Outstanding prizes</option><option value="all">All pull history</option></select></label>
   {!rows.length&&<p className="mystery-empty">{waiting?'No prizes waiting for fulfillment.':'No pulls yet.'}</p>}
   <div className="mystery-prize-grid">{rows.map(w=><article className="mystery-prize-card" key={w.id}><span aria-hidden="true">{w.prize_icon}</span><div><h3>{w.prize_name}</h3><strong>{w.school_name} · {w.location_code}</strong><p>{w.prize_description}</p><p>Won {dateLabel(w.won_at)} · {w.token_used} token used</p><strong className="mystery-status">{w.status==='received'?'Received / Fulfilled ✓':'Waiting'}</strong>{w.fulfilled_at&&<small>Fulfilled {dateLabel(w.fulfilled_at)}</small>}{w.status==='waiting'&&w.prize_kind==='manual'&&<button className="mystery-primary" disabled={disabled} onClick={()=>save({action:'fulfill',id:w.id})}>Mark received / fulfilled</button>}</div></article>)}</div>
   {more&&<button className="mystery-secondary" disabled={busy} onClick={older}>Load older history</button>}
  </section>}
 </div>;
}
