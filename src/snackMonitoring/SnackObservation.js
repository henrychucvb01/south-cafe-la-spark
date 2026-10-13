import React from 'react';
import {COMPONENTS} from './spec';
export default function SnackObservation({data,edit,disabled,Field,Choices,field}){
 const component=(key,patch)=>edit({components:{...data.components,[key]:{...data.components[key],...patch}}});
 return <div className="snack-observation">
  <div className="sm-grid">{field('servingTime','Serving time','time')}{field('attendance','Attendance today','number')}{field('children','Children served','number')}<Field label="Adults served" value="0" disabled type="number"/></div>
  <label className="sm-check"><input type="checkbox" disabled={disabled} checked={!!data.capacityNA} onChange={e=>edit({capacityNA:e.target.checked})}/>License / room capacity not applicable</label>
  {!data.capacityNA&&field('capacity','License / room capacity','number')}
  <p>Non-area-eligible site: N/A</p>
  <fieldset><legend>Snack components — select two</legend>{Object.entries(COMPONENTS).map(([key,label])=><div className="snack-component" key={key}><label className="sm-check"><input type="checkbox" disabled={disabled} checked={!!data.components[key]?.selected} onChange={e=>component(key,{selected:e.target.checked})}/>{label}</label>{data.components[key]?.selected&&<div className="sm-grid">{[['food','Food served'],['portion','Planned serving size'],['prepared','Total amount prepared']].map(([part,text])=><Field key={part} label={`${label}: ${text}`} disabled={disabled} value={data.components[key][part]} onChange={v=>component(key,{[part]:v})}/>)}</div>}</div>)}</fieldset>
 </div>;
}
