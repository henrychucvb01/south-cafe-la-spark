import React,{useEffect,useRef,useState} from 'react';
// Normalized vector strokes follow the existing monitoring signature format.
export default function BreakfastSignature({value,onChange,disabled}){
 const canvas=useRef(null),strokes=useRef([]),pointer=useRef(null);const [ink,setInk]=useState(false);
 function paint(){const c=canvas.current;if(!c)return;const r=c.getBoundingClientRect(),ctx=c.getContext('2d');if(!ctx)return;const ratio=window.devicePixelRatio||1;c.width=Math.max(1,r.width*ratio);c.height=Math.max(1,r.height*ratio);ctx.scale(ratio,ratio);ctx.strokeStyle='#142d4e';ctx.lineWidth=2.5;ctx.lineCap='round';for(const line of strokes.current){ctx.beginPath();line.forEach(([x,y],i)=>i?ctx.lineTo(x*r.width,y*r.height):ctx.moveTo(x*r.width,y*r.height));ctx.stroke();}}
 useEffect(()=>{strokes.current=value?.strokes||[];setInk(Boolean(value));paint();},[value]);
 useEffect(()=>{window.addEventListener('resize',paint);return()=>window.removeEventListener('resize',paint);},[]);
 function point(e){const r=canvas.current.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];}
 function start(e){if(disabled||value||pointer.current!==null||strokes.current.length>=80||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();pointer.current=e.pointerId;canvas.current.setPointerCapture(e.pointerId);strokes.current.push([point(e)]);}
 function move(e){if(pointer.current!==e.pointerId||disabled||value)return;const line=strokes.current.at(-1);if(line.length>=1500||strokes.current.reduce((n,s)=>n+s.length,0)>=4000)return;line.push(point(e));setInk(true);paint();}
 function end(e){if(pointer.current!==e.pointerId)return;pointer.current=null;if(canvas.current.hasPointerCapture(e.pointerId))canvas.current.releasePointerCapture(e.pointerId);}
 function clear(){strokes.current=[];pointer.current=null;setInk(false);onChange(null);paint();}
 return <section className="ba-signature"><h3>Teacher’s signature</h3><p>Review attendance and meals, then sign below.</p><canvas ref={canvas} aria-label="Teacher signature drawing area" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={()=>{pointer.current=null;}}/><div className="ba-actions"><button type="button" disabled={disabled} onClick={clear}>{value?'Sign Again':'Clear'}</button><button type="button" disabled={disabled||!ink||Boolean(value)} onClick={()=>onChange({strokes:strokes.current.filter(s=>s.length>1).map(s=>s.map(p=>[...p])),acceptedAt:new Date().toISOString()})}>Accept signature</button></div>{value&&<p role="status">Signature accepted. Changes to your counts require signing again.</p>}</section>;
}
