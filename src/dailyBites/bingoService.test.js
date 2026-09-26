import {fetchAllBingoRows,loadBingoMonitorings} from './bingoService';
import {openSession,closeSession,listMonitorings} from '../supperMonitoring/service';
jest.mock('../supperMonitoring/service',()=>({openSession:jest.fn(),closeSession:jest.fn(),listMonitorings:jest.fn()}));
test('pagination reads beyond 1000 records',async()=>{
 const rows=Array.from({length:1201},(_,id)=>({id}));
 expect(await fetchAllBingoRows(()=>({range:async(a,b)=>({data:rows.slice(a,b+1)})}))).toHaveLength(1201);
});
test('failed pages fail the refresh instead of awarding from partial data',async()=>{
 await expect(fetchAllBingoRows(()=>({range:async()=>({error:Error('offline')})}))).rejects.toThrow('offline');
});
test('monitoring reads use the existing manager session and close it on failure',async()=>{
 openSession.mockResolvedValue('token');listMonitorings.mockRejectedValue(Error('offline'));closeSession.mockResolvedValue(true);
 await expect(loadBingoMonitorings({id:32},{id:2},'existing-pin')).rejects.toThrow('offline');
 expect(openSession).toHaveBeenCalledWith({id:32},{id:2},'existing-pin');expect(closeSession).toHaveBeenCalledWith('token');
});
