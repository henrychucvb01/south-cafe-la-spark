import {supabase} from '../supabaseClient';
import {openSession,openSupervisorSession,closeSession} from '../supperMonitoring/service';
import {loadSchoolMealAnalytics} from './schoolMealAnalyticsService';
jest.mock('../supabaseClient',()=>({supabase:{rpc:jest.fn()}}));
jest.mock('../supperMonitoring/service',()=>({openSession:jest.fn(),openSupervisorSession:jest.fn(),closeSession:jest.fn()}));
const args={location:{id:12},employee:{id:1},managerPin:'test',startDate:'2026-09-01',endDate:'2026-09-30'};
beforeEach(()=>{jest.clearAllMocks();openSession.mockResolvedValue('manager');openSupervisorSession.mockResolvedValue('supervisor');closeSession.mockResolvedValue();});
test('verified school session loads district counts before closing and keeps manager fallback',async()=>{
 supabase.rpc.mockResolvedValue({data:{meal_rows:[{location_id:12,service_date:'2026-09-25',breakfast_count:100,lunch_count:163}],official_rows:[{location_id:12,service_date:'2026-09-25',lunch_count:243}]}});
 const data=await loadSchoolMealAnalytics(args);
 expect(data.mealRows[0]).toMatchObject({breakfast_count:100,lunch_count:243});
 expect(openSession).toHaveBeenCalledWith(args.location,args.employee,'test');
 expect(supabase.rpc).toHaveBeenCalledWith('school_meal_analytics',{p_token:'manager',p_start_date:args.startDate,p_end_date:args.endDate});
 expect(closeSession).toHaveBeenCalledWith('manager');
});
test('supervisor preview uses a supervisor session; district failure cannot silently fall back',async()=>{
 supabase.rpc.mockResolvedValue({error:new Error('District loading failed')});
 await expect(loadSchoolMealAnalytics({...args,supervisorPin:'supervisor-pin'})).rejects.toThrow('District loading failed');
 expect(openSupervisorSession).toHaveBeenCalledWith(args.location,'supervisor-pin');
 expect(openSession).not.toHaveBeenCalled();
 expect(closeSession).toHaveBeenCalledWith('supervisor');
});
