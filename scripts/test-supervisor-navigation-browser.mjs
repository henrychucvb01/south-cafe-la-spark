import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium,expect} from '@playwright/test';
const build=resolve('build');
const server=createServer(async(req,res)=>{try{let path=resolve(build,'.'+new URL(req.url,'http://localhost').pathname);if(path!==build&&!path.startsWith(build+sep))return res.writeHead(403).end();if(path===build)path=resolve(build,'index.html');res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch(e){res.writeHead(500).end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:process.env.SPARK_TEST_BROWSER||'chrome',headless:true});
const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>sessionStorage.setItem('sparkIntroPlayed','yes'));
await page.route('https://kkrcxqhfzepifhkryodd.supabase.co/**',async route=>{
 const name=new URL(route.request().url()).pathname.split('/').at(-1);
 let body=[];
 if(name==='verify_supervisor_pin')body=true;
 if(name==='supper_supervisor_overview')body={schools:[],records:[],sites:[],allow_manager_uploads:true};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
});
const origin='http://127.0.0.1:'+server.address().port;
async function login(){await page.goto(origin);await page.getByRole('button',{name:'Supervisor Access',exact:true}).click();await page.locator('input[type=password]').fill('9999');await page.getByRole('button',{name:'Open Command Center'}).click();await expect(page.locator('.command-main')).toBeVisible();}
const nav=page.getByRole('navigation',{name:'Supervisor pages'}),menu=page.getByRole('button',{name:'Open Supervisor menu'});
const pageNav=page.getByRole('navigation',{name:'SPARK page navigation'});
async function stickyParent(label) {
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
 await expect(pageNav).toBeInViewport();
 const box=await pageNav.boundingBox();assert.equal(Math.round(box.y),0);assert.ok(box.height<=56);
 await pageNav.getByRole('button',{name:'← '+label,exact:true}).click();
 await expect(page.locator('input[type=password]')).toHaveCount(0);
 assert.equal(new URL(page.url()).origin,origin);
}
async function geometry(){
 const result=await nav.evaluate(node=>{const boxes=[...node.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,width:r.width,height:r.height,scroll:b.scrollWidth,client:b.clientWidth};});return {boxes,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth};});
 assert.equal(result.boxes.length,15);
 for(let i=0;i<result.boxes.length;i++){const b=result.boxes[i];assert.ok(b.height>=44);assert.ok(b.scroll<=b.client+1,'label fits row');if(i)assert.ok(b.top>=result.boxes[i-1].bottom,'rows never overlap');}
 assert.ok(result.scrollWidth<=result.clientWidth+1);
 await nav.getByRole('button',{name:/Manager PIN Reset/}).scrollIntoViewIfNeeded();await expect(nav.getByRole('button',{name:/Manager PIN Reset/})).toBeInViewport();
 await nav.getByRole('button',{name:/Exit Supervisor/}).scrollIntoViewIfNeeded();await expect(nav.getByRole('button',{name:/Exit Supervisor/})).toBeInViewport();
 return result;
}
try{
 await mkdir('test-results/supervisor-navigation',{recursive:true});
 await login();
 for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[760,600],[768,1024],[1024,768],[1440,900],[1280,400],[320,360]]){
  await page.setViewportSize({width,height});
  const mobile=width<=760;
  if(mobile){await expect(menu).toBeVisible();await expect(nav).toBeHidden();const box=await page.locator('.command-main').boundingBox();assert.ok(box.x<1&&box.width>=width-1);await menu.click();await expect(page.getByRole('dialog',{name:'Supervisor navigation'})).toBeVisible();await expect(page.locator('.command-main')).toHaveAttribute('inert','');}
  else {await expect(menu).toHaveCount(0);await expect(nav).toBeVisible();assert.equal(Math.round((await page.locator('.command-sidebar').boundingBox()).width),245);}
  const sizes=await geometry();
  if(height<=600)assert.ok(sizes.scrollHeight>sizes.clientHeight,'navigation scrolls within short viewport');
  if(mobile){await nav.getByRole('button',{name:/Manager PIN Reset/}).click();await expect(nav).toBeHidden();await expect(page.locator('.command-topbar h2')).toContainText('Manager PIN Reset');await menu.click();await expect(nav.locator('.active')).toContainText('Manager PIN Reset');await nav.getByRole('button',{name:/Dashboard/}).click();await expect(nav).toBeHidden();}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'no horizontal page overflow at '+width);
  console.log('PASS viewport '+width+'x'+height);
 }
 await page.setViewportSize({width:390,height:600});await menu.click();
 const close=page.getByRole('button',{name:'Close menu ×'});
 await expect(close).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(nav.getByRole('button',{name:/Exit Supervisor/})).toBeFocused();await page.keyboard.press('Tab');await expect(close).toBeFocused();await page.keyboard.press('Escape');await expect(nav).toBeHidden();await expect(menu).toBeFocused();
 await menu.click();await close.click();await expect(nav).toBeHidden();
 await menu.click();await page.locator('.command-nav-backdrop').click({position:{x:380,y:20}});await expect(nav).toBeHidden();
 for(const name of ['Finish Line','Meal Analytics','MPLH Report','SPARK Points','Manager PIN Reset','Dashboard']){await menu.click();await nav.getByRole('button',{name:new RegExp(name)}).click();await expect(nav).toBeHidden();await expect(page.locator('.command-main')).toBeVisible();}
 await menu.click();await page.screenshot({path:'test-results/supervisor-navigation/mobile-drawer.png',fullPage:true});
 await nav.getByRole('button',{name:'Monitoring',exact:true}).click();await expect(page.getByRole('heading',{name:'Monitoring',exact:true})).toBeVisible();
 await stickyParent('Command Center');await expect(menu).toBeVisible();await expect(nav).toBeHidden();
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:600});
  for(const name of ['Monthly Scorecards','Meal Audit','Labor Optimization','Staffing','Leaderboard','Location Directory','Feedback','Finish Line','Meal Analytics','MPLH Report','SPARK Points','Manager PIN Reset']){
   if(width<760)await menu.click();
   await nav.getByRole('button',{name:new RegExp(name)}).click();
   if(name==='Monthly Scorecards'){
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await page.screenshot({path:`test-results/supervisor-navigation/sticky-scorecards-${width}.png`});
   }
   await stickyParent('Command Center');await expect(pageNav).toContainText('Command Center');
   await expect(pageNav.getByRole('button',{name:'← Command Center',exact:true})).toHaveCount(0);
  }
 }
 await page.setViewportSize({width:1440,height:400});await geometry();await page.screenshot({path:'test-results/supervisor-navigation/short-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:600});await menu.click();await nav.getByRole('button',{name:/Exit Supervisor/}).click();await expect(page.getByRole('heading',{name:'Welcome, Manager'})).toBeVisible();
 await login();await page.setViewportSize({width:1440,height:400});await nav.getByRole('button',{name:/Exit Supervisor/}).click();await expect(page.getByRole('heading',{name:'Welcome, Manager'})).toBeVisible();
 assert.deepEqual(errors,[]);
 console.log('PASS keyboard focus/escape, backdrop/close, navigation and active states, Monitoring round-trip, mobile and desktop Exit Supervisor.');
}catch(e){console.error(await page.evaluate(()=>[...document.querySelectorAll('.command-main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(0,30)));console.error((await page.locator('body').innerText()).slice(0,5000));throw e;}finally{await browser.close();await new Promise(r=>server.close(r));}
