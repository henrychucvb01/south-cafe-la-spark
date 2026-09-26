import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const build=resolve('build');
const server=createServer(async(req,res)=>{try{let path=resolve(build,'.'+new URL(req.url,'http://localhost').pathname);if(path!==build&&!path.startsWith(build+sep))return res.writeHead(403).end();if(path===build)path=resolve(build,'index.html');res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
const catalog=JSON.parse(await readFile('src/dailyBites/bingoCatalog.json','utf8'));
const seeds=JSON.parse(await readFile('src/dailyBites/bingoInitialCards2026.json','utf8'));
const location={id:32,school_name:'Test High School',location_code:'9999',labor_type:'secondary',budget_labor_hours:20,active:true};
let calls=[],fail=false;
let state={card:{id:'00000000-0000-0000-0000-000000000032',cycle:1,revision:1,started_on:'2026-09-01',blackout_at:null},goals:seeds.find(s=>s.location_id===32).goal_ids.map(id=>({...catalog.find(g=>g.id===id),completed:id==='free'})),completed_lines:[],earned_milestones:[],new_points:0,renew_on:'2026-10-01',can_renew:false,repick_available:true,replacement_goals:catalog.filter(g=>g.id.startsWith('training-')),required_supper_number:1};
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
  else if(name==='ar_training_daily_progress')data={points_awarded:0};
  else if(name.startsWith('spark_bingo_')){
   calls.push({name,args:req.postDataJSON()});
   if(fail)return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Temporary connection problem'})});
   if(name==='spark_bingo_repick'){
    const args=req.postDataJSON();assert.equal(args.p_card,state.card.id);assert.equal(args.p_revision,state.card.revision);
    state.goals[args.p_square]={...catalog.find(g=>g.id===args.p_goal),completed:false};state.card.revision++;state.repick_available=false;
   }
   if(name==='spark_bingo_renew'){
    assert(state.can_renew);state.card={...state.card,id:'00000000-0000-0000-0000-000000000033',cycle:2,revision:1,started_on:'2026-10-01',blackout_at:null};const previous=new Set(state.goals.map(g=>g.id));const fresh=catalog.filter(g=>g.draw_enabled).sort((a,b)=>Number(previous.has(a.id))-Number(previous.has(b.id))).slice(0,24);fresh.splice(12,0,catalog.find(g=>g.id==='free'));state.goals=fresh.map(g=>({...g,completed:g.id==='free'}));state.earned_milestones=[];state.completed_lines=[];state.can_renew=false;state.renew_on='2026-11-01';
   }
   data=state;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(origin);await page.getByLabel('Location Code').fill('9999');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:/Bingo Test Manager/}).click();await page.getByLabel('4-Digit PIN').fill('1234');await page.getByRole('button',{name:/Daily Bites/}).click();
 const bingo=page.getByRole('region',{name:'SPARK Bingo'});
 await expect(bingo).toContainText('1 / 25');await expect(bingo.getByRole('button',{name:'Start New Card'})).toBeDisabled();
 await bingo.getByRole('button',{name:'Use monthly repick'}).click();
 await bingo.locator('.bingo-repick-square').first().click();
 await bingo.getByLabel('Choose a different task').selectOption('training-1');
 await bingo.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(calls.filter(c=>c.name==='spark_bingo_repick').length,0);
 await bingo.getByRole('button',{name:'Use monthly repick'}).click();await bingo.locator('.bingo-repick-square').first().click();await bingo.getByLabel('Choose a different task').selectOption('training-1');
 fail=true;await bingo.getByRole('button',{name:'Replace square — use monthly repick'}).click();await expect(bingo.getByRole('alert')).toContainText('Temporary connection problem');assert.equal(state.repick_available,true);
 fail=false;await bingo.getByRole('button',{name:'Replace square — use monthly repick'}).click();await expect(bingo).toContainText('Square replaced');await expect(bingo.getByRole('button',{name:'Use monthly repick'})).toBeDisabled();
 await expect(bingo.locator('.spark-bingo-square').first()).toContainText('AR Training');
 await page.reload();await page.getByLabel('Location Code').fill('9999');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:/Bingo Test Manager/}).click();await page.getByLabel('4-Digit PIN').fill('1234');await page.getByRole('button',{name:/Daily Bites/}).click();
 await expect(bingo.getByRole('button',{name:'Use monthly repick'})).toBeDisabled();await expect(bingo.locator('.spark-bingo-square').first()).toContainText('AR Training');
 state.card.blackout_at='2026-09-25';state.goals=state.goals.map(g=>({...g,completed:true}));state.earned_milestones=[1,2,3,4,5];
 await bingo.getByRole('button',{name:'Refresh Bingo'}).click();await expect(bingo).toContainText('25 / 25');await expect(bingo.getByRole('button',{name:'Start New Card'})).toBeDisabled();
 state.can_renew=true;await bingo.getByRole('button',{name:'Refresh Bingo'}).click();await expect(bingo.getByRole('button',{name:'Start New Card'})).toBeEnabled();await bingo.getByRole('button',{name:'Start New Card'}).click();await expect(bingo).toContainText('CARD 2');await expect(bingo).toContainText('1 / 25');await expect(bingo.locator('.spark-bingo-rewards')).not.toContainText('Earned');await expect(bingo.locator('.spark-bingo-board')).not.toContainText('Perfect');
 await mkdir('test-results/bingo-cycles',{recursive:true});
 await bingo.screenshot({path:'test-results/bingo-cycles/mobile.png'});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal mobile overflow');
 for(const width of [390,1360]){
  await page.setViewportSize({width,height:950});await page.evaluate(()=>window.scrollTo(0,0));
  const box=await page.locator('.spark-feedback-trigger').boundingBox();assert(box&&box.y>850&&box.y+box.height<=950,'Feedback stays at bottom');
 }
 await page.screenshot({path:'test-results/bingo-cycles/feedback-desktop.png'});
 assert.deepEqual(errors,[]);console.log('PASS: mobile repick, cancel/failure preserves quota, refresh persistence, early blackout blocked, eligible renewal, bottom Feedback at mobile/desktop, no runtime errors.');
 await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
