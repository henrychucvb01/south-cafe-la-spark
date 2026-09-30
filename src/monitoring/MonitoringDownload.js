import React, { useState } from 'react';
import { hasCurrentPdf, typeLabel, siteLabel, SUPPER_SEQUENCE } from './types';
import { openSupervisorSession, closeSession, getMonitoring, reportBytes } from '../supperMonitoring/service';

export function pdfFilename(value) {
  const name = String(value || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\.pdf$/i, '').trim().replace(/[. ]+$/, '').slice(0, 180);
  return `${name || 'Monitoring'}.pdf`;
}
export function monitoringFilename(record, school) {
  const number = record?.monitoring_number || ((record?.monitoring_type || 'supper') === 'supper' ? SUPPER_SEQUENCE[record?.monitoring_slot] : null);
  const site = siteLabel(record);
  return pdfFilename(`${typeLabel(record?.monitoring_type)}${number ? ` ${number}` : ''}-${school.school_name}${site === 'Main Site' ? '' : `-${site}`}`);
}

export default function MonitoringDownload({ record, school, supervisorPin }) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canChooseFolder = typeof window.showSaveFilePicker === 'function';
  const missing = 'There is no monitoring PDF available to download for this school.';
  function open() {
    setError(''); setMessage('');
    if (!hasCurrentPdf(record)) { setError(missing); return; }
    setName(monitoringFilename(record, school)); setExpanded(true);
  }
  async function save() {
    setBusy(true); setError(''); setMessage('');
    let token;
    try {
      // Open the native chooser during the click, before any network request.
      const handle = canChooseFolder ? await window.showSaveFilePicker({ suggestedName: pdfFilename(name), types: [{ description: 'Monitoring PDF', accept: { 'application/pdf': ['.pdf'] } }] }) : null;
      token = await openSupervisorSession(school, supervisorPin);
      const current = await getMonitoring(token, record.id);
      if (!hasCurrentPdf(current)) throw new Error(missing);
      const bytes = await reportBytes(token, current);
      if (handle) {
        const writer = await handle.createWritable();
        try { await writer.write(new Blob([bytes], { type: 'application/pdf' })); await writer.close(); }
        catch (e) { await writer.abort().catch(() => {}); throw e; }
        setMessage('PDF saved.');
      } else {
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        const link = document.createElement('a'); link.href = url; link.download = pdfFilename(name);
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        setMessage('PDF download started.');
      }
      setExpanded(false);
    } catch (e) { if (e.name !== 'AbortError') setError(e.message || 'The PDF could not be downloaded. Please try again.'); }
    finally { if (token) await closeSession(token).catch(() => {}); setBusy(false); }
  }
  return <div style={{ margin: '0.75rem 0' }}>
    {!expanded && <button type="button" onClick={open}>Download PDF</button>}
    {expanded && <div className="sm-editor">
      <label>PDF filename<input value={name} maxLength={184} disabled={busy} onChange={e => setName(e.target.value)} /></label>
      <p>{canChooseFolder ? 'Choose the filename and folder in the save window.' : 'Your browser controls the download folder. To choose a folder each time, enable “Ask where to save each file” in your browser’s download settings.'}</p>
      <div className="sm-actions"><button type="button" className="sm-primary" disabled={busy || !name.trim()} onClick={save}>{busy ? 'Saving…' : canChooseFolder ? 'Save As…' : 'Download PDF'}</button><button type="button" disabled={busy} onClick={() => { setExpanded(false); setError(''); }}>Cancel</button></div>
    </div>}
    {error && <p role="alert" className="sm-error">{error}</p>}
    {message && <p role="status">{message}</p>}
  </div>;
}
