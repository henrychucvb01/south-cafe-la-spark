import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://kkrcxqhfzepifhkryodd.supabase.co";

const supabaseKey = "sb_publishable_rFcU-sguMfg5g0vBoD_cjg_qVH0RTai";

export const supabase = createClient(supabaseUrl, supabaseKey);
