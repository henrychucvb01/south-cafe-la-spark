import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const build=resolve('build');
const server=createServer(async(req,res)=>{try{let path=resolve(build,'.'+new URL(req.url,'http://localhost').pathname);if(path!==build&&!path.startsWith(build+sep))return res.writeHead(403).end();if(path===build)path=resolve(build,'index.html');res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
const snapshot=JSON.parse(await readFile('test-results/bingo-audit/snapshot.json','utf8'));
const monitoring=JSON.parse(await readFile('test-results/bingo-audit/monitoring-evidence.json','utf8')).filter(r=>r.location_id===32);
const location=snapshot.locations.find(s=>s.id===32),points=snapshot.points.filter(r=>r.location_id===32),writes=[];
let failReward=true;
try {
 const context=await browser.newContext({viewport:{width:390,height:950},serviceWorkers:'block'}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>sessionStorage.setItem('sparkIntroPlayed','yes'));
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();if(url.hostname!=='kkrcxqhfzepifhkryodd.supabase.co')return route.abort();
  const name=url.pathname.split('/').at(-1);let data=[];
  if(name==='locations')data=location;
  else if(name==='employees')data=[{id:1,location_id:32,employee_name:'Bingo Test Manager',active:true}];
  else if(['has_manager_pin','verify_manager_pin','close_supper_monitoring_session'].includes(name))data=true;
  else if(name==='open_supper_monitoring_session')data='a'.repeat(72);
  else if(name==='list_supper_monitorings')data=monitoring;
  else if(name==='spark_points'&&req.method()==='POST'){
   const row=req.postDataJSON();
   if(failReward&&row.point_type==='bingo_line_reward')return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Simulated reward save failure'})});
   if(points.some(p=>p.unique_key===row.unique_key))return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:'23505',message:'Already awarded'})});
   points.push(row);writes.push(row);data=[];
  }else if(name==='spark_points')data=points;
  else if(name==='finish_line_checks')data=snapshot.finish.filter(r=>r.location_id===32);
  else if(name==='meal_counts')data=snapshot.meals.filter(r=>r.location_id===32);
  else if(name==='labor_hours')data=snapshot.labor.filter(r=>r.location_id===32);
  else if(name==='spark_excluded_days')data=snapshot.excluded.filter(r=>r.location_id===32);
  else if(name==='ar_training_daily_progress')data={points_awarded:0};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 async function login(){await page.getByLabel('Location Code').fill(location.location_code);await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:/Bingo Test Manager/}).click();await page.getByLabel('4-Digit PIN').fill('1234');await page.getByRole('button',{name:/Daily Bites/}).click();}
 await page.goto(origin);await login();
 const bingo=page.locator('.spark-bingo-section');
 await expect(bingo).toContainText('23 / 25');
 await expect(bingo).toContainText('A Bingo reward could not be saved');
 await expect(bingo.locator('.spark-bingo-rewards > div').nth(4)).not.toContainText('Earned');
 failReward=false;
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(bingo.locator('.spark-bingo-rewards > div').nth(4)).toContainText('Earned');
 expect(writes.filter(p=>p.point_type==='bingo_line_reward')).toEqual([expect.objectContaining({points:50,unique_key:'card1-fall-2026-line-32-5'})]);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(bingo).toContainText('23 / 25');
 expect(writes.filter(p=>p.point_type==='bingo_line_reward')).toHaveLength(1);
 await bingo.screenshot({path:'test-results/bingo-audit/test-school-mobile.png'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile Bingo stays within viewport');
 assert.deepEqual(errors,[]);
 console.log('PASS: Test High School shows 23/25; failed reward not marked earned; focus refresh retries +50 once; mobile layout; no runtime errors.');
 await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
