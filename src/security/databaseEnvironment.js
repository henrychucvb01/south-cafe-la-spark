export const PRODUCTION_DATABASE = 'https://kkrcxqhfzepifhkryodd.supabase.co';
export const PRODUCTION_HOST = 'south-cafe-la-spark.vercel.app';
export const DEVELOPMENT_UNAVAILABLE = 'SPARK Development needs its separate test database. Live school data is protected.';

export function isolatedDatabase(url, key) {
  if (!url || !key) throw new Error(DEVELOPMENT_UNAVAILABLE);
  const parsed = new URL(url);
  if (parsed.origin === PRODUCTION_DATABASE || !['https:', 'http:'].includes(parsed.protocol)
      || (parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname))) {
    throw new Error(DEVELOPMENT_UNAVAILABLE);
  }
  return {url: parsed.origin, key};
}

export function browserDatabase(env, hostname) {
  if (hostname === PRODUCTION_HOST) return {
    url: PRODUCTION_DATABASE,
    key: env.REACT_APP_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_rFcU-sguMfg5g0vBoD_cjg_qVH0RTai',
  };
  return isolatedDatabase(env.REACT_APP_DEVELOPMENT_SUPABASE_URL, env.REACT_APP_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY);
}

export function serverDatabase(env) {
  if (env.VERCEL_ENV === 'production' && env.VERCEL_GIT_COMMIT_REF === 'main') {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SPARK database service is not configured.');
    return {url: PRODUCTION_DATABASE, key: env.SUPABASE_SERVICE_ROLE_KEY};
  }
  // Never inherit production URL/key settings in Preview or a local server.
  return isolatedDatabase(env.DEVELOPMENT_SUPABASE_URL, env.DEVELOPMENT_SUPABASE_SERVICE_ROLE_KEY);
}
