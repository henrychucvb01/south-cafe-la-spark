import { createClient } from "@supabase/supabase-js";
import { sessionFetch } from "./security/session";
import {browserDatabase} from './security/databaseEnvironment';

let configuration;
export let databaseConfigurationError = null;
try {
  configuration = browserDatabase({
    REACT_APP_SUPABASE_PUBLISHABLE_KEY: process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY,
    REACT_APP_DEVELOPMENT_SUPABASE_URL: process.env.REACT_APP_DEVELOPMENT_SUPABASE_URL,
    REACT_APP_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY: process.env.REACT_APP_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY,
  }, window.location.hostname);
} catch (error) {
  databaseConfigurationError = error.message;
  configuration = {url: 'https://unconfigured.invalid', key: 'unconfigured'};
}
export const supabase = createClient(configuration.url, configuration.key, { global: {
  fetch: databaseConfigurationError
    ? async () => new Response(JSON.stringify({message: databaseConfigurationError}), {status:503, headers:{'Content-Type':'application/json'}})
    : sessionFetch,
}});
