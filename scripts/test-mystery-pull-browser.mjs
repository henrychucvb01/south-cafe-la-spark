import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium,expect} from '@playwright/test';
import {PGlite} from '@electric-sql/pglite';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create table locations(id bigint primary key,school_name text,location_code text,active boolean);insert into locations values(1,'Test School','1111',true),(2,'Other School','2222',true);`);
await db.exec(await readFile('supabase/migrations/202609250010_mystery_pull.sql','utf8'));
await db.exec(`create table spark_points(location_id bigint references locations(id),points integer,point_type text,description text,service_date date,source text,unique_key text unique);`);
await db.exec(await readFile('supabase/migrations/202609260001_mystery_pull_prize_bundles.sql','utf8'));
await db.exec('set role anon');
const functions={mystery_open:['p_code'],mystery_choose_school:['p_token','p_location_code'],mystery_close:['p_token'],mystery_context:['p_token'],mystery_history:['p_token','p_before','p_waiting_only'],mystery_pull:['p_token','p_request','p_revision'],mystery_pull_result:['p_token','p_request'],mystery_admin:['p_token','p_request','p_payload']};
const build=resolve('build'),server=createServer(async(req,res)=>{try{let path=resolve(build,'.'+new URL(req.url,'http://localhost').pathname);if(path!==build&&!path.startsWith(build+sep))return res.writeHead(403).end();if(path===build)path=resolve(build,'index.html');res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.json':'application/json'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
let loseNextPull=false,requests=[],errors=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>sessionStorage.setItem('sparkIntroPlayed','yes'));
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();if(url.hostname!=='kkrcxqhfzepifhkryodd.supabase.co')return route.abort();
  const name=url.pathname.split('/').at(-1);if(!functions[name])return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  const params=req.postDataJSON(),args=functions[name].map(k=>params[k]??(k==='p_waiting_only'?false:null));requests.push({name,args});
  try{const data=(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
   if(name==='mystery_pull'&&loseNextPull){loseNextPull=false;return route.abort('failed');}
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  }catch(e){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:e.code||'P0001',message:e.message})});}
 });
 async function enter(code){await page.getByLabel('Mystery Pull access code',{exact:true}).fill(code);await page.getByRole('button',{name:'Enter Mystery Pull',exact:true}).click();}
 async function school(){await enter('1234');await page.getByLabel('Your school/location code').fill('1111');await page.getByRole('button',{name:'Find my school'}).click();await expect(page.getByRole('heading',{name:'Test School',exact:true})).toBeVisible();}
 async function dragTo(fraction){const slider=page.getByRole('slider');await slider.scrollIntoViewIfNeeded();const box=await slider.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+30);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+30+(box.height-76)*fraction,{steps:15});await page.mouse.up();}
 await page.goto(origin);await expect(page.getByRole('button',{name:'✦ Mystery Pull',exact:true})).toHaveCount(0);
 await page.locator('input').first().fill('1234');await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.getByLabel('Your school/location code')).toBeVisible();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await enter('0928');await expect(page.getByRole('heading',{name:'Mystery Pull Control Room'})).toBeVisible();
 await page.getByRole('combobox',{name:/^School/}).selectOption('1');await page.getByLabel('Number of tokens').fill('3');await page.getByRole('button',{name:'Save token change'}).click();await expect(page.getByRole('status')).toContainText('Saved');
 await page.getByRole('button',{name:'Prize inventory',exact:true}).click();await page.getByRole('button',{name:'Edit Candy Bag',exact:true}).click();await page.getByLabel('Quantity',{exact:true}).fill('1');await page.getByRole('button',{name:'Save inventory change'}).click();await expect(page.getByRole('status')).toContainText('Saved');
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await school();await expect(page.locator('.mystery-token-count strong')).toHaveText('3');
 assert.deepEqual(await page.locator('.mystery-fruit-orbit span').allTextContents(),['🍋','🍊','🍎','🍓','🍍']);
 assert(!await page.getByText('OUT OF STOCK',{exact:true}).count());assert(!await page.getByRole('button',{name:/fulfill|Edit Candy|Add a prize/i}).count());
 await mkdir('test-results/mystery-pull',{recursive:true});await page.screenshot({path:'test-results/mystery-pull/phone-ready.png',fullPage:true});
 await dragTo(.5);assert.equal(requests.filter(r=>r.name==='mystery_pull').length,0);
 await dragTo(1.1);await expect(page.getByRole('heading',{name:'Something good is on its way…'})).toBeVisible();
 await expect(page.locator('.mystery-spin-border')).toHaveCSS('animation-name','mystery-z-spin');await expect(page.locator('.mystery-swirl-one')).toHaveCSS('animation-name','mystery-orbit-turn');
 await page.screenshot({path:'test-results/mystery-pull/phone-drawing.png',fullPage:true});
 await expect(page.locator('.mystery-prize-stage h2')).toHaveText('Candy Bag',{timeout:12000});await expect(page.locator('.mystery-prize-icon')).toHaveCSS('animation-name','mystery-prize-burst');await expect(page.locator('.mystery-token-count strong')).toHaveText('2');
 await expect(page.locator('.mystery-inventory')).toContainText('Waiting');await expect(page.locator('.mystery-prize-stage .mystery-prize-icon')).toHaveCSS('opacity','1');await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:'test-results/mystery-pull/phone-reveal.png',fullPage:true});
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await enter('0928');await page.getByRole('button',{name:'Prizes & history',exact:true}).click();await expect(page.locator('.mystery-admin')).toContainText('Candy Bag');await page.locator('.mystery-history-record summary').first().click();await page.getByRole('button',{name:'Mark received / fulfilled'}).click();await expect(page.getByText('No prizes waiting for fulfillment.')).toBeVisible();
 await page.getByRole('combobox',{name:/^Show/}).selectOption('all');await expect(page.locator('.mystery-history-list')).toContainText('Received / Fulfilled ✓');
 await page.getByRole('button',{name:'Prize inventory',exact:true}).click();await page.getByRole('button',{name:'Edit Extra Mystery Pull',exact:true}).click();await page.getByLabel('Quantity',{exact:true}).fill('1');await page.getByRole('button',{name:'Save inventory change'}).click();await expect(page.getByRole('status')).toContainText('Saved');
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await school();await expect(page.locator('.mystery-inventory')).toContainText('Received ✓');
 await expect(page.locator('.mystery-fruit-orbit span')).toHaveCount(5);
 loseNextPull=true;await page.getByRole('slider').press('End');await expect(page.getByRole('button',{name:'Continue saved pull'})).toBeVisible({timeout:10000});
 const lostRequest=requests.filter(r=>r.name==='mystery_pull').at(-1).args[1];await page.reload();await expect(page.locator('.mystery-prize-stage h2')).toHaveText('Extra Mystery Pull');await expect(page.locator('.mystery-token-count strong')).toHaveText('2');
 assert.equal(requests.filter(r=>r.name==='mystery_pull'&&r.args[1]===lostRequest).length,1,'Reload recovers the stored win without another draw');
 await page.getByRole('button',{name:'Back to the pull'}).click();await expect(page.getByRole('slider')).toHaveAttribute('aria-disabled','true');await expect(page.getByText('Prizes are being restocked.',{exact:false})).toBeVisible();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
 await page.setViewportSize({width:1360,height:900});await page.screenshot({path:'test-results/mystery-pull/desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await enter('0928');
 await page.getByRole('button',{name:'Prize inventory',exact:true}).click();await page.getByRole('button',{name:'Add a prize',exact:true}).click();
 await page.getByLabel('Prize name',{exact:true}).fill('SPARK Points Bundle');await page.getByLabel('Prize description',{exact:true}).fill('School points and another chance.');
 await page.getByRole('combobox',{name:/^Fulfillment/}).selectOption('spark_points');await page.getByLabel('SPARK points awarded',{exact:false}).fill('15');
 await page.getByLabel('Include 1 extra pull with this prize',{exact:true}).check();
 const columns=await page.locator('.mystery-prize-fields').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);assert.equal(columns,2);
 await page.screenshot({path:'test-results/mystery-pull/desktop-editor.png',fullPage:true});
 await page.getByRole('button',{name:'Save prize',exact:true}).click();await expect(page.getByRole('status')).toContainText('Saved');
 await page.getByRole('button',{name:'Edit SPARK Points Bundle',exact:true}).click();await page.getByLabel('Quantity',{exact:true}).fill('1');await page.getByRole('button',{name:'Save inventory change'}).click();await expect(page.getByRole('status')).toContainText('Saved');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Sign out',exact:true}).click();await school();
 await page.getByRole('slider').press('End');await expect(page.locator('.mystery-prize-stage h2')).toHaveText('SPARK Points Bundle');
 await expect(page.locator('.mystery-prize-stage')).toContainText('+15 SPARK points added to Test School');await expect(page.locator('.mystery-prize-stage')).toContainText('Plus 1 extra pull');
 await expect(page.locator('.mystery-token-count strong')).toHaveText('2');
 await db.exec('reset role');const credit=(await db.query('select * from spark_points')).rows;assert.equal(credit.length,1);assert.equal(credit[0].location_id,1);assert.equal(credit[0].points,15);
 assert.deepEqual(errors,[]);console.log('PASS: full UI → isolated PostgreSQL flow, supervisor tokens/stock/fulfillment, physical slide threshold, animation/reveal, hidden inventory, lost-response refresh recovery, automatic extra token, restocking guard, mobile layout; no runtime errors.');
 await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));await db.close();}
