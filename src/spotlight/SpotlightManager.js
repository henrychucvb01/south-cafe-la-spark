import React,{useCallback,useEffect,useState} from 'react';
import {CATEGORIES,preparePhoto,spotlightRequest} from './service';
import SpotlightCard from './SpotlightCard';
const blank=()=>({headline:'',body:'',category:'Recognition',photo_path:null,published:false});
export default function SpotlightManager({supervisorPin:pin}){
 const [rows,setRows]=useState([]),[form,setForm]=useState(blank),[photo,setPhoto]=useState(null),[preview,setPreview]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[more,setMore]=useState(false);
 const load=useCallback(async(offset=0)=>{const posts=await spotlightRequest('list',{pin,offset,limit:20});setRows(old=>offset?[...old,...posts]:posts);setMore(posts.length===20);},[pin]);
 useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
 function reset(){setForm(blank());setPhoto(null);setPreview('');}
 function edit(post){setForm(post);setPhoto(null);setPreview(post.photo_url||'');setError('');setMessage('');document.getElementById('spotlight-editor')?.scrollIntoView({block:'start',behavior:'smooth'});}
 async function selectPhoto(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;setBusy(true);setError('');try{const result=await preparePhoto(file);setPhoto({base64:result.base64});setPreview(result.preview);}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function save(published){setBusy(true);setError('');setMessage('');try{await spotlightRequest('save',{pin,id:form.id,revision:form.revision,payload:{headline:form.headline,body:form.body,category:form.category,photo_path:form.photo_path,published},photo});reset();await load();setMessage(published?'Spotlight published. Managers can see it in Daily Bites.':'Unpublished Spotlight saved.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function action(post,action){if(action==='delete'&&!window.confirm(`Delete “${post.headline}”? This removes the post, photo and reactions.`))return;setBusy(true);setError('');setMessage('');try{await spotlightRequest(action,{pin,id:post.id,revision:post.revision});if(form.id===post.id)reset();await load();setMessage(action==='delete'?'Spotlight deleted.':'Spotlight updated.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="dashboard-card spotlight-management"><h3>✦ SPARK Spotlight</h3><p>Share recognition and news with every school in Daily Bites.</p>
  {error&&<p role="alert" className="spotlight-error">{error}</p>}{message&&<p role="status">{message}</p>}
  <form id="spotlight-editor" onSubmit={e=>{e.preventDefault();save(true);}} className="spotlight-editor"><h4>{form.id?'Edit Spotlight':'Create Spotlight'}</h4><fieldset disabled={busy}>
   <label>Headline<input required maxLength={160} value={form.headline} onChange={e=>setForm({...form,headline:e.target.value})}/></label>
   <label>Short message<textarea required maxLength={2000} rows={4} value={form.body} onChange={e=>setForm({...form,body:e.target.value})}/></label>
   <label>Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
   <label>Optional photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto}/><small>JPEG, PNG or WebP. Choose another photo to replace it.</small></label>
   {preview&&<div><img className="spotlight-preview" src={preview} alt="Spotlight photo preview"/><button type="button" onClick={()=>{setPhoto(null);setPreview('');setForm({...form,photo_path:null});}}>Remove photo</button></div>}
   <div className="spotlight-actions"><button className="spotlight-primary" type="submit">{busy?'Saving…':form.published?'Save & Publish Changes':'Publish Spotlight'}</button><button type="button" onClick={()=>save(false)} disabled={!form.headline.trim()||!form.body.trim()}>Save Unpublished</button><button type="button" onClick={reset}>{form.id?'Cancel Edit':'Clear'}</button></div>
  </fieldset></form>
  <h4>Existing Spotlights</h4>{!rows.length&&<p>No Spotlights yet. Create your first announcement above.</p>}
  <div className="spotlight-archive-grid">{rows.map(post=><div key={post.id}><strong className="spotlight-status">{post.published?'Published':'Unpublished'}</strong><SpotlightCard post={post}/><div className="spotlight-actions"><button disabled={busy} onClick={()=>edit(post)}>Edit</button><button disabled={busy} onClick={()=>action(post,post.published?'unpublish':'publish')}>{post.published?'Unpublish':'Publish'}</button><button disabled={busy} onClick={()=>action(post,'delete')}>Delete</button></div></div>)}</div>
  {more&&<button disabled={busy} onClick={()=>load(rows.length).catch(e=>setError(e.message))}>Load older Spotlights</button>}
 </section>;
}
