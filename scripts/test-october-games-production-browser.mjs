import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium,expect} from '@playwright/test';
import {PGlite} from '@electric-sql/pglite';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {createHandler} from '../api/october-games.js';
import {makePieces} from '../lib/octoberGeometry.js';
const db=new PGlite(),photos=new Map();let origin;
await db.exec(`create role anon;create role authenticated;create role service_role;create schema storage;create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table locations(id bigint primary key,school_name text,active boolean);insert into locations select n,'School '||n,true from generate_series(1,28)n;
 create table supper_monitoring_sessions(location_id bigint,employee_id bigint,actor_role text);
 create function verify_supervisor_pin(text) returns boolean language sql as $$select $1='test-admin'$$;
 create function require_supper_monitoring_session(text) returns supper_monitoring_sessions language plpgsql as $$begin if $1='school1' then return (1,11,'manager')::supper_monitoring_sessions;else raise exception 'Invalid session';end if;end$$;`);
await db.exec(await readFile('supabase/migrations/202610080001_october_games_development.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/202610080002_october_games_display.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/202610080003_october_first_school_quests.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/202610080004_october_quest_completion_lock.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/202610080005_october_custom_quests.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/202610080006_october_quest_rewards.sql','utf8'));
await db.exec(`create table spark_points(location_id bigint,points int,point_type text,description text,service_date date,source text,unique_key text unique);create table spark_monthly_cup_results(month date,location_id bigint,points int,rank int);`);
await db.exec(await readFile('supabase/migrations/202610080007_october_games_production.sql','utf8'));
const rpc=async(action,payload={},admin=true)=>(await db.query('select october_games_live($1,$2,$3,$4) r',[action,admin?null:'school1',admin?'test-admin':null,payload])).rows[0].r;
const example=await sharp({create:{width:2400,height:1800,channels:3,background:'#ce7138'}}).jpeg().toBuffer();
const webp=await sharp(example).resize(900).webp().toBuffer();const path='00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp';photos.set(path,webp);
for(let id=1;id<=5;id++)await rpc('round',{id,revision:1,answer:'Test '+id,aliases:[],photo_path:path,pieces:makePieces()});
await db.exec(`update october_live.settings set quests_state='active',door_state='active',mystery_state='active',submission_start=now()-interval '1 day',submission_end=now()+interval '1 day',voting_start=now()+interval '2 days',voting_end=now()+interval '3 days'`);
const bucket={upload:async(path,bytes)=>{photos.set(path,bytes);return{};},remove:async paths=>{paths.forEach(p=>photos.delete(p));return{};},download:async path=>({data:new Blob([photos.get(path)])}),createSignedUrl:async path=>({data:{signedUrl:origin+'/photo/'+encodeURIComponent(path)}}),createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:origin+'/photo/'+encodeURIComponent(path)}))})};
const handler=createHandler({storage:{from:()=>bucket},rpc:async(name,args)=>{try{return{data:(await db.query('select october_games_live($1,$2,$3,$4) r',[args.p_action,args.p_token,args.p_pin,args.p_payload])).rows[0].r};}catch(e){return{error:{message:e.message}};}}},true,true);
const build=resolve('build');const server=createServer(async(req,res)=>{
 try{const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/october-games'){let text='';for await(const chunk of req)text+=chunk;return handler({method:req.method,body:text?JSON.parse(text):{}},{setHeader:(...a)=>res.setHeader(...a),status(s){res.statusCode=s;return this;},json(v){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));}});}
  if(url.pathname.startsWith('/photo/')){res.setHeader('Content-Type','image/webp');return res.end(photos.get(decodeURIComponent(url.pathname.slice(7))));}
  if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');return res.end('[]');}
  let path=resolve(build,'.'+url.pathname);if(path!==build&&!path.startsWith(build+sep))return res.writeHead(403).end();if(path===build)path=resolve(build,'index.html');
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.json':'application/json'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));
 }catch(e){res.writeHead(500).end(e.message);}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());await page.addInitScript(()=>sessionStorage.setItem('sparkIntroPlayed','yes'));
 await page.route('https://kkrcxqhfzepifhkryodd.supabase.co/**',async route=>{
  const url=new URL(route.request().url()),name=url.pathname.split('/').at(-1);let result=[];
  if(name==='locations')result=url.searchParams.has('location_code')?{id:1,school_name:'School 1',location_code:'1111',active:true}:Array.from({length:28},(_,i)=>({id:i+1,school_name:'School '+(i+1),location_code:String(1111+i),active:true}));
  if(name==='employees')result=[{id:11,employee_name:'Test Manager',location_id:1,active:true}];
  if(['has_manager_pin','verify_manager_pin'].includes(name))result=true;
  if(name==='open_supper_monitoring_session')result='school1';
  if(name==='breakfast_manager_enabled')result=false;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto(origin);await page.locator('#locationCode').fill('1111');await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('button',{name:/Test Manager/}).click();await page.locator('#managerPin').fill('1234');
 await page.getByRole('button',{name:/Daily Bites/}).click();await expect(page.locator('.og-shortcut')).toBeVisible();await expect(page.locator('.og')).toHaveCount(0);assert.equal((await db.query('select count(*) n from october_live.seen')).rows[0].n,0);await page.locator('.og-shortcut').click();const games=page.locator('.og').first();await expect(games.getByRole('heading',{name:'A little mystery. A lot of SPARK.'})).toBeVisible();
 await expect(page.getByText('Daily Bites Comic',{exact:true})).toHaveCount(0);
 await expect(games.getByRole('button',{name:'Games & Challenges',exact:true})).toHaveCount(0);await expect(games.getByText('Earn SPARK Points for your school.')).toBeVisible();
 await games.getByRole('button',{name:'Upload photo',exact:true}).first().click();
 await games.locator('input[type=file]').first().setInputFiles({name:'test.jpg',mimeType:'image/jpeg',buffer:example});
 await expect(games.locator('.og-photo-picker img')).toBeVisible();const compressed=await games.locator('.og-photo-picker img').getAttribute('src');const meta=await sharp(Buffer.from(compressed.split(',')[1],'base64')).metadata();assert.equal(meta.format,'webp');assert(Math.max(meta.width,meta.height)<=1200);
 await games.getByLabel(/I have permission/).check();await games.getByRole('button',{name:'Submit for approval'}).click();await expect(games.getByText('Submitted — Pending Approval',{exact:true})).toBeVisible();
 const entry=(await rpc('list')).entries[0];await rpc('review',{id:entry.id,revision:entry.revision,state:'approved'});await games.getByRole('button',{name:'Refresh',exact:true}).click();await expect(games.locator('.og-trading')).toHaveCount(0);await expect(games.locator('.og-completed').first()).toContainText('COMPLETED');await games.locator('.og-completed').first().click();await expect(games.locator('.og-completed').first()).toHaveAttribute('aria-pressed','true');
 assert.equal((await db.query('select sum(points)::int n from spark_points')).rows[0].n,10);
 await games.getByRole('button',{name:'Mystery Photos',exact:true}).click();await expect(games.getByText(/5 \/ 32 pieces/)).toBeVisible();await games.getByLabel('Your one guess').fill('incorrect');await games.getByRole('button',{name:'Submit guess'}).click();await expect(games.getByText(/Your guess is saved/)).toBeVisible();
 await games.getByRole('button',{name:'Door Contest',exact:true}).click();await expect(games.locator('.og-door')).toHaveCount(28);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile layout must fit');
 await mkdir('test-results/october-games',{recursive:true});await games.screenshot({path:'test-results/october-games-live/mobile-gallery.png'});
 await page.setViewportSize({width:1360,height:960});await games.screenshot({path:'test-results/october-games-live/desktop-gallery.png'});
 await games.getByRole('button',{name:'Side Quests',exact:true}).click();await games.screenshot({path:'test-results/october-games-live/desktop-quests.png'});

 // Nonparticipating-school preview stays local even when choosing a real file.
 await db.exec('update october_live.schools set participating=false where location_id=1');
 await games.getByRole('button',{name:'Refresh',exact:true}).click();await games.getByRole('button',{name:'Preview manager experience'}).click();
 await page.setViewportSize({width:390,height:844});const sample=games.locator('.og-example .og-completed');await expect(sample).toBeVisible();await sample.screenshot({path:'test-results/october-games-live/completed-front.png'});await sample.click();await expect(sample).toHaveAttribute('aria-pressed','true');await page.waitForTimeout(950);await sample.screenshot({path:'test-results/october-games-live/completed-back.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await sample.press('Enter');await expect(sample).toHaveAttribute('aria-pressed','false');
 const before=(await db.query('select (select count(*) from october_live.entries) entries,(select count(*) from october_live.guesses) guesses')).rows[0];
 await games.getByRole('button',{name:'Upload photo',exact:true}).first().click();await games.locator('input[type=file]').first().setInputFiles({name:'preview.jpg',mimeType:'image/jpeg',buffer:example});
 await games.getByLabel(/I have permission/).check();await games.getByRole('button',{name:'Submit for approval'}).click();await expect(games.getByText(/Nothing was uploaded or saved/)).toBeVisible();
 await games.getByRole('button',{name:'Door Contest',exact:true}).click();await games.getByRole('button',{name:'Submit your school’s door'}).click();await expect(games.locator('.og-submit')).toBeVisible();
 await games.getByRole('button',{name:'Mystery Photos',exact:true}).click();await games.getByLabel('Preview your guess').fill('Practice guess');await games.getByRole('button',{name:'Submit guess'}).click();await expect(games.getByText(/No real guess was used/)).toBeVisible();
 assert.deepEqual((await db.query('select (select count(*) from october_live.entries) entries,(select count(*) from october_live.guesses) guesses')).rows[0],before);
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await games.screenshot({path:'test-results/october-games-live/mobile-preview.png'});
 assert.deepEqual(errors,[]);console.log('PASS browser: existing login → Daily Bites shortcut → separate Games page; notification stays unread until Games opens; nonparticipating preview never saves; manager controls; camera/file chooser; WebP compression/max1200; preview/consent/submission; approval completion card; five puzzle pieces; one guess; 28 blank frames; desktop/mobile layouts with no horizontal overflow.');
}finally{await browser.close();await new Promise(r=>server.close(r));await db.close();}
