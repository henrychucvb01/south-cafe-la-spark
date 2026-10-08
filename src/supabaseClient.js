import { createClient } from "@supabase/supabase-js";
import { sessionFetch } from "./security/session";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "https://kkrcxqhfzepifhkryodd.supabase.co";

const supabaseKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_rFcU-sguMfg5g0vBoD_cjg_qVH0RTai";

export const supabase = createClient(supabaseUrl, supabaseKey, { global: { fetch: sessionFetch } });
