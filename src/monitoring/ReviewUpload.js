import React, { useEffect, useState } from 'react';
import PdfUploadPicker from './PdfUploadPicker';
import { recordLabel } from './types';
import PdfMarkupViewer from '../supperMonitoring/PdfMarkupViewer';
import { previewUpload } from '../supperMonitoring/service';

export default function ReviewUpload({ token, metadata, school, siteName, files, onFiles, busy, error, onBack, onSubmit }) {
  const [preview,setPreview]=useState(null);
  const [previewError,setPreviewError]=useState('');
  const [ready,setReady]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let cancelled=false;
    setPreview(null);setPreviewError('');setReady(false);setConfirmed(false);
    if(files.length)previewUpload(token,files).then(bytes=>{if(!cancelled)setPreview({files,bytes});}).catch(e=>{if(!cancelled)setPreviewError(e.message);});
    return ()=>{cancelled=true;};
  },[token,files,retry]);
  const current=preview?.files===files;
  function changeFiles(value){setReady(false);setConfirmed(false);setPreview(null);onFiles(value);}
  return <section className="sm-card">
    <h2>Review Your Monitoring</h2>
    <p><strong>{school.school_name} · {recordLabel({monitoring_type:metadata.monitoringType,monitoring_number:metadata.monitoringNumber,monitoring_slot:metadata.monitoringSlot,monitoring_site_name:siteName})}</strong> · {metadata.monitoringDate}</p>
    <p>Review the document below before submitting. Make sure you uploaded the correct monitoring and the pages are in the correct order.</p>
    {error && <p role="alert" className="sm-error">{error}</p>}
    <fieldset className="sm-editor" disabled={busy}>
      <h3>File order</h3>
      <PdfUploadPicker files={files} onChange={changeFiles} disabled={busy}/>
      <button type="button" onClick={()=>changeFiles([])}>Replace File(s)</button>
      {previewError && <div role="alert"><p className="sm-error">{previewError}</p><button type="button" onClick={()=>setRetry(n=>n+1)}>Retry Preview</button></div>}
      {!previewError && files.length>0 && !current && <p role="status">Preparing your monitoring preview…</p>}
      {current && <PdfMarkupViewer bytes={preview.bytes} annotations={[]} onReady={setReady}/>}
      <label className="sm-check"><input type="checkbox" checked={confirmed} disabled={!current||!ready} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed the monitoring and the correct document/pages are attached.</label>
      <div className="sm-actions"><button type="button" onClick={onBack}>Back to Upload</button><button type="button" className="sm-primary" disabled={!current||!ready||!confirmed} onClick={()=>onSubmit(preview.bytes)}>Submit for Supervisor Review</button></div>
    </fieldset>
  </section>;
}
