import { typeLabel, siteLabel } from "../monitoring/types";
import React, { useEffect, useState } from 'react';
import PdfMarkupViewer from './PdfMarkupViewer';
import { pdfReviews, reportBytes, savePdfReview } from './service';
import { SLOTS, STATUSES } from './workflow';

export default function PdfReviewWorkspace({ token, initialRecord, school, supervisor=false, onBack }) {
  const [record,setRecord]=useState(initialRecord);
  const [reviews,setReviews]=useState([]);
  const [version,setVersion]=useState(initialRecord.document_version);
  const [bytes,setBytes]=useState(null);
  const [annotations,setAnnotations]=useState([]);
  const [comment,setComment]=useState(initialRecord.review_comments||'');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [dirty,setDirty]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const editable=supervisor && !record.locked && ['submitted','corrections_requested'].includes(record.status) && version===record.document_version;
  useEffect(()=>{
    let cancelled=false;setLoading(true);setError('');setBytes(null);
    Promise.all([pdfReviews(token,record.id),reportBytes(token,record,version)]).then(([items,data])=>{
      if(cancelled)return;
      const review=items.find(r=>r.document_version===version);
      setReviews(items);setAnnotations(review?.annotations||[]);
      setComment(version===record.document_version ? record.review_comments||'' : review?.comments||'');
      setBytes(data);setDirty(false);
    }).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
    // A saved revision does not reload or erase work; changing the PDF version does.
  },[token,record.id,record.document_version,version]);
  useEffect(()=>{const warn=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  function mayLeave(){return !dirty || window.confirm('Discard unsaved PDF comments and markup?');}
  async function save(action){
    setBusy(true);setError('');setNotice('');
    try {
      const saved=await savePdfReview(token,record,annotations,comment,action);
      setRecord(saved);setDirty(false);
      setNotice(action==='accept'?'Monitoring accepted and locked.':action==='return'?'Returned to the Manager for correction.':'PDF comments and markup saved.');
      setReviews(items=>[{document_version:saved.document_version,annotations,comments:comment},...items.filter(r=>r.document_version!==saved.document_version)]);
    }catch(e){setError(e.message+' Your unsaved review remains on this screen.');}finally{setBusy(false);}
  }
  const versions=[...new Set([record.document_version,...reviews.map(r=>r.document_version)])].sort((a,b)=>b-a);
  return <section className="sm-card sm-review-workspace">
    <div className="sm-actions"><button type="button" disabled={busy} onClick={()=>{if(mayLeave())onBack();}}>Back to Monitorings</button></div>
    <h2>{supervisor?'Supervisor PDF Review':'PDF & Supervisor Markup'}</h2>
    <p><strong>{school.school_name} · {typeLabel(record.monitoring_type)} · {siteLabel(record)}</strong> · {SLOTS[record.monitoring_slot]} · {record.monitoring_date} · {record.school_year}</p>
    <p><strong>{STATUSES[record.status]}</strong> · Monitor: {record.payload?.monitorName || record.created_by_name}</p>
    {error && <p role="alert" className="sm-error">{error}</p>}
    {notice && <p role="status" className="sm-notice">{notice}</p>}
    <label>PDF version<select aria-label="PDF version" disabled={busy||loading} value={version} onChange={e=>{if(mayLeave()){setVersion(Number(e.target.value));setNotice('');}}}>{versions.map(v=><option value={v} key={v}>Version {v}{v===record.document_version?' — Current PDF':' — Previous reviewed PDF'}</option>)}</select></label>
    {version!==record.document_version && <p className="sm-notice">These comments and marks belong to the previous PDF shown here. They are not applied to the replacement PDF.</p>}
    <label>Supervisor comments<textarea aria-label="Supervisor comments" rows={4} maxLength={4000} value={comment} disabled={busy||loading} readOnly={!editable} onChange={e=>{setComment(e.target.value);setDirty(true);}}/></label>
    {loading && <p role="status">Opening the stored PDF and review…</p>}
    {bytes && <fieldset className="sm-editor" disabled={busy}><PdfMarkupViewer key={version} bytes={bytes} annotations={annotations} editable={editable&&!busy} onChange={value=>{setAnnotations(value);setDirty(true);setNotice('');}}/></fieldset>}
    {editable && <div className="sm-actions"><button type="button" disabled={busy||loading||!bytes} onClick={()=>save('save')}>Save Comments & Markup</button>{record.status==='submitted' && <><button type="button" disabled={busy||loading||!bytes||!comment.trim()} onClick={()=>save('return')}>Return for Correction</button><button type="button" className="sm-primary" disabled={busy||loading||!bytes} onClick={()=>save('accept')}>Accept & Lock</button></>}</div>}
    {editable && <p>{dirty?'Unsaved review changes. Save before leaving.':'Review changes are saved with this PDF version.'} Add a Supervisor comment explaining any return for correction.</p>}
    {!editable && <p>Comments and markup are read-only.{supervisor&&record.locked?' Unlock the monitoring from its history to make corrections.':''}</p>}
  </section>;
}
