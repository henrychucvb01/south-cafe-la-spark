const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const origin='https://spark.cafelalistens.org';
const data={admin:false,location_id:32,identified:true,participating:false,
 settings:{quests_state:'active',door_state:'active',mystery_state:'active'},
 schools:[{id:32,school_name:'Test High School',participating:false}],quests:[],entries:[],guesses:[],unlock_events:[],rewards:[],
 rounds:[],current_round:null,collections:[],unlock_shop:{balance:2,points:100},guess_shop:null};

async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});
  const errors=[],mutations=[];
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin===origin&&u.pathname==='/api/october-games'){
    if(req.method()==='GET')return route.fulfill({json:{enabled:true,mode:'production'}});
    const body=req.postDataJSON();if(!['seen','list','badge'].includes(body.action))mutations.push(body);
    return route.fulfill({json:structuredClone(data)});
   }
   if(u.origin===origin&&u.pathname.startsWith('/api/'))return route.fulfill({json:[]});
   if(u.origin===origin){
    const file=path.resolve('build','.'+(u.pathname==='/'?'/index.html':u.pathname));
    if(!file.startsWith(path.resolve('build')+path.sep)||!fs.existsSync(file))return route.abort();
    return route.fulfill({body:fs.readFileSync(file),contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]||'application/octet-stream'});
   }
   if(u.hostname.endsWith('.supabase.co')){
    const name=u.pathname.split('/').at(-1);
    return route.fulfill({json:name==='spark_login'?'a'.repeat(64):name==='spark_security_ready'?{ready:true,version:1}:name==='locations'?{id:32,school_name:'Test High School',location_code:'0032',active:true}:name==='spark_employee_directory'?[{id:900001,employee_name:'Synthetic Manager',location_id:32}]:name==='has_manager_pin'?true:name==='open_supper_monitoring_session'?'b'.repeat(64):[]});
   }
   return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>sessionStorage.setItem('sparkIntroPlayed','yes'));
  await page.goto(origin);await page.getByLabel('Location Code').fill('0032');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:/Synthetic Manager/}).click();await page.locator('#managerPin').fill('3141');
  await page.getByRole('button',{name:/Daily Bites/}).click();await page.locator('.og-shortcut').click();
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   await page.locator('.og').getByRole('button',{name:'Mystery Photos',exact:true}).click();
   await expect(page.getByRole('heading',{name:'Mystery Photo Unlock',exact:false})).toBeVisible();
   await expect(page.getByRole('button',{name:'Buy 1 Credit',exact:false})).toBeDisabled();
   await page.getByRole('button',{name:'Preview manager experience',exact:true}).click();
   await expect(page.getByRole('button',{name:'Buy 1 Credit',exact:false})).toBeEnabled();
   await page.getByRole('button',{name:'Exit manager preview',exact:true}).click();
   await page.locator('.og').getByRole('button',{name:'Side Quests',exact:true}).click();
   await expect(page.locator('.og').getByRole('button',{name:'Mystery Photos',exact:true})).toBeVisible();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
  console.log('PASS Test High School: normal manager navigation, empty Mystery Photo, preview toggle, return to Side Quests, desktop/mobile, no page errors or writes.');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
