import {supabase} from '../supabaseClient';
import {openSession,closeSession} from '../supperMonitoring/service';

export async function recordScorecardOpen(location,employee,managerPin) {
  const token=await openSession(location,employee,managerPin);
  try {
    const {error}=await supabase.rpc('spark_bingo_scorecard_open',{p_token:token});
    if(error)throw error;
  } finally {
    await closeSession(token);
  }
}
