import React, { useEffect, useRef, useState } from 'react';

export default function DeleteDraftButton({ disabled, onDelete }) {
  const [open,setOpen]=useState(false);
  const dialog=useRef(null);
  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
  return <><button type="button" disabled={disabled} onClick={()=>setOpen(true)}>Delete</button>
    <dialog ref={dialog} aria-label="Delete this draft?" onCancel={e=>{if(disabled)e.preventDefault();else setOpen(false);}} style={{maxWidth:'min(440px, 90vw)',border:'1px solid #aebdcd',borderRadius:12,padding:24}}>
      <h3>Delete this draft?</h3>
      <p>This will remove the unfinished monitoring. You can start a new monitoring again from the monitoring box.</p>
      <div className="sm-actions"><button type="button" autoFocus disabled={disabled} onClick={()=>setOpen(false)}>Cancel</button><button type="button" className="sm-primary" disabled={disabled} onClick={async()=>{await onDelete();setOpen(false);}}>Delete Draft</button></div>
    </dialog>
  </>;
}
