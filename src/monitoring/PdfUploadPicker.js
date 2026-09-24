import React, { useId, useState } from 'react';

export default function PdfUploadPicker({ files, onChange, disabled }) {
  const id = useId();
  const [error, setError] = useState('');
  function add(incoming) {
    if (disabled) return;
    const next = [...files, ...Array.from(incoming)];
    if (next.length > 2) { setError('Choose no more than 2 PDFs. Remove a file before adding another.'); return; }
    if (next.some(file => !/\.pdf$/i.test(file.name))) { setError('Choose PDF files only.'); return; }
    if (next.reduce((size, file) => size + file.size, 0) > 2097152) { setError('The selected PDFs must total no more than 2 MB.'); return; }
    setError(''); onChange(next);
  }
  return <div className="sm-dropzone" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();add(e.dataTransfer.files);}}>
    <label htmlFor={id}>Upload PDF(s)</label>
    <input id={id} type="file" accept="application/pdf,.pdf" multiple disabled={disabled} onChange={e=>{add(e.target.files);e.target.value='';}}/>
    <p>Select or drop 1 or 2 PDFs. You can add files one at a time. Up to 2 MB total and 20 combined pages.</p>
    {error && <p className="sm-error" role="alert">{error}</p>}
    <ol aria-label="PDF upload order">{files.map((file,index)=><li key={index}>
      <span style={{overflowWrap:'anywhere'}}>{file.name}</span>{' '}
      <button type="button" disabled={disabled} aria-label={`Remove PDF ${index+1}`} onClick={()=>{setError('');onChange(files.filter((_,i)=>i!==index));}}>Remove</button>
    </li>)}</ol>
    {files.length===2 && <><button type="button" disabled={disabled} onClick={()=>onChange([files[1],files[0]])}>Swap PDF order</button><p>These PDFs will be combined in the order shown into one monitoring document.</p></>}
  </div>;
}
