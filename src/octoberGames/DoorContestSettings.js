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
export default function DoorContestSettings({cfg,run,busy}){
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
