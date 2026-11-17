import {supabase} from '../supabaseClient';
import {openSession, openSupervisorSession, closeSession} from '../supperMonitoring/service';
import {resolveMealCounts} from './resolveMealCounts';

export async function loadSchoolMealAnalytics({location, employee, managerPin, supervisorPin, startDate, endDate}) {
  const token = supervisorPin ? await openSupervisorSession(location, supervisorPin) : await openSession(location, employee, managerPin);
  try {
    const {data, error} = await supabase.rpc('school_meal_analytics', {p_token: token, p_start_date: startDate, p_end_date: endDate});
    if (error) throw error; // Never silently display unofficial figures when district loading fails.
    return {mealRows: resolveMealCounts(data.meal_rows, data.official_rows), laborRows: data.labor_rows || []};
  } finally { await closeSession(token).catch(() => {}); }
}
