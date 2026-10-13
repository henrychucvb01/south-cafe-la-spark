// Calendar dates use UTC arithmetic; the default date comes from the school's Los Angeles clock.
export const dateValue=d=>d.toISOString().slice(0,10);
export const dateObject=s=>new Date(s+'T12:00:00Z');
export function shiftDate(s,n){const d=dateObject(s);d.setUTCDate(d.getUTCDate()+n);return dateValue(d);}
export function rangePreset(name,today){const d=dateObject(today);if(name==='This Week'){const start=shiftDate(today,-((d.getUTCDay()+6)%7));return [start,shiftDate(start,6)];}if(name==='Last 7 Days')return [shiftDate(today,-6),today];if(name==='This Month')return [today.slice(0,7)+'-01',dateValue(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)))];return [today,today];}
export function validRange(from,to){return /^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)&&!Number.isNaN(+dateObject(from))&&!Number.isNaN(+dateObject(to))&&dateValue(dateObject(from))===from&&dateValue(dateObject(to))===to&&to>=from&&(+dateObject(to)-dateObject(from))/86400000<=366;}
export const displayDate=s=>dateObject(s).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
export const rangeLabel=(from,to)=>from===to?displayDate(from):displayDate(from)+' – '+displayDate(to);
export function calendarDays(month){const first=month+'-01',start=shiftDate(first,-((dateObject(first).getUTCDay()+6)%7));return Array.from({length:42},(_,i)=>shiftDate(start,i));}
