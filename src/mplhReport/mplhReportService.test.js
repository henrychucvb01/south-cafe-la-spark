import {supabase} from '../supabaseClient';
import {loadOfficialMealCounts} from '../monthlyScorecards/monthlyScorecardService';
import {loadMplhReportData} from './mplhReportService';
jest.mock('../supabaseClient',()=>({supabase:{from:jest.fn()}}));
jest.mock('../monthlyScorecards/monthlyScorecardService',()=>({loadOfficialMealCounts:jest.fn()}));

test('fetches every page for meals, labor and exclusions and loads official counts with supervisor authorization',async()=>{
 const all=Array.from({length:250},(_,i)=>({location_id:i+1,service_date:'2026-09-01'}));
 const orders=[];
 supabase.from.mockImplementation(()=>{const q={};for(const name of ['select','in','gte','lte'])q[name]=jest.fn(()=>q);q.order=jest.fn(field=>{orders.push(field);return q;});q.range=jest.fn(async(a,b)=>({data:all.slice(a,b+1)}));return q;});
 loadOfficialMealCounts.mockResolvedValue([{location_id:250,breakfast_count:42}]);
 const data=await loadMplhReportData('test-pin',[1,250],'2026-09-01','2026-09-30');
 for(const field of ['mealRows','laborRows','excludedRows'])expect(data[field]).toHaveLength(250);
 expect(data.officialMealRows[0].breakfast_count).toBe(42);
 expect(loadOfficialMealCounts).toHaveBeenCalledWith('test-pin','2026-09-01','2026-09-30');
 expect(orders).toContain('location_id');expect(orders).toContain('service_date');
});

test('official load failures are errors, not silent fallback to unofficial counts',async()=>{
 supabase.from.mockImplementation(()=>{const q={};for(const name of ['select','in','gte','lte','order'])q[name]=()=>q;q.range=async()=>({data:[]});return q;});
 loadOfficialMealCounts.mockRejectedValue(new Error('Official data unavailable'));
 await expect(loadMplhReportData('test-pin',[1],'2026-09-01','2026-09-30')).rejects.toThrow('Official data unavailable');
});
