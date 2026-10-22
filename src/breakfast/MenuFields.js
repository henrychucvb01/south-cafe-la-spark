import React from 'react';
import {PACKING_ITEMS} from './packingItems';
export const MILK_KEYS=['milk1','milkNonfat','milkLactaid','milkSpecial'];
export default function MenuFields({values,onChange,milkOnly=false,id='menu',standard=false}){
 return <div className="ba-fields">{PACKING_ITEMS.filter(([k])=>!milkOnly||MILK_KEYS.includes(k)).map(([key,label])=>{
 const enabled=Boolean(values[key]?.trim());
 return <div key={key} className="ba-menu-field"><label className="ba-check"><input type="checkbox" disabled={standard&&key==='milkSpecial'} checked={enabled} aria-label={`Include ${label}`} onChange={e=>onChange(key,e.target.checked?label:'')}/>{label}</label>{enabled&&<label className="ba-menu-item-name" htmlFor={`${id}-${key}`}><span>Item name</span><input id={`${id}-${key}`} aria-label={`${label} item name`} type="text" maxLength={160} value={values[key]||''} onChange={e=>onChange(key,e.target.value)}/></label>}</div>;
 })}</div>;
}
