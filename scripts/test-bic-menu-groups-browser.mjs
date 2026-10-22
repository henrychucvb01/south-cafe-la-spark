// Production UI, isolated in-memory SQL and fictional classrooms. Every network
// request is intercepted: this script never contacts the live school database.
import {chromium,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
import {bicTestDatabase} from './bic-test-fixture.mjs';
const db=await bicTestDatabase(),origin='https://spark.cafelalistens.org';
const val=async(sql,args=[])=>(await db.query(sql,args)).rows[0].v;
let browser;
try{
 await db.exec("update locations set school_name='Fictional BIC Pilot',location_code='9001' where id=1");
 const token=await val("select open_supper_monitoring_session(1,11,'1234',null) v");
 const room=await val("select breakfast_save_classroom($1,null,null,'K1','Fictional Teacher',20,'Main',true) v",[token]);
 const classroom=await val("select breakfast_save_classroom($1,null,null,'Grade 2','Fictional Teacher B',20,'Main',true) v",[token]);
 const qr=await val('select breakfast_classroom_qr($1,$2) v',[token,room.id]);
 browser=await chromium.launch({executablePath:process.env.BIC_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1365,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.clock.install({time:new Date('2026-10-06T15:00:00Z')});
 await page.addInitScript(()=>sessionStorage.setItem('sparkIntroPlayed','yes'));
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').at(-1);
  if(url.hostname.endsWith('.supabase.co')){
   let result=[];const body=req.method()==='POST'?req.postDataJSON():{};
   if(name==='locations')result={id:1,school_name:'Fictional BIC Pilot',location_code:'9001',active:true};
   else if(name==='spark_employee_directory')result=[{id:11,employee_name:'Fictional Manager',location_id:1,active:true}];
   else if(['has_manager_pin','verify_manager_pin','breakfast_manager_enabled','breakfast_qr_enabled'].includes(name))result=true;
   else if(name==='spark_security_ready')result={ready:true,version:1};
   else if(name==='spark_login')result='a'.repeat(64);
   else if(name==='open_supper_monitoring_session')result=token;
   else if(name.startsWith('breakfast_')){
    const keys=Object.keys(body);try{result=await val(`select public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')}) v`,keys.map(k=>body[k]));}catch(e){return route.fulfill({status:400,json:{message:e.message,code:'P0001'}});}
   }
   return route.fulfill({json:result});
  }
  if(url.pathname.startsWith('/api/'))return route.fulfill({json:[]});
  if(url.origin===origin){let file=resolve('build','.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(resolve('build')+sep))return route.abort();try{return route.fulfill({body:await readFile(file),contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream'});}catch{return route.abort();}}
  return route.abort();
 });
 await page.goto(origin);await page.getByLabel('Location Code').fill('9001');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:/Fictional Manager/}).click();await page.locator('#managerPin').fill('1234');await page.getByRole('button',{name:/Manage your classroom roster/}).click();
 await page.getByRole('tab',{name:'School Breakfast Menu',exact:true}).click();
 // Manager chooses tomorrow's service date; all CRUD below goes to real SQL.
 await page.getByLabel('Menu service date').fill('2026-10-07');
 await page.getByLabel('Include Entrée 1',{exact:true}).check();await page.getByLabel('Entrée 1 item name',{exact:true}).fill('Fictional Toast');
 await page.getByLabel('Include Entrée 2',{exact:true}).check();await page.getByLabel('Entrée 2 item name',{exact:true}).fill('Fictional Cereal');
 await page.getByLabel('Include 1% white milk 8 oz',{exact:true}).check();await page.getByRole('button',{name:'Save menu',exact:true}).click();
 await page.getByRole('button',{name:'Manage Groups',exact:true}).click();await page.getByRole('button',{name:'+ Create group',exact:true}).click();await page.getByLabel('Group name').fill('Kindergarten');await page.getByLabel('Room K1 · Fictional Teacher · Main',{exact:true}).check();await page.getByRole('button',{name:'Save group',exact:true}).click();await page.locator('.ba-manage-groups').getByRole('button',{name:'Done',exact:true}).click();
 await page.locator('.ba-menu-group-tabs').getByRole('button',{name:/Kindergarten/}).click();await page.getByRole('button',{name:'Copy Menu From',exact:true}).click();await page.getByRole('button',{name:'Copy selected menu',exact:true}).click();await page.getByLabel('Include Entrée 2',{exact:true}).uncheck();await page.getByRole('button',{name:'Save menu',exact:true}).click();
 await page.getByRole('button',{name:'Manage Groups',exact:true}).click();await page.getByRole('button',{name:'+ Create group',exact:true}).click();await page.getByLabel('Group name').fill('Special Milk');await page.getByLabel('Menu type').selectOption('milk');await page.getByLabel('Room K1 · Fictional Teacher · Main',{exact:true}).check();await page.getByRole('button',{name:'Save group',exact:true}).click();await page.locator('.ba-manage-groups').getByRole('button',{name:'Done',exact:true}).click();
 await page.locator('.ba-menu-group-tabs').getByRole('button',{name:/Special Milk/}).click();await page.getByLabel('Include Special milk (authorized classrooms)',{exact:true}).check();await page.getByLabel('Special milk (authorized classrooms) item name',{exact:true}).fill('Almond milk');await page.getByRole('button',{name:'Save menu',exact:true}).click();
 await page.getByRole('button',{name:'Preview Classroom Menu',exact:true}).click();await page.getByLabel('Preview classroom').selectOption(room.id);await expect(page.locator('.ba-preview-menu')).toContainText('Almond milk');await expect(page.locator('.ba-preview-menu')).not.toContainText('Fictional Cereal');await expect(page.locator('.ba-preview-menu')).not.toContainText('1% white milk');
 await mkdir('node_modules/.cache/bic-groups-browser',{recursive:true});await page.locator('.ba-root').screenshot({path:'node_modules/.cache/bic-groups-browser/desktop.png'});
 for(const width of [390,320]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`menu fits ${width}px viewport`);await page.locator('.ba-root').screenshot({path:`node_modules/.cache/bic-groups-browser/mobile-${width}.png`});}
 // Same existing QR opens the teacher's exact resolved next-day preorder menu.
 const today=await val("select breakfast_menu_workspace($1,'2026-10-06') v",[token]);await val("select breakfast_menu_workspace($1,'2026-10-06','classroom_save',$2) v",[token,{revision:today.revision,classroom_id:room.id,items:{entree1:'Today Toast'},confirmed:true}]);
 await page.goto(origin+'/#breakfast/'+qr);await expect(page.getByRole('heading',{name:'Room K1',exact:true})).toBeVisible();
 await page.getByLabel('Today’s Class Attendance').fill('15');await page.getByRole('button',{name:'Add one meal',exact:true}).click();
 const signature=page.getByLabel('Teacher signature drawing area');await signature.scrollIntoViewIfNeeded();const box=await signature.boundingBox();await page.mouse.move(box.x+25,box.y+30);await page.mouse.down();await page.mouse.move(box.x+100,box.y+70,{steps:8});await page.mouse.up();await page.getByRole('button',{name:'Accept signature',exact:true}).click();await page.locator('.ba-certification input[type=checkbox]').check();await page.getByRole('button',{name:'Submit breakfast count',exact:true}).click();
 await expect(page.locator('#ba-preorder')).toContainText('Almond milk');await expect(page.locator('#ba-preorder')).not.toContainText('Fictional Cereal');await page.locator('#ba-preorder').getByLabel('Fictional Toast',{exact:true}).fill('10');await page.locator('#ba-preorder').getByLabel('Almond milk',{exact:true}).fill('2');await page.getByRole('button',{name:'Save pre-order',exact:true}).click();await expect(page.locator('#ba-preorder')).toContainText('Pre-order saved.');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'teacher page fits mobile');
 const p=await val('select breakfast_teacher_page($1) v',[qr]);assert.deepEqual(p.preorder_menu,{entree1:'Fictional Toast',milkSpecial:'Almond milk'});assert.equal((await val('select breakfast_classroom_qr($1,$2) v',[token,room.id])),qr);
 assert.deepEqual(errors,[]);console.log('PASS browser: real SQL group CRUD/multiple membership, copy/uncheck/save, special milk overlay, exact classroom preview, unchanged QR and 1365/390/320px layouts with no overflow.');
}finally{if(browser)await browser.close();await db.close();}
