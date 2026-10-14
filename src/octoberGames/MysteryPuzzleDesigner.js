import React,{useState} from 'react';

export default function MysteryPuzzleDesigner({photo,pieces,costs,onCost,onShuffle}){
 const [selected,setSelected]=useState(0),[preview,setPreview]=useState(false),[revealed,setRevealed]=useState([]);
 const index=Math.min(selected,pieces.length-1);
 const choose=i=>preview?setRevealed(old=>[...new Set([...old,i])]):setSelected(i);
 return <section className="mc-designer" aria-label="Puzzle designer"><div className="mc-actions"><button type="button" onClick={()=>{onShuffle();setRevealed([]);}} disabled={preview}>Shuffle Shapes</button><button type="button" onClick={()=>{setPreview(!preview);setRevealed([]);}}>{preview?'Return to editing':'Preview as Manager'}</button></div>
 <p>{preview?'Preview only. Select pieces to reveal them. No points, credits, guesses or live progress are changed.':'Select a piece to adjust its reveal cost. Shapes and costs lock when the collection is activated.'}</p>
 <div className="mc-puzzle">{photo?<img src={photo} alt={preview?'Mystery preview':'Puzzle design photograph'}/>:<div className="mc-photo-placeholder">Choose a photo to preview it here</div>}
 <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="Mystery pieces">{pieces.map((piece,i)=>{if(preview&&revealed.includes(i))return null;const x=piece.reduce((v,p)=>v+p[0],0)/piece.length,y=piece.reduce((v,p)=>v+p[1],0)/piece.length;return <g key={i} role="button" tabIndex={0} aria-label={`Piece ${i+1}: ${costs[i]} credits`} aria-pressed={!preview&&index===i} onClick={()=>choose(i)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(i);}}}><polygon className={preview?'is-covered':index===i?'is-selected':''} points={piece.map(p=>p.join(',')).join(' ')}/><text x={x} y={y} textAnchor="middle" dominantBaseline="central">{costs[i]}</text></g>;})}</svg></div>
 {!preview&&<label>Piece {index+1} reveal cost<select value={costs[index]||1} onChange={e=>onCost(index,Number(e.target.value))}>{[1,2,3,4,5].map(n=><option value={n} key={n}>{n} {n===1?'credit':'credits'}</option>)}</select></label>}
 </section>;
}
