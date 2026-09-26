import {openSession,closeSession,listMonitorings} from '../supperMonitoring/service';

export async function fetchAllBingoRows(makeQuery) {
  const result=[];
  for(let offset=0;;offset+=500) {
    const {data,error}=await makeQuery().range(offset,offset+499);
    if(error) throw error;
    result.push(...(data||[]));
    if(!data||data.length<500)return result;
  }
}

export async function loadBingoMonitorings(location,employee,pin) {
  if(!pin)throw new Error('Return to Manager Hub and sign in again to verify monitoring progress.');
  const token=await openSession(location,employee,pin);
  try { return await listMonitorings(token); }
  finally { await closeSession(token).catch(()=>{}); }
}
