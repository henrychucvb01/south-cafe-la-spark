// Browser requests use only a synthetic loopback database. External requests are blocked.
const {chromium,expect}=require('@playwright/test');
const {sql,initialize,quote}=require('./test-bingo-upgrades-local.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const origin='https://spark.cafelalistens.org';
async function main(){
 initialize();
 sql(`DELETE FROM spark_bingo_purchases WHERE location_id=900001;
 DELETE FROM spark_bingo_repairs WHERE card_id IN(select id from spark_bingo_cards where location_id=900001);
 DELETE FROM spark_bingo_repicks WHERE location_id=900001;
 DELETE FROM spark_bingo_cards WHERE location_id=900001;
 DELETE FROM spark_points WHERE location_id=900001;
 INSERT INTO spark_points(location_id,points,point_type,service_date) VALUES(900001,100,'manual',(now() AT TIME ZONE 'America/Los_Angeles')::date);`);
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});
  const errors=[],purchases=[];let lose=true;
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===origin){
    if(url.pathname==='/api/october-games')return route.fulfill({json:{enabled:false}});
    if(url.pathname.startsWith('/api/'))return route.fulfill({json:[]});
    const file=path.resolve('build','.'+(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(path.resolve('build')+path.sep)||!fs.existsSync(file))return route.abort();
    return route.fulfill({body:fs.readFileSync(file),contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.gif':'image/gif'}[path.extname(file)]||'application/octet-stream'});
   }
   if(url.origin==='https://kkrcxqhfzepifhkryodd.supabase.co'&&url.pathname.startsWith('/rest/v1/')){
    const name=url.pathname.split('/').at(-1),body=req.method()==='POST'?req.postDataJSON():{};let result=[];
    if(name==='spark_security_ready')result={version:1,ready:true};
    else if(name==='locations')result={id:900001,location_code:'9001',school_name:'Synthetic Bingo School',active:true};
    else if(name==='spark_employee_directory')result=[{id:900001,employee_name:'Synthetic Manager',location_id:900001}];
    else if(name==='has_manager_pin')result=true;
    else if(name==='ar_training_daily_progress')result={points_awarded:0};
    else if(['spark_login','open_supper_monitoring_session','close_supper_monitoring_session'].includes(name)||name.startsWith('spark_bingo_')){
     const args=Object.entries(body).map(([k,v])=>`${k}=>${v===null?'null':quote(typeof v==='object'?JSON.stringify(v):v)}`).join(',');
     try{const value=sql(`select public.${name}(${args})`);result=name.startsWith('spark_bingo_')?JSON.parse(value):value;}
     catch(e){return route.fulfill({status:400,json:{message:e.message}});}
     if(name==='spark_bingo_buy_replacement') {purchases.push(body);if(lose){lose=false;return route.abort();}}
    }
    return route.fulfill({json:result});
   }
   return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>sessionStorage.setItem('sparkIntroPlayed','yes'));
  await page.goto(origin);await page.getByLabel('Location Code').fill('9001');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:/Synthetic Manager/}).click();await page.locator('#managerPin').fill('3141');await page.getByRole('button',{name:/Daily Bites/}).click();
  const bingo=page.getByRole('region',{name:'SPARK Bingo'});await expect(bingo).toContainText('1 / 25');
  await bingo.getByRole('button',{name:'Use monthly repick',exact:true}).click();await bingo.locator('.bingo-repick-square').first().click();
  const select=bingo.getByLabel('Choose a different task');const goal=await select.locator('option').nth(1).getAttribute('value');await select.selectOption(goal);
  const costButton=bingo.getByRole('button',{name:'Buy replacement — 25 points',exact:true});
  page.once('dialog',d=>d.dismiss());await costButton.click();assert.equal(purchases.length,0);
  await fs.promises.mkdir('test-results/bingo-upgrades',{recursive:true});
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});await bingo.scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
   await expect(costButton).toBeEnabled();await bingo.screenshot({path:`test-results/bingo-upgrades/shop-${width}.png`});
  }
  page.once('dialog',d=>{assert(d.message().includes('Remaining: 75'));d.accept();});await costButton.click();
  await expect(bingo.getByRole('button',{name:'Check pending purchase'})).toBeVisible();await bingo.getByRole('button',{name:'Check pending purchase'}).click();await expect(bingo).toContainText('purchase confirmed');
  assert.equal(purchases.length,2);assert.equal(purchases[0].p_request,purchases[1].p_request);
  assert.equal(sql('select count(*) from spark_bingo_purchases where location_id=900001'),'1');assert.equal(sql('select sum(points) from spark_points where location_id=900001'),'75');
  await bingo.getByRole('button',{name:'Use monthly repick',exact:true}).click();await bingo.locator('.bingo-repick-square').first().click();await select.selectOption(await select.locator('option').nth(1).getAttribute('value'));await bingo.getByRole('button',{name:'Replace square — use monthly repick'}).click();await expect(bingo).toContainText('repick is used');
  await expect(bingo.getByRole('button',{name:'Replace a square',exact:true})).toBeEnabled();assert.equal(sql('select count(*) from spark_bingo_purchases where location_id=900001'),'1');
  assert.deepEqual(errors,[]);console.log('PASS normal manager login and Daily Bites: desktop/390px/320px shop, confirmation/cancel, lost-response retry, exactly one actual debit, free replacement preserved, no runtime errors.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
