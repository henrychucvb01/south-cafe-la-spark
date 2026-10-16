import React from 'react';
import './sparkGames.css';
export function questHistory(data){
 const drafts=data.games_planning?.drafts||[],waves=data.game_waves||data.games_planning?.waves||[];
 const rows=drafts.filter(d=>d.quest_id&&waves.some(w=>w.id===d.wave_id&&w.state==='released')).map(d=>({...d,released_at:waves.find(w=>w.id===d.wave_id)?.released_at||waves.find(w=>w.id===d.wave_id)?.release_at}));
 for(const q of data.quests||[])if(!q.wave_id&&!rows.some(r=>String(r.quest_id)===String(q.id)))rows.push({...q,id:'legacy-'+q.id,title:q.name,released_at:null});
 return rows.sort((a,b)=>String(b.released_at||'').localeCompare(String(a.released_at||''))||a.title.localeCompare(b.title));
}
export default function QuestHistory({data}){
 const rows=questHistory(data);
 return <section className="sg-history" aria-label="Quest History"><h4>Quest History</h4>{rows.length?<div className="sg-table"><table><thead><tr><th>Quest</th><th>Description</th><th>Points</th><th>Released</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.title}</td><td><span className="sg-history-description" title={r.description}>{r.description}</span></td><td>{r.reward_points??10}</td><td>{r.released_at?new Date(r.released_at).toLocaleDateString('en-US',{timeZone:'America/Los_Angeles'}):'Not recorded'}</td></tr>)}</tbody></table></div>:<p>No released quests yet.</p>}</section>;
}
