import {browserDatabase,serverDatabase,PRODUCTION_DATABASE,PRODUCTION_HOST} from './databaseEnvironment';
test('production browser stays on the production database',()=>expect(browserDatabase({},PRODUCTION_HOST).url).toBe(PRODUCTION_DATABASE));
test.each(['localhost','south-cafe-la-spark-git-spark-development.vercel.app','preview.example.org'])('development host %s never inherits live settings',host=>{
 expect(()=>browserDatabase({REACT_APP_SUPABASE_URL:PRODUCTION_DATABASE,REACT_APP_SUPABASE_PUBLISHABLE_KEY:'live'},host)).toThrow();
 expect(()=>browserDatabase({REACT_APP_DEVELOPMENT_SUPABASE_URL:PRODUCTION_DATABASE,REACT_APP_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY:'live'},host)).toThrow();
});
test('explicit local database works',()=>expect(browserDatabase({REACT_APP_DEVELOPMENT_SUPABASE_URL:'http://127.0.0.1:55433',REACT_APP_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY:'local'},'localhost').url).toBe('http://127.0.0.1:55433'));
test.each(['preview','development',undefined])('server %s rejects inherited production credentials',stage=>expect(()=>serverDatabase({VERCEL_ENV:stage,SUPABASE_URL:PRODUCTION_DATABASE,SUPABASE_SERVICE_ROLE_KEY:'live'})).toThrow());
test('server rejects live URL even in explicit development settings',()=>expect(()=>serverDatabase({DEVELOPMENT_SUPABASE_URL:PRODUCTION_DATABASE,DEVELOPMENT_SUPABASE_SERVICE_ROLE_KEY:'live'})).toThrow());
test('main production server retains its existing key',()=>expect(serverDatabase({VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main',SUPABASE_SERVICE_ROLE_KEY:'live'})).toEqual({url:PRODUCTION_DATABASE,key:'live'}));
test('preview server uses only separate development credentials',()=>expect(serverDatabase({VERCEL_ENV:'preview',SUPABASE_SERVICE_ROLE_KEY:'live',DEVELOPMENT_SUPABASE_URL:'https://test.supabase.co',DEVELOPMENT_SUPABASE_SERVICE_ROLE_KEY:'test'})).toEqual({url:'https://test.supabase.co',key:'test'}));

test('verified custom production domain uses the live database',()=>expect(browserDatabase({},'spark.cafelalistens.org').url).toBe(PRODUCTION_DATABASE));
test.each(['preview.spark.cafelalistens.org','spark.cafelalistens.org.example.com','cafelalistens.org'])('similar host %s is not authorized for production',host=>expect(()=>browserDatabase({},host)).toThrow());
