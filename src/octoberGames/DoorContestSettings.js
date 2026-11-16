import React,{useState} from 'react';

export const doorThemes={
 halloween:{label:'Halloween',title:'Halloween Door Decorating Contest',decor:'✦ 🦇 🎃 ✦',border:'#ffaf46',background:'#472713'},
 autumn:{label:'Autumn / Thanksgiving',title:'Thanksgiving Door Decorating Contest',decor:'🍁 🍂 🍁',border:'#d79032',background:'#59321d'},
 winter:{label:'Winter Holidays',title:'Winter Holiday Door Decorating Contest',decor:'❄ ✨ ❄',border:'#9fdef4',background:'#173653'},
 valentine:{label:'Valentine’s Day',title:'Valentine’s Door Decorating Contest',decor:'♡ ♥ ♡',border:'#ef92b7',background:'#60243d'},
 spring:{label:'Spring',title:'Spring Door Decorating Contest',decor:'🌷 🌼 🌷',border:'#b3d786',background:'#264d37'},
 custom:{label:'Custom Holiday',title:'Holiday Door Decorating Contest',decor:'✦ ✧ ✦',border:'#d9b45f',background:'#293750'}
};
export const doorTheme=cfg=>doorThemes[cfg.door_theme]||doorThemes.halloween;
export function doorStyle(cfg){
 const fallback=doorTheme(cfg),background=/^#[0-9a-f]{6}$/i.test(cfg.door_background||'')?cfg.door_background:fallback.background;
 const rgb=background.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
 const luminance=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
 return {'--door-background':background,'--door-ink':luminance>.179?'#111111':'#ffffff','--door-border':cfg.door_border_color||fallback.border,'--door-border-style':cfg.door_border_style||'double'};
}
const local=value=>{if(!value)return '';const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);};
export default function DoorContestSettings({cfg,run,busy,next}){
 return <><CurrentDoorSettings key={'current-'+cfg.revision} cfg={cfg} run={run} busy={busy}/><NextDoorSettings key={next?.updated_at||'new'} cfg={cfg} next={next} run={run} busy={busy}/></>;
}
function CurrentDoorSettings({cfg,run,busy}){
 const [form,setForm]=useState({door_title:cfg.door_title||doorThemes.halloween.title,door_theme:cfg.door_theme||'halloween',door_state:cfg.door_state,
  door_border_style:cfg.door_border_style||'double',door_border_color:cfg.door_border_color||doorThemes.halloween.border,door_background:cfg.door_background||doorThemes.halloween.background,
  submission_end:local(cfg.submission_end),voting_end:local(cfg.voting_end),door_participation_points:cfg.door_participation_points??10,door_champion_points:cfg.door_champion_points??20});
 const [message,setMessage]=useState('');
 const change=(name,value)=>{setForm(previous=>({...previous,[name]:value}));setMessage('Unsaved changes');};
 function theme(value){const preset=doorThemes[value];setForm(previous=>({...previous,door_theme:value,door_title:preset.title,door_border_color:preset.border,door_background:preset.background}));setMessage('Unsaved changes');}
 async function save(event){event.preventDefault();const submission=new Date(form.submission_end),voting=new Date(form.voting_end);
  if(!Number.isFinite(submission.getTime())||!Number.isFinite(voting.getTime())){setMessage('Enter both closing dates.');return;}
  if(voting<submission){setMessage('Voting must close at or after submissions close.');return;}
  const saved=await run('door_settings',{...form,revision:cfg.revision,submission_end:submission.toISOString(),voting_end:voting.toISOString(),door_participation_points:Number(form.door_participation_points),door_champion_points:Number(form.door_champion_points)});
  setMessage(saved?'Door contest settings saved.':'Not saved. Check the message above and try again.');
 }
 if(cfg.champion)return <details className="og-door-settings" open><summary>Completed decoration contest · {cfg.door_title||'Door Contest'}</summary><p>This contest has a confirmed champion. Its photos, votes, results and awarded points are preserved. Set up your next contest below.</p></details>;
 return <details className="og-door-settings"><summary>Door contest settings · theme, dates & points</summary><form onSubmit={save}>
  <div className="og-door-settings-grid">
   <label>Holiday theme<select value={form.door_theme} onChange={e=>theme(e.target.value)}>{Object.entries(doorThemes).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label>
   <label>Contest name<input required maxLength={100} value={form.door_title} onChange={e=>change('door_title',e.target.value)}/></label>
   <label>Status<select value={form.door_state} onChange={e=>change('door_state',e.target.value)}>{['active','paused','ended'].map(value=><option key={value}>{value}</option>)}</select></label>
   <label>Submissions close<input type="datetime-local" required value={form.submission_end} onChange={e=>change('submission_end',e.target.value)}/></label>
   <label>Voting closes<input type="datetime-local" required value={form.voting_end} onChange={e=>change('voting_end',e.target.value)}/></label>
   <label>Border style<select value={form.door_border_style} onChange={e=>change('door_border_style',e.target.value)}>{['double','solid','dashed','dotted'].map(value=><option key={value}>{value}</option>)}</select></label>
   <label>Participation points<input type="number" min="0" max="1000" step="1" required value={form.door_participation_points} onChange={e=>change('door_participation_points',e.target.value)}/></label>
   <label>Champion bonus points<input type="number" min="0" max="1000" step="1" required value={form.door_champion_points} onChange={e=>change('door_champion_points',e.target.value)}/></label>
   <div className="og-door-colors"><label>Border color<input type="color" value={form.door_border_color} onChange={e=>change('door_border_color',e.target.value)}/></label><label>Background<input type="color" value={form.door_background} onChange={e=>change('door_background',e.target.value)}/></label></div>
  </div>
  <div className="og-door-settings-footer"><div className="og-door og-door-preview" style={doorStyle(form)} aria-label="Door frame preview"><span aria-hidden="true">{doorTheme(form).decor}</span><strong>{form.door_title}</strong><span>School photo</span></div><div><p>When active, submissions and voting are open together until their closing times. Photos need approval before voting.</p><p>Times: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Rewards are SPARK Points; changes apply to future awards.</p><button disabled={busy}>Save door contest</button>{message&&<p role="status">{message}</p>}</div></div>
 </form></details>;
}

// Schedule entry is always Los Angeles time, including on a device in another timezone.
export function doorLocal(value){
 if(!value)return '';
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(x=>[x.type,x.value]));
 return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function NextDoorSettings({cfg,next,run,busy}){
 const preset=doorThemes[cfg.door_theme==='halloween'?'autumn':'winter'],saved=next?.settings;
 const [form,setForm]=useState(saved?{...saved,opens_local:doorLocal(saved.submission_start),submission_local:doorLocal(saved.submission_end),voting_local:doorLocal(saved.voting_end)}:{
  door_title:preset.title,door_theme:cfg.door_theme==='halloween'?'autumn':'winter',door_border_style:'double',door_border_color:preset.border,door_background:preset.background,
  door_participation_points:cfg.door_participation_points??10,door_champion_points:cfg.door_champion_points??20,opens_local:'',submission_local:'',voting_local:''});
 const [scheduled,setScheduled]=useState(next?.scheduled??true),[message,setMessage]=useState('');
 const change=(name,value)=>{setForm(old=>({...old,[name]:value}));setMessage('Unsaved changes');};
 async function save(event){event.preventDefault();
  if(!form.opens_local||!form.submission_local||!form.voting_local){setMessage('Enter the opening date and both closing dates.');return;}
  if(form.opens_local>=form.submission_local||form.submission_local>form.voting_local){setMessage('Opening must precede submissions close; voting must close at or after submissions.');return;}
  const ok=await run('door_next_save',{...form,scheduled,revision:cfg.revision,door_participation_points:Number(form.door_participation_points),door_champion_points:Number(form.door_champion_points)});
  setMessage(ok?(scheduled?'Next contest scheduled.':'Next contest draft saved.'):'Not saved. Check the message above.');
 }
 return <details className="og-door-next" open={!!cfg.champion||!!next}><summary>Next decoration contest · create or schedule</summary>
  <p>Prepare a separate contest. The current contest stays intact until the next one starts.</p>
  {next&&<p role="status"><strong>{next.scheduled?'Scheduled':'Draft'}: {next.settings.door_title}</strong> · Opens {doorLocal(next.settings.submission_start).replace('T',' ')} (Los Angeles).
   {next.scheduled&&new Date(next.settings.submission_start)<=new Date()&&<span> Opening is waiting: confirm the current winner, or update the next contest closing dates if they have passed.</span>}
   {next.scheduled&&!cfg.champion&&<span> If the current contest has entries, confirm its winner before this opening time.</span>}</p>}
  <form onSubmit={save}><div className="og-door-settings-grid">
   <label>Next holiday theme<select value={form.door_theme} onChange={e=>{const key=e.target.value,p=doorThemes[key];setForm(old=>({...old,door_theme:key,door_title:p.title,door_border_color:p.border,door_background:p.background}));setMessage('Unsaved changes');}}>{Object.entries(doorThemes).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label>
   <label>Next contest name<input required maxLength={100} value={form.door_title} onChange={e=>change('door_title',e.target.value)}/></label>
   <label>Contest opens (Los Angeles)<input type="datetime-local" required value={form.opens_local} onChange={e=>change('opens_local',e.target.value)}/></label>
   <label>Next submissions close (Los Angeles)<input type="datetime-local" required value={form.submission_local} onChange={e=>change('submission_local',e.target.value)}/></label>
   <label>Next voting closes (Los Angeles)<input type="datetime-local" required value={form.voting_local} onChange={e=>change('voting_local',e.target.value)}/></label>
   <label>Next border style<select value={form.door_border_style} onChange={e=>change('door_border_style',e.target.value)}>{['double','solid','dashed','dotted'].map(value=><option key={value}>{value}</option>)}</select></label>
   <label>Next participation points<input type="number" required min="0" max="1000" step="1" value={form.door_participation_points} onChange={e=>change('door_participation_points',e.target.value)}/></label>
   <label>Next champion bonus points<input type="number" required min="0" max="1000" step="1" value={form.door_champion_points} onChange={e=>change('door_champion_points',e.target.value)}/></label>
   <div className="og-door-colors"><label>Next border color<input type="color" value={form.door_border_color} onChange={e=>change('door_border_color',e.target.value)}/></label><label>Next background<input type="color" value={form.door_background} onChange={e=>change('door_background',e.target.value)}/></label></div>
  </div><div className="og-door-settings-footer"><div className="og-door og-door-preview" style={doorStyle(form)}><span aria-hidden="true">{doorTheme(form).decor}</span><strong>{form.door_title}</strong><span>School photo</span></div><div>
   <p>Submissions and voting open together. Approved photos can receive votes until voting closes. Times use America/Los_Angeles.</p>
   <label className="og-check"><input type="checkbox" checked={scheduled} onChange={e=>setScheduled(e.target.checked)}/>Start automatically at the opening time</label>
   <button disabled={busy}>{scheduled?'Schedule next contest':'Save next contest draft'}</button>
   {next&&<div className="og-actions"><button type="button" disabled={busy} onClick={()=>{if(window.confirm('Start the saved next contest now? The current contest will become read-only history.'))run('door_next_start',{revision:cfg.revision,confirmed:true});}}>Start saved contest now</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm('Remove the next contest plan? The current contest will stay unchanged.'))run('door_next_cancel',{revision:cfg.revision,confirmed:true});}}>Remove next contest plan</button></div>}
   {message&&<p role="status">{message}</p>}
  </div></div></form>
 </details>;
}
