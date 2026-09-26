import React,{useRef,useState} from 'react';
export default function PullControl({disabled,onPull}) {
 const [position,setPosition]=useState(0),drag=useRef(null),track=useRef(null),positionRef=useRef(0);
 const move=value=>{positionRef.current=value;setPosition(value);};
 function start(e){if(disabled||drag.current||e.button!==0)return;const box=track.current.getBoundingClientRect();if(e.clientY-box.top>80)return;drag.current={pointer:e.pointerId,start:e.clientY,distance:box.height-76};track.current.setPointerCapture(e.pointerId);move(0);}
 function update(e){if(!drag.current||drag.current.pointer!==e.pointerId)return;move(Math.max(0,Math.min(100,(e.clientY-drag.current.start)/drag.current.distance*100)));}
 function end(e){if(!drag.current||drag.current.pointer!==e.pointerId)return;const completed=positionRef.current>=100;drag.current=null;move(0);if(completed&&!disabled)onPull();}
 function key(e){if(disabled)return;if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='End'?100:e.key==='Home'?0:Math.max(0,Math.min(100,positionRef.current+(e.key==='ArrowDown'?10:-10)));move(next);if(next===100){move(0);onPull();}}}
 return <div className="mystery-pull-control"><div ref={track} role="slider" tabIndex={disabled?-1:0} aria-label="Pull down to reveal a prize" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(position)} aria-valuetext={`${Math.round(position)} percent pulled`} aria-disabled={disabled} aria-describedby="mystery-pull-help" className={`mystery-track ${disabled?'disabled':''}`} onPointerDown={start} onPointerMove={update} onPointerUp={end} onPointerCancel={()=>{drag.current=null;move(0);}} onLostPointerCapture={()=>{drag.current=null;move(0);}} onKeyDown={key}>
  <span className="mystery-track-word" aria-hidden="true">PULL<br/>↓<br/>↓</span><span className="mystery-track-end" aria-hidden="true">REVEAL</span>
  <span className="mystery-handle" style={{top:`calc(${position}% - ${position*.76}px)`}} aria-hidden="true"><span>⋮⋮</span> PULL ↓</span>
 </div><p id="mystery-pull-help">Slide all the way down, then release.<br/><span>Keyboard: ↓ to move, End to complete.</span></p></div>;
}
