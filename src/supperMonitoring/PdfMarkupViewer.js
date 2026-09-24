import React, { useEffect, useRef, useState } from 'react';
import { loadPdfLibrary } from './pdfViewerLoader';

// Coordinates are fractions of the displayed page (including its PDF rotation).
// Re-rendering at another zoom never changes a saved marker's PDF location.
export default function PdfMarkupViewer({ bytes, annotations, onChange, editable=false, onReady }) {
  const canvas = useRef(null);
  const drawing = useRef(null);
  const [document,setDocument] = useState(null);
  const [page,setPage] = useState(1);
  const [zoom,setZoom] = useState(1);
  const [size,setSize] = useState({width:700,height:900});
  const [tool,setTool] = useState('scroll');
  const [stroke,setStroke] = useState([]);
  const [marker,setMarker] = useState(null);
  const [text,setText] = useState('');
  const [ready,setReady] = useState(false);
  const [error,setError] = useState('');
  useEffect(() => {
    let cancelled=false,task;
    setDocument(null);setPage(1);setError('');setReady(false);setMarker(null);
    (async()=>{
      const pdf=await loadPdfLibrary();
      if(cancelled)return;
      task=pdf.getDocument({data:bytes.slice(),isEvalSupported:false,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/'});
      const loaded=await task.promise;
      if(!cancelled)setDocument(loaded);
    })().catch(e=>{if(!cancelled)setError('The PDF could not be displayed: '+e.message);});
    return ()=>{cancelled=true;task?.destroy();};
  },[bytes]);
  useEffect(()=>{
    if(!document)return;
    let cancelled=false,render;
    setReady(false);onReady?.(false);setMarker(null);setStroke([]);drawing.current=null;
    (async()=>{
      const pdfPage=await document.getPage(page);
      if(cancelled)return;
      const original=pdfPage.getViewport({scale:1});
      const viewport=pdfPage.getViewport({scale:700*zoom/original.width});
      const ratio=Math.min(window.devicePixelRatio||1,2);
      canvas.current.width=Math.ceil(viewport.width*ratio);canvas.current.height=Math.ceil(viewport.height*ratio);
      setSize({width:viewport.width,height:viewport.height});
      render=pdfPage.render({canvasContext:canvas.current.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]});
      await render.promise;if(!cancelled){setReady(true);onReady?.(true);}
    })().catch(e=>{if(!cancelled && e.name!=='RenderingCancelledException')setError('This PDF page could not be displayed: '+e.message);});
    return ()=>{cancelled=true;render?.cancel();};
  },[document,page,zoom,onReady]);
  function position(event){const b=event.currentTarget.getBoundingClientRect();return [Math.max(0,Math.min(1,(event.clientX-b.left)/b.width)),Math.max(0,Math.min(1,(event.clientY-b.top)/b.height))];}
  function pointerDown(event){
    if(!editable || !ready || event.button!==0 || annotations.length>=200)return;
    if(tool==='comment'){setMarker(position(event));setText('');}
    if(tool==='draw'){event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drawing.current={id:event.pointerId,points:[position(event)]};setStroke(drawing.current.points);}
  }
  function pointerMove(event){if(!drawing.current || drawing.current.id!==event.pointerId)return;const points=drawing.current.points;if(points.length<1000){points.push(position(event));setStroke([...points]);}}
  function pointerUp(event){if(!drawing.current || drawing.current.id!==event.pointerId)return;const points=drawing.current.points;drawing.current=null;setStroke([]);if(points.length>1)onChange([...annotations,{type:'draw',page,points}]);}
  const points=value=>value.map(([x,y])=>`${x*size.width},${y*size.height}`).join(' ');
  return <div className="sm-pdf-viewer">
    <div className="sm-actions sm-pdf-toolbar">
      <button type="button" disabled={!document||page===1} onClick={()=>setPage(page-1)}>Previous Page</button>
      <label>PDF page<select aria-label="PDF page" value={page} disabled={!document} onChange={e=>setPage(Number(e.target.value))}>{Array.from({length:document?.numPages||1},(_,i)=><option value={i+1} key={i}>{i+1}</option>)}</select></label>
      <span>of {document?.numPages||'…'}</span>
      <button type="button" disabled={!document||page===document.numPages} onClick={()=>setPage(page+1)}>Next Page</button>
      <label>Zoom<select aria-label="PDF zoom" value={zoom} onChange={e=>setZoom(Number(e.target.value))}>{[.5,.75,1,1.25,1.5,2].map(z=><option value={z} key={z}>{z*100}%</option>)}</select></label>
    </div>
    {editable && <div className="sm-actions" role="group" aria-label="PDF markup tools">{[['scroll','Scroll'],['comment','Location Comment'],['draw','Draw']].map(([key,label])=><button type="button" key={key} aria-pressed={tool===key} onClick={()=>{setTool(key);setMarker(null);}}>{label}</button>)}<button type="button" disabled={!annotations.length} onClick={()=>onChange(annotations.slice(0,-1))}>Undo Last Mark</button></div>}
    {editable && <p>{tool==='comment'?'Click the PDF where the comment belongs, then enter your comment below.':tool==='draw'?'Draw on the PDF with a mouse, finger or pen. Switch to Scroll to move around the page.':'Scroll around the page or choose a markup tool.'}</p>}
    {error && <p role="alert" className="sm-error">{error}</p>}
    {!ready && !error && <p role="status">Loading PDF page…</p>}
    <div className="sm-pdf-scroll" aria-label="PDF document" tabIndex={0}>
      <div className="sm-pdf-sheet" style={{width:size.width,height:size.height}}>
        <canvas ref={canvas} aria-label={`PDF page ${page} content`} style={{width:'100%',height:'100%'}}/>
        <svg className="sm-pdf-overlay" aria-label={`Markup on PDF page ${page}`} viewBox={`0 0 ${size.width} ${size.height}`} style={{touchAction:editable&&tool!=='scroll'?'none':'auto',cursor:editable&&tool!=='scroll'?'crosshair':'auto'}} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{drawing.current=null;setStroke([]);}}>
          {annotations.map((a,i)=>a.page!==page?null:a.type==='draw'?<polyline key={i} points={points(a.points)} fill="none" stroke="#c92127" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>:<g key={i}><title>{a.text}</title><circle cx={a.x*size.width} cy={a.y*size.height} r="13" fill="#a81921" stroke="white" strokeWidth="2"/><text x={a.x*size.width} y={a.y*size.height+4} textAnchor="middle" fill="white" fontSize="12">{i+1}</text></g>)}
          {!!stroke.length && <polyline points={points(stroke)} fill="none" stroke="#c92127" strokeWidth="3"/>}
          {marker && <circle cx={marker[0]*size.width} cy={marker[1]*size.height} r="10" fill="none" stroke="#174681" strokeWidth="3"/>}
        </svg>
      </div>
    </div>
    {marker && editable && <div className="sm-subcard"><label>Location comment<textarea value={text} maxLength={2000} onChange={e=>setText(e.target.value)} autoFocus/></label><div className="sm-actions"><button type="button" disabled={!text.trim()} onClick={()=>{onChange([...annotations,{type:'comment',page,x:marker[0],y:marker[1],text:text.trim()}]);setMarker(null);}}>Add Location Comment</button><button type="button" onClick={()=>setMarker(null)}>Cancel Marker</button></div></div>}
    <ol className="sm-mark-list" aria-label="PDF location comments and drawings">{annotations.map((a,i)=><li key={i}><button type="button" onClick={()=>setPage(a.page)}>Mark {i+1} · Page {a.page}</button> {a.type==='comment'?a.text:'Freehand drawing'}{editable && <button type="button" aria-label={`Remove mark ${i+1}`} onClick={()=>onChange(annotations.filter((_,j)=>j!==i))}>Remove</button>}</li>)}</ol>
    {editable && annotations.length>=200 && <p className="sm-notice">This review has 200 marks. Remove a mark before adding another.</p>}
  </div>;
}
