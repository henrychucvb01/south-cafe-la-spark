import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium,expect} from '@playwright/test';
import spotlight from '../api/spotlight.js';
import monitoring from '../api/monitoring.js';
import games from '../api/october-games.js';
import ask from '../api/ask-spark.js';
import importer from '../api/ask-spark-import.js';
process.env.VERCEL_ENV='preview';process.env.VERCEL_GIT_COMMIT_REF='spark-development';
process.env.SUPABASE_URL='https://kkrcxqhfzepifhkryodd.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='production-must-not-be-used';
delete process.env.DEVELOPMENT_SUPABASE_URL;delete process.env.DEVELOPMENT_SUPABASE_SERVICE_ROLE_KEY;
let calls=0;const previousFetch=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('Unexpected outbound request');};
try{
 for(const handler of [spotlight,monitoring,games,ask,importer]){
  let code=0;const res={setHeader(){},status(c){code=c;return this;},json(){return this;},end(){return this;}};
  await handler({method:'POST',headers:{host:'localhost'},body:{question:'How do I complete a production record?'}},res);
  assert.ok(code>=400);assert.equal(calls,0,'No backend contacts production');
 }
}finally{globalThis.fetch=previousFetch;}
const build=resolve('build');
const server=createServer(async(req,res)=>{try{let p=resolve(build,'.'+new URL(req.url,'http://localhost').pathname);if(p!==build&&!p.startsWith(build+sep))return res.writeHead(403).end();if(p===build)p=resolve(build,'index.html');res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({serviceWorkers:'block'});const external=[];
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(route.request().url());return route.abort();});
 const page=await context.newPage();await page.addInitScript(()=>sessionStorage.setItem('sparkIntroPlayed','yes'));await page.goto(origin);
 await expect(page.getByText('SPARK Development needs its separate test database. Live school data is protected.')).toBeVisible();
 assert.deepEqual(external,[]);console.log('PASS: development browser and all database-backed API routes refuse production fallback without any outbound database calls.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
