// Every request is intercepted to synthetic fixtures; production data is never accessed.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const origin='https://spark.cafelalistens.org';
const initial=()=>({admin:false,production:true,identified:true,participating:true,location_id:1,current_round:null,server_time:new Date().toISOString(),settings:{quests_state:'active',door_state:'paused',mystery_state:'paused'},schools:[{id:1,school_name:'Synthetic School A',participating:true},{id:2,school_name:'Synthetic Winning School',participating:true}],quests:[{id:1,name:'Picture Perfect Lunch',description:'Photograph a beautifully presented complete school lunch tray.',reward_points:40},{id:2,name:'Team Spirit',description:'Celebrate your cafeteria team.',reward_points:30}],entries:[],rounds:[],rewards:[],unlock_events:[],guesses:[]});
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}});
  let data=initial();const writes=[],errors=[];
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===origin){
    if(url.pathname==='/api/october-games'){
     if(req.method()==='GET')return route.fulfill({json:{enabled:true,mode:'production'}});
     const body=req.postDataJSON();if(!['list','seen','badge'].includes(body.action))writes.push(body);
     return route.fulfill({json:body.action==='badge'?{participating:true,new_challenge:false}:data});
    }
    if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Excluded from isolated test'}});
    const file=path.resolve('build','.'+(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(path.resolve('build')+path.sep)||!fs.existsSync(file))return route.abort();
    return route.fulfill({body:fs.readFileSync(file),contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.gif':'image/gif'}[path.extname(file)]||'application/octet-stream'});
   }
   if(url.origin==='https://kkrcxqhfzepifhkryodd.supabase.co'&&url.pathname.startsWith('/rest/v1/')){
    const name=url.pathname.split('/').at(-1);let result=[];
    if(name==='spark_security_ready')result={version:1,ready:true};
    if(name==='locations')result={id:1,location_code:'9001',school_name:'Synthetic School A',active:true};
    if(name==='spark_employee_directory')result=[{id:11,employee_name:'Synthetic Manager',location_id:1}];
    if(name==='has_manager_pin')result=true;
    if(name==='spark_login')result='b'.repeat(64);
    if(name==='open_supper_monitoring_session')result='synthetic-scoped-session';
    if(name==='breakfast_manager_enabled')result=false;
    if(name==='ar_training_daily_progress')result=null;
    return route.fulfill({json:result});
   }
   return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>sessionStorage.setItem('sparkIntroPlayed','yes'));
  async function open(){await page.goto(origin);await page.getByLabel('Location Code').fill('9001');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:/Synthetic Manager/}).click();await page.locator('#managerPin').fill('3141');await page.getByRole('button',{name:/Daily Bites/}).click();await page.locator('.og-shortcut').click();await expect(page.locator('.og-quest-card')).toHaveCount(2);}
  await open();
  const game=page.locator('.og');await expect(game).toContainText('Reward: 40 SPARK Points');await expect(game.getByRole('button',{name:'Upload photo'})).toHaveCount(2);
  data.quests.forEach(quest=>quest.first_school=2);data.entries=[{id:'winner',quest:1,location_id:2,state:'approved',photo_url:'https://invalid.example/never-show-this-photo.webp'}];
  await game.getByRole('button',{name:'Refresh',exact:true}).click();
  const cards=game.locator('.og-completed');await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAttribute('aria-pressed','true');await expect(cards.first().locator('.og-flip-inner')).toHaveCSS('transition-duration','0.6s');
  await expect(cards.nth(1)).toHaveAttribute('aria-pressed','false');
  const start=await cards.first().locator('.og-flip-inner').evaluate(node=>getComputedStyle(node).transform);
  assert.notEqual(start,'none');
  await expect(cards.nth(1)).toHaveAttribute('aria-pressed','true');
  await expect(cards.locator('img')).toHaveCount(0);await expect(cards.first()).toContainText('COMPLETED');await expect(cards.first()).toContainText('Synthetic Winning School');
  await page.waitForTimeout(750);
  await fs.promises.mkdir('test-results/side-quest-flip',{recursive:true});
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:900});await cards.first().evaluate(node=>node.scrollIntoView({block:'center'}));
   const before=await cards.first().boundingBox();await cards.first().focus();await page.keyboard.press('Enter');await expect(cards.first()).toHaveAttribute('aria-pressed','false');
   await page.waitForTimeout(650);await page.keyboard.press('Space');await expect(cards.first()).toHaveAttribute('aria-pressed','true');await page.waitForTimeout(650);
   const after=await cards.first().boundingBox();assert.equal(before.width,after.width);assert.equal(before.height,after.height);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow');
   await expect(cards.first().locator('.og-flip-face').first()).toHaveCSS('backface-visibility','hidden');
   await cards.first().screenshot({path:`test-results/side-quest-flip/card-${width}.png`});
  }
  await cards.first().click();await game.getByRole('button',{name:'Refresh',exact:true}).click();await expect(cards.first()).toHaveAttribute('aria-pressed','false');
  // Existing completed quests load on the back without any transition class.
  await page.reload();await page.getByLabel('Location Code').fill('9001');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:/Synthetic Manager/}).click();await page.locator('#managerPin').fill('3141');await page.getByRole('button',{name:/Daily Bites/}).click();await page.locator('.og-shortcut').click();
  await expect(cards.first()).toHaveAttribute('aria-pressed','true');assert.equal(await cards.first().evaluate(node=>node.classList.contains('is-animated')),false);
  await expect(cards.first().locator('.og-flip-inner')).toHaveCSS('transition-duration','0s');
  await page.emulateMedia({reducedMotion:'reduce'});data=initial();await game.getByRole('button',{name:'Refresh',exact:true}).click();await expect(game.locator('.og-quest-card')).toHaveCount(2);
  data.quests[0].first_school=2;await game.getByRole('button',{name:'Refresh',exact:true}).click();await expect(cards.first()).toHaveAttribute('aria-pressed','true');await expect(cards.first().locator('.og-flip-inner')).toHaveCSS('transition-duration','0s');
  assert.deepEqual(writes,[],'flips never mutate approvals, photos, credits or points');assert.deepEqual(errors,[]);
  console.log('PASS observed sequential flips, historical defaults/no replay, zero photos, gray cards, keyboard/manual toggles, stable dimensions, desktop/mobile, reduced motion and zero mutations.');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
