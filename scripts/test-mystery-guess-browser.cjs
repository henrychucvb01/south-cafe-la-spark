// Actual production build, with every network request intercepted to local fixtures.
const {chromium,expect}=require('@playwright/test'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {sql}=require('./test-security-auth-local.cjs');
const image='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect width="500" height="500" fill="#171717"/></svg>').toString('base64');
async function main(){
 sql("update employees set active=true where id=900001;delete from spark_private.login_limits;");
 const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],writes=[];
 const data={admin:true,production:true,identified:true,participating:true,location_id:900001,current_round:1,server_time:new Date().toISOString(),settings:{revision:1,quests_state:'active',mystery_state:'active',door_state:'active'},schools:[{id:900001,school_name:'Synthetic A',participating:true}],quests:[],entries:[],rewards:[],unlock_events:[],guesses:[{attempt_key:'original:1:900001',round:1,employee_id:'900001',location_id:900001,guess:'test spelling',correct:false,submitted_at:new Date().toISOString()}],rounds:[{id:1,revision:1,answer:'Test photo',aliases:[],photo_url:image,piece_count:4,unlocked:1,unlock_credits:2,piece_costs:[1,3,2,1],pieces:[[[0,0],[500,0],[0,1000]],[[500,0],[500,1000],[0,1000]],[[500,0],[1000,0],[1000,1000]],[[500,0],[1000,1000],[500,1000]]],reward_points:75}],guess_shop:{next_price:10,balance:500,used_today:false,free_available:true,available:0,tomorrow:0}};
 try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin==='https://spark.cafelalistens.org'){
   if(u.pathname==='/api/october-games'){
    if(req.method()==='GET')return route.fulfill({json:{enabled:true,mode:'production'}});
    const body=req.postDataJSON();if(!['list','seen','badge'].includes(body.action))writes.push(body);
    if(body.action==='badge')return route.fulfill({json:{participating:true,new_challenge:false}});
    if(body.action==='accept_guess'){data.guesses[0].correct=true;data.guesses[0].supervisor_accepted=true;data.rounds[0].solved_at=new Date().toISOString();data.rounds[0].winner=900001;data.rounds[0].winner_name='Synthetic A';data.current_round=null;}
    if(body.action==='buy_guess'){data.guess_shop.balance-=10;data.guess_shop.next_price=25;data.guess_shop.tomorrow=1;}
    return route.fulfill({json:data});
   }
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Local test only'}});
   const file=path.resolve('build','.'+(u.pathname==='/'?'/index.html':u.pathname));
   if(!file.startsWith(path.resolve('build')+path.sep)||!fs.existsSync(file))return route.abort();
   return route.fulfill({body:fs.readFileSync(file),contentType:({'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png'})[path.extname(file)]||'application/octet-stream'});
  }
  if(u.origin==='https://kkrcxqhfzepifhkryodd.supabase.co'&&u.pathname.startsWith('/rest/v1/')){
   const headers={};for(const[k,v]of Object.entries(req.headers()))if(['accept','content-type','prefer','range','range-unit','x-spark-session'].includes(k))headers[k]=v;
   const r=await fetch('http://127.0.0.1:55433'+u.pathname.slice(8)+u.search,{method:req.method(),headers,body:req.postData()||undefined});return route.fulfill({status:r.status,contentType:'application/json',body:await r.text()});
  }
  return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>sessionStorage.setItem('sparkIntroPlayed','yes'));
 await page.goto('https://spark.cafelalistens.org');await page.getByRole('button',{name:/Supervisor/}).click();await page.locator('input[type=password]').fill('1618');await page.getByRole('button',{name:/Open Command Center/}).click();
 await page.getByRole('button',{name:'Games & Challenges',exact:true}).first().click();
 const games=page.locator('.og');await expect(games).toBeVisible();await games.getByRole('button',{name:'Games & Challenges',exact:true}).click();
 await games.locator('summary').filter({hasText:'Guesses, unlocks and awarded points'}).click();
 await expect(games.getByRole('button',{name:'Accept as correct'})).toBeVisible();page.once('dialog',d=>d.accept());await games.getByRole('button',{name:'Accept as correct'}).click();
 await expect(games.getByText('Correct — accepted by supervisor')).toBeVisible();await games.getByRole('button',{name:'Mystery Photos',exact:true}).click();await expect(games.getByText(/Solved by: Synthetic A/)).toBeVisible();
 await page.screenshot({path:'.security-runtime/mystery-solved-desktop.png',fullPage:true});
 // Switch to an isolated manager login using the same local authentication system.
 await context.clearCookies();await page.evaluate(()=>{sessionStorage.clear();localStorage.clear();});data.admin=false;data.current_round=1;data.rounds[0].solved_at=null;
 await page.reload();await page.locator('#locationCode').fill('9001');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:/Synthetic Manager/}).click();await page.locator('#managerPin').fill('3141');
 await page.getByRole('button',{name:/Daily Bites/}).click();await page.locator('.og-shortcut').click();await games.getByRole('button',{name:'Mystery Photos',exact:true}).click();
 await expect(games.locator('.og-unlock-number')).toHaveText(['2','2','1']);
 page.once('dialog',d=>d.dismiss());await games.getByRole('button',{name:'Extra guess · 10 SPARK Points'}).click();assert.equal(writes.filter(w=>w.action==='buy_guess').length,0);
 page.once('dialog',d=>d.accept());await games.getByRole('button',{name:'Extra guess · 10 SPARK Points'}).click();await expect(games.getByText(/1 available tomorrow/)).toBeVisible();assert.equal(writes.filter(w=>w.action==='buy_guess').length,1);
 await page.screenshot({path:'.security-runtime/mystery-manager-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');await page.screenshot({path:'.security-runtime/mystery-manager-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS: actual build supervisor override, solved winner, manager unlock labels, purchase confirmation/cancel, tomorrow status, desktop/mobile. All traffic intercepted locally.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
