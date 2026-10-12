// Production build + real game transactions on the dedicated synthetic database.
// All browser requests are intercepted; no production services or school data are contacted.
const {chromium,expect}=require('@playwright/test');
const {sql}=require('./test-mystery-unlocks-local.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const origin='https://spark.cafelalistens.org';
const picture='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect width="500" height="500" fill="#171717"/><path d="M0 0H250V250H0Z" fill="#e6a851"/><path d="M250 250H500V500H250Z" fill="#86b59f"/></svg>').toString('base64');
async function main(){
 sql(`UPDATE employees SET active=true WHERE id=900001;DELETE FROM spark_private.login_limits;
   DELETE FROM october_live.unlock_credit_events WHERE location_id=900001;
   DELETE FROM public.spark_points WHERE location_id=900001;
   INSERT INTO public.spark_points(location_id,points,point_type,service_date) VALUES(900001,100,'manual',(now() AT TIME ZONE 'America/Los_Angeles')::date);
   INSERT INTO october_live.schools VALUES(900001,true) ON CONFLICT(location_id) DO UPDATE SET participating=true;
   INSERT INTO october_live.rounds(id) SELECT generate_series(1,5) ON CONFLICT DO NOTHING;
   DELETE FROM october_live.unlocks;
   UPDATE october_live.settings SET mystery_state='active';
   UPDATE october_live.rounds SET solved_at=null,winner=null,photo_path='synthetic.webp',unlocked=1,unlock_credits=2,piece_costs=ARRAY[1,3,2,1],pieces='[[[0,0],[500,0],[0,1000]],[[500,0],[500,1000],[0,1000]],[[500,0],[1000,0],[1000,1000]],[[500,0],[1000,1000],[500,1000]]]';`);
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
   const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});
   const errors=[],writes=[];let losePurchase=true;
   await context.route('**/*',async route=>{
     const request=route.request(),url=new URL(request.url());
     if(url.origin===origin){
       if(url.pathname==='/api/october-games'){
         if(request.method()==='GET')return route.fulfill({json:{enabled:true,mode:'production'}});
         const body=request.postDataJSON();
         const action=body.action==='badge'?'list':body.action;
         const result=JSON.parse(sql(`SELECT public.october_games_live(${quote(action)},${quote(body.token)},null,${quote(JSON.stringify(body.payload||{}))}::jsonb);`));
         if(body.action==='badge')return route.fulfill({json:{participating:result.participating,new_challenge:result.new_challenge}});
         result.production=true;for(const round of result.rounds)round.photo_url=picture;
         if(!['seen','list','badge'].includes(body.action))writes.push(body);
         if(body.action==='buy_unlocks'&&losePurchase){losePurchase=false;return route.abort();}
         return route.fulfill({json:result});
       }
       if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Excluded from synthetic visual test'}});
       const file=path.resolve('build','.'+(url.pathname==='/'?'/index.html':url.pathname));
       if(!file.startsWith(path.resolve('build')+path.sep)||!fs.existsSync(file))return route.abort();
       return route.fulfill({body:fs.readFileSync(file),contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.gif':'image/gif'}[path.extname(file)]||'application/octet-stream'});
     }
     if(url.origin==='https://kkrcxqhfzepifhkryodd.supabase.co'&&url.pathname.startsWith('/rest/v1/')){
       const name=url.pathname.split('/').at(-1),body=request.method()==='POST'?request.postDataJSON():{};
       let result=[];
       if(name==='spark_security_ready')result={version:1,ready:true};
       if(name==='locations')result={id:900001,location_code:'9001',school_name:'Synthetic Unlock School',active:true};
       if(name==='spark_employee_directory')result=[{id:900001,employee_name:'Synthetic Manager',location_id:900001}];
       if(name==='has_manager_pin')result=true;
       if(name==='spark_login')result=sql(`SELECT public.spark_login(p_role=>'employee',p_employee_id=>900001,p_pin=>${quote(body.p_pin)});`);
       if(name==='open_supper_monitoring_session')result=sql(`SELECT public.open_supper_monitoring_session(900001,900001,${quote(body.p_pin)},null);`);
       if(name==='breakfast_manager_enabled')result=false;
       if(name==='ar_training_daily_progress')result=null;
       return route.fulfill({json:result});
     }
     return route.abort();
   });
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(()=>sessionStorage.setItem('sparkIntroPlayed','yes'));
   await page.goto(origin);await page.getByLabel('Location Code').fill('9001');await page.getByRole('button',{name:'Continue',exact:true}).click();
   await page.getByRole('button',{name:/Synthetic Manager/}).click();await page.locator('#managerPin').fill('3141');
   await page.getByRole('button',{name:/Daily Bites/}).click();await page.locator('.og-shortcut').click();
   const game=page.locator('.og');await game.getByRole('button',{name:'Mystery Photos',exact:true}).click();
   const shop=game.getByRole('region',{name:'Get More Unlocks'}),buyOne=shop.getByRole('button',{name:/Buy 1 Credit/});
   await expect(shop).toContainText('100 SPARK Points');await expect(game.getByRole('button',{name:'Submit guess',exact:true})).toBeEnabled();
   page.once('dialog',dialog=>dialog.dismiss());await buyOne.click();assert.equal(writes.length,0);
   page.once('dialog',dialog=>dialog.accept());await buyOne.click();await expect(game.getByRole('alert')).toBeVisible();
   const id=writes[0].payload.request_id;assert.equal(sql("SELECT sum(points) FROM spark_points WHERE location_id=900001"),'95');
   page.once('dialog',dialog=>dialog.accept());await buyOne.click();await expect(shop).toContainText('1 unlock credit');
   assert.equal(writes[1].payload.request_id,id);assert.equal(sql("SELECT sum(points) FROM spark_points WHERE location_id=900001"),'95');
   page.once('dialog',dialog=>dialog.accept());await shop.getByRole('button',{name:/Buy 5 Credits/}).click();
   await expect(shop).toContainText('6 unlock credits');await expect(shop).toContainText('75 SPARK Points');
   await shop.getByRole('button',{name:/Reveal next piece/}).click();await expect(shop).toContainText('4 unlock credits');
   await expect(game).toContainText('2 / 4 pieces revealed');assert.equal(sql('SELECT unlocked FROM october_live.rounds WHERE id=1'),'2');
   await expect(game.getByRole('button',{name:'Submit guess',exact:true})).toBeEnabled();
   await fs.promises.mkdir('test-results/mystery-unlocks',{recursive:true});
   for(const width of [1440,390,320]){
     await page.setViewportSize({width,height:900});await shop.scrollIntoViewIfNeeded();
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no mobile overflow');
     for(const button of await shop.getByRole('button').all()){const box=await button.boundingBox();assert.ok(box.height>=44,'touch target');}
     await shop.screenshot({path:`test-results/mystery-unlocks/shop-${width}.png`});
   }
   assert.deepEqual(errors,[]);
   console.log('PASS real synthetic manager flow, cancel/confirm, lost-response idempotency, both prices, reveal, unchanged guessing availability, desktop/mobile and touch targets.');
 } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
