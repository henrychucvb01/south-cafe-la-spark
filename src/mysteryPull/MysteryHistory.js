import React from 'react';
import {dateLabel} from './service';

export default function MysteryHistory({rows,disabled,onFulfill}) {
 return <div className="mystery-history-list" aria-label="Prize history records">
  {rows.map(w=><details className="mystery-history-record" key={w.id}>
   <summary>
    <strong className="mystery-history-prize"><span aria-hidden="true">{w.prize_icon}</span> {w.prize_name}</strong>
    <span>{w.school_name} · {w.location_code}</span>
    <time dateTime={w.won_at}>{dateLabel(w.won_at)}</time>
    <strong className="mystery-history-status">{w.status==='received'?'Received / Fulfilled ✓':'Waiting'}</strong>
   </summary>
   <div className="mystery-history-detail">
    <p><strong>Pull #{w.id}</strong> · {w.token_used} token used</p>
    <p>{w.prize_description}</p>
    <p>Won {dateLabel(w.won_at)}</p>
    {w.points_awarded>0&&<p>+{w.points_awarded} SPARK points credited to this school</p>}
    {w.bonus_tokens>0&&<p>+{w.bonus_tokens} extra pull added</p>}
    {w.fulfilled_at&&<p>Marked fulfilled {dateLabel(w.fulfilled_at)}</p>}
    {w.status==='waiting'&&w.prize_kind==='manual'&&<button className="mystery-primary" disabled={disabled} onClick={()=>onFulfill(w.id)}>Mark received / fulfilled</button>}
   </div>
  </details>)}
 </div>;
}
