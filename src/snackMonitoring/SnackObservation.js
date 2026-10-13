import React from 'react';
import {COMPONENTS} from './spec';
export default function SnackObservation({data,edit,disabled,Field,Choices,field}){
 const component=(key,patch)=>edit({components:{...data.components,[key]:{...data.components[key],...patch}}});
 return <>
  {field('menu','Today’s snack menu','text',true)}
  <div className="sm-grid">{field('servingTime','Serving time','time')}{field('attendance','Attendance today','number')}{field('children','Children served','number')}{field('adults','Adults served','number')}</div>
  <label className="sm-check"><input type="checkbox" disabled={disabled} checked={!!data.capacityNA} onChange={e=>edit({capacityNA:e.target.checked})}/>License / room capacity not applicable</label>
  {!data.capacityNA&&field('capacity','License / room capacity','number')}
  {data.areaEligible==='No'&&<fieldset><legend>Non-area-eligible site counts</legend>{['free','reduced','paid'].map(key=><div className="sm-grid" key={key}>{['applications','claimed'].map(group=><Field key={group} type="number" label={`${key[0].toUpperCase()+key.slice(1)} ${group==='applications'?'approved applications':'meals claimed'}`} disabled={disabled} value={data[group]?.[key]} onChange={v=>edit({[group]:{...data[group],[key]:v}})}/>)}</div>)}</fieldset>}
  <fieldset><legend>Snack components — select two</legend>{Object.entries(COMPONENTS).map(([key,label])=><div className="snp-finding" key={key}><label className="sm-check"><input type="checkbox" disabled={disabled} checked={!!data.components[key]?.selected} onChange={e=>component(key,{selected:e.target.checked})}/>{label}</label>{data.components[key]?.selected&&<div className="sm-grid">{[['food','Food served'],['portion','Planned serving size'],['prepared','Total amount prepared']].map(([part,text])=><Field key={part} label={`${label}: ${text}`} disabled={disabled} value={data.components[key][part]} onChange={v=>component(key,{[part]:v})}/>)}</div>}</div>)}</fieldset>
 </>;
}
