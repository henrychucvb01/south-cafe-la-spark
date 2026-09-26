import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const build=resolve('build');
const server=createServer(async(req,res)=>{try{let path=resolve(build,'.'+new URL(req.url,'http://localhost').pathname);if(path!==build&&!path.startsWith(build+sep))return res.writeHead(403).end();if(path===build)path=resolve(build,'index.html');res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
try{
 await mkdir('test-results/daily-games',{recursive:true});
 for(const [date,width,rating] of [['2026-09-25',1440,null],['2026-09-28',390,'Easy'],['2026-10-01',1440,'Hard'],['2027-06-04',390,'Medium']]){
  const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(date=>{const NativeDate=Date;const fixed=new NativeDate(date+'T19:00:00Z').getTime();window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};sessionStorage.setItem('sparkIntroPlayed','yes');},date);
  await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();if(url.hostname!=='kkrcxqhfzepifhkryodd.supabase.co')return route.abort();const name=url.pathname.split('/').at(-1);let data=[];
   if(name==='locations')data={id:1,location_code:'1001',school_name:'Game Test School',active:true};
   else if(name==='employees')data=[{id:11,location_id:1,employee_name:'Test Manager',active:true}];
   else if(['has_manager_pin','verify_manager_pin','close_supper_monitoring_session'].includes(name))data=true;
   else if(name==='open_supper_monitoring_session')data='a'.repeat(72);
   else if(['ar_training_daily_progress','spark_school_point_totals'].includes(name))data={points_awarded:0,total_points:0};
   else if(name==='daily_bites_game_progress'&&req.method()==='POST')data=req.postDataJSON();
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(origin);await page.getByLabel('Location Code').fill('1001');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:/Test Manager/}).click();await page.getByLabel('4-Digit PIN').fill('1234');await page.getByRole('button',{name:/Daily Bites/}).click();
  await expect(page.locator('.daily-games-date')).toContainText(date);
  const sort=page.locator('.spark-sort-card');await expect(sort.locator('.spark-sort-grid button')).toHaveCount(16);await expect(sort.locator('.spark-sort-rating')).toBeVisible();if(rating)await expect(sort.locator('.spark-sort-rating')).toContainText("Today's difficulty: "+rating);
  await expect(page.locator('.word-board .word-row')).toHaveCount(6);
  if(date==='2026-09-28'){
   for(const word of ['Apple','Pear','Peach','Plum'])await sort.getByRole('button',{name:word,exact:true}).click();
   await sort.getByRole('button',{name:'Submit Group',exact:true}).click();await expect(sort.locator('.spark-sort-solved-list')).toContainText('Orchard fruit');await expect(sort.locator('.spark-sort-grid button')).toHaveCount(12);
  }
  await sort.scrollIntoViewIfNeeded();await sort.screenshot({path:`test-results/daily-games/sort-${date}-${width}.png`});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile page stays within viewport');
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: rated daily games render before/after schedule switch and on June 4, mobile/desktop layouts, group submission, and no runtime errors.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
