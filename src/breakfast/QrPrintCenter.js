import React,{useEffect,useRef,useState} from 'react';
import {classroomQr} from './service';
import {teacherLink} from './TeacherPage';
import {buildQrPrintPdf,qrPrintDefaults} from './qrPrintPdf';
export default function QrPrintCenter({token,classrooms}){
 const [selected,setSelected]=useState([]),[options,setOptions]=useState(qrPrintDefaults),[filename,setFilename]=useState('BIC-classroom-QR-labels'),[url,setUrl]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
 const cache=useRef(new Map()),frame=useRef(null);
 const rows=classrooms.filter(r=>r.active).sort((a,b)=>(a.campus_label||'').localeCompare(b.campus_label||'')||a.room_code.localeCompare(b.room_code,undefined,{numeric:true}));
 useEffect(()=>{cache.current.clear();setSelected([]);},[token]);
 useEffect(()=>{
  let cancelled=false,objectUrl='';setUrl('');setReady(false);setError('');if(!selected.length){setBusy(false);return;}setBusy(true);
  const timer=setTimeout(async()=>{try{
   const records=[];for(const record of classrooms.filter(r=>selected.includes(r.id)).sort((a,b)=>(a.campus_label||'').localeCompare(b.campus_label||'')||a.room_code.localeCompare(b.room_code,undefined,{numeric:true}))){
    if(cancelled)return;let qr=cache.current.get(record.id);if(!qr){qr=await classroomQr(token,record.id);if(cancelled)return;cache.current.set(record.id,qr);}records.push({...record,url:teacherLink(qr)});
   }
   const bytes=await buildQrPrintPdf(records,options);if(cancelled)return;objectUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));setUrl(objectUrl);
  }catch(e){if(!cancelled)setError(e.message);}finally{if(!cancelled)setBusy(false);}},300);
  return()=>{cancelled=true;clearTimeout(timer);if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[token,classrooms,selected,options]);
 const change=(key,value)=>{setUrl('');setOptions(o=>({...o,[key]:value}));};
 const toggle=id=>{setUrl('');setSelected(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);};
 function print(){try{frame.current.contentWindow.focus();frame.current.contentWindow.print();}catch{setError('Use the print icon in the PDF preview, or open the print view to print without downloading.');}}
 return <section className="ba-panel"><h2>QR Print Center</h2><p>Choose classrooms and arrange their permanent QR labels. Only the QR code, room number, and optional campus appear on the printed page.</p><div className="ba-qr-print-grid"><div><h3>Classrooms</h3><div className="ba-actions"><button onClick={()=>{setUrl('');setSelected(rows.map(r=>r.id));}}>Select all</button><button onClick={()=>setSelected([])}>Clear</button></div><div className="ba-qr-pick">{rows.map(r=><label className="ba-check" key={r.id}><input type="checkbox" checked={selected.includes(r.id)} onChange={()=>toggle(r.id)}/>{r.room_code}{r.campus_label?` · ${r.campus_label}`:''}</label>)}{!rows.length&&<p>Add an active classroom first.</p>}</div><p>{selected.length} selected</p></div><div><div className="ba-fields">
 <label>Page orientation<select value={options.orientation} onChange={e=>change('orientation',e.target.value)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
 <label>Labels per page<select value={options.perPage} onChange={e=>change('perPage',Number(e.target.value))}>{[1,2,4,6].map(n=><option key={n}>{n}</option>)}</select></label>
 <label>Arrangement<select value={options.layout} onChange={e=>change('layout',e.target.value)}><option value="vertical">Stacked (top to bottom)</option><option value="horizontal">Side by side (left to right)</option></select></label>
 <label>Item order<select value={options.order} onChange={e=>change('order',e.target.value)}>{['qr,room,campus','room,qr,campus','room,campus,qr','qr,campus,room','campus,room,qr','campus,qr,room'].map(v=><option key={v} value={v}>{v.split(',').map(x=>x==='qr'?'QR':x==='room'?'Room number':'Campus').join(' → ')}</option>)}</select></label>
 {[['qrSize','QR size (points)',72,250],['fontSize','Room font size',12,100],['campusSize','Campus font size',10,60]].map(([key,label,min,max])=><label key={key}>{label}: {options[key]}<input type="range" min={min} max={max} value={options[key]} onChange={e=>change(key,Number(e.target.value))}/></label>)}
 <label>Space between items: {options.spacing} pt<input type="range" min="0" max="100" value={options.spacing} onChange={e=>change('spacing',Number(e.target.value))}/></label>
 <label className="ba-check"><input type="checkbox" checked={options.doubleText} onChange={e=>change('doubleText',e.target.checked)}/>2× text size</label>
 <label className="ba-check"><input type="checkbox" checked={options.doubleQr} onChange={e=>change('doubleQr',e.target.checked)}/>2× QR size</label>
 {[['qrRotation','Rotate QR'],['textRotation','Rotate room / campus']].map(([key,label])=><label key={key}>{label}<select value={options[key]} onChange={e=>change(key,Number(e.target.value))}>{[0,90,180,270].map(n=><option key={n} value={n}>{n}°</option>)}</select></label>)}
 <label className="ba-check"><input type="checkbox" checked={options.showCampus} onChange={e=>change('showCampus',e.target.checked)}/>Include campus</label></div><p className="ba-small">Letter paper. Lower spacing brings the items closer. The 2× options double the selected sizes; the entire label scales down only if needed to fit. Use fewer labels per page for larger text or QR codes. Print at actual size / 100%.</p></div></div>
 {error&&<p className="ba-error" role="alert">{error}</p>}{busy&&<p role="status">Preparing classroom previews…</p>}
 <label className="ba-report-classroom">PDF filename<input maxLength={120} value={filename} onChange={e=>setFilename(e.target.value)}/></label>
 <div className="ba-actions ba-batch-actions"><button className="ba-primary" disabled={!url||busy||!ready} onClick={print}>Print</button>{url&&!busy&&<><a href={url} target="_blank" rel="noreferrer">Open print view</a><a href={url} download={`${(filename.trim()||'BIC-classroom-QR-labels').replace(/[<>:"/\\|?*]/g,'-').replace(/\.pdf$/i,'')}.pdf`}>Download PDF</a></>}</div>
 {url&&!busy?<iframe ref={frame} className="ba-print-preview" title="Classroom QR print preview" onLoad={()=>setReady(true)} src={url}/>:!busy&&!error&&<p>Select classrooms to see the print preview.</p>}
 </section>;
}
