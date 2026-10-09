// Production-origin rendering with ALL traffic intercepted to local fixtures/files.
const {chromium,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {sql}=require('./test-security-auth-local.cjs');
async function main(){
 sql("delete from spark_private.login_limits; NOTIFY pgrst,'reload schema';");
 const id=sql("insert into spark_feedback(category,message,page_route) values('Bug','Synthetic unread browser test','test') returning id;");
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}}),errors=[];
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin==='https://spark.cafelalistens.org'){
    if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"error":"No external service in local browser test"}'});
    const file=path.resolve('build','.'+(u.pathname==='/'?'/index.html':u.pathname));
    if(!file.startsWith(path.resolve('build')+path.sep))return route.abort();
    if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({status:200,contentType:({'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
   }
   if(u.origin==='https://kkrcxqhfzepifhkryodd.supabase.co'&&u.pathname.startsWith('/rest/v1/')){
    const headers={};for(const [k,v] of Object.entries(req.headers()))if(['accept','content-type','prefer','range','range-unit','x-spark-session'].includes(k))headers[k]=v;
    const r=await fetch('http://127.0.0.1:55433'+u.pathname.slice(8)+u.search,{method:req.method(),headers,body:req.postData()||undefined});
    return route.fulfill({status:r.status,contentType:'application/json',body:await r.text()});
   }
   return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{sessionStorage.setItem('sparkIntroPlayed','yes');window.permissionRequests=0;Notification.requestPermission=async()=>{window.permissionRequests++;return 'denied';};});
  await page.goto('https://spark.cafelalistens.org');
  await page.getByRole('button',{name:/Supervisor/}).click();await page.locator('input[type=password]').fill('1618');await page.getByRole('button',{name:/Open Command Center/}).click();
  const bell=page.getByRole('button',{name:/^Notifications/});await expect(bell).toBeVisible();await bell.click();
  for(const name of ['Photo Side Quests','Monitoring','Feedback'])await expect(page.locator('.notification-panel').getByRole('button',{name:new RegExp(name)})).toBeVisible();
  await page.screenshot({path:'.security-runtime/notification-desktop.png',fullPage:true});
  await page.locator('.notification-panel').getByRole('button',{name:/Feedback/}).click();
  await expect(page.getByText('Synthetic unread browser test')).toBeVisible();
  await page.locator('.supervisor-feedback-card').filter({hasText:'Synthetic unread browser test'}).getByRole('button',{name:'Mark as read'}).click();
  await expect(page.getByText('Synthetic unread browser test')).toHaveCount(0);
  assert.equal(sql(`select read_at is not null from spark_feedback where id='${id}'`),'t');
  await page.getByRole('button',{name:'All',exact:true}).click();
  await page.locator('.supervisor-feedback-card').filter({hasText:'Synthetic unread browser test'}).getByRole('button',{name:'Mark unread'}).click();
  assert.equal(sql(`select read_at is null from spark_feedback where id='${id}'`),'t');
  await page.setViewportSize({width:390,height:844});await bell.click();
  await expect(page.locator('.notification-panel')).toBeVisible();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');
  await page.screenshot({path:'.security-runtime/notification-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Notification settings',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.permissionRequests),0,'no unsolicited permission request');
  await page.getByRole('button',{name:'Enable Notifications',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Notifications are off');
  assert.equal(await page.evaluate(()=>window.permissionRequests),1);
  const manifest=await page.evaluate(async()=>await(await fetch('/manifest.json')).json());
  assert.equal(manifest.display,'standalone');for(const icon of manifest.icons)assert(fs.existsSync(path.resolve('public','.'+icon.src)));
  assert.deepEqual(errors,[]);console.log('PASS: actual Command Center desktop/mobile bell, categories, feedback read/unread, settings, permission gesture/denial and PWA manifest. All browser traffic stayed local.');
 }finally{await browser.close();sql(`delete from spark_feedback where id='${id}'`);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
