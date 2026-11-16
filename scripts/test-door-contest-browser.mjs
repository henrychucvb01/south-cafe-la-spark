// Production UI -> real API handler -> isolated Postgres. All names/photos fictional.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium,expect} from '@playwright/test';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {doorFixture} from './door-contest-fixture.mjs';
import {createHandler} from '../api/october-games.js';
const db=await doorFixture(),token='a'.repeat(64);let origin;
const migration=await readFile('supabase/migrations/20261116165934_door_contest_cycles_and_schedule.sql','utf8');
const path='00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp';
await db.exec(`insert into october_live.entries(location_id,quest,photo_path,consent,state) values(2,0,'${path}',true,'approved');update october_live.settings set champion=2,door_state='ended',submission_start=now()-interval '20 days',submission_end=now()-interval '8 days',voting_start=now()-interval '20 days',voting_end=now()-interval '7 days';`);
await db.exec(migration.replace(/-- CRON-BEGIN[\s\S]*?-- CRON-END/,''));
await db.exec(await readFile('supabase/migrations/20261116173611_door_contest_stale_screen_guard.sql','utf8'));
const image=await sharp({create:{width:320,height:240,channels:3,background:'#d79032'}}).webp().toBuffer();
const bucket={createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:origin+'/photo/'+encodeURIComponent(path)}))}),download:async()=>({data:new Blob([image])})};
const handler=createHandler({storage:{from:()=>bucket},rpc:async(name,args)=>{try{return {data:(await db.query('select public.october_games_live($1,$2,$3,$4) r',[args.p_action,args.p_token,args.p_pin?'admin-test':null,args.p_payload])).rows[0].r};}catch(e){return {error:{message:e.message}};}}},true,true);
const build=resolve('build');
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/october-games'){let body='';for await(const chunk of req)body+=chunk;return handler({method:req.method,body:body?JSON.parse(body):{}},{setHeader:(...a)=>res.setHeader(...a),status(s){res.statusCode=s;return this;},json(v){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));}});}
 if(url.pathname.startsWith('/photo/')){res.setHeader('Content-Type','image/webp');return res.end(image);}
 if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');return res.end('[]');}
 let file=resolve(build,'.'+url.pathname);if(file!==build&&!file.startsWith(build+sep))return res.writeHead(403).end();if(file===build)file=resolve(build,'index.html');
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.json':'application/json'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
}catch(e){res.writeHead(500).end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.SPARK_BROWSER_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-process-singleton']});
try{
 const page=await browser.newPage({viewport:{width:1360,height:960},serviceWorkers:'block'});page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://kkrcxqhfzepifhkryodd.supabase.co/**',async route=>{const url=new URL(route.request().url()),name=url.pathname.split('/').at(-1);let data=[];
 if(name==='spark_login')data=token;if(name==='locations')data=[{id:1,school_name:'School One',location_code:'1111',active:true},{id:2,school_name:'School Two',location_code:'2222',active:true}];
 await route.fulfill({json:data});});
 await page.addInitScript(()=>sessionStorage.setItem('sparkIntroPlayed','yes'));await page.goto(origin);
 await page.getByRole('button',{name:'Supervisor Access',exact:true}).click();await page.locator('input[type=password]').fill('1234');await page.locator('form button[type=submit]').click();
 await page.locator('.command-nav-button').filter({hasText:'Games & Challenges'}).click();
 const games=page.locator('.og').first();await expect(games.getByRole('button',{name:'Games & Challenges',exact:true})).toBeVisible();await games.getByRole('button',{name:'Games & Challenges',exact:true}).click();
 const next=games.locator('.og-door-next');await expect(next).toBeVisible();await expect(games.locator('.og-door-settings')).toContainText('preserved');await expect(games.locator('.og-door-settings form')).toHaveCount(0);
 await next.getByLabel('Contest opens (Los Angeles)',{exact:true}).fill('2099-11-18T08:00');await next.getByLabel('Next submissions close (Los Angeles)',{exact:true}).fill('2099-11-23T15:00');await next.getByLabel('Next voting closes (Los Angeles)',{exact:true}).fill('2099-11-25T15:00');
 await next.getByRole('button',{name:'Schedule next contest',exact:true}).click();await expect(games.locator('.og-door-next')).toContainText('Scheduled: Thanksgiving Door Decorating Contest');
 await mkdir('node_modules/.cache/door-contests',{recursive:true});await games.locator('.og-door-next').screenshot({path:'node_modules/.cache/door-contests/desktop.png'});
 for(const width of [390,320]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'layout fits '+width);await games.locator('.og-door-next').screenshot({path:`node_modules/.cache/door-contests/mobile-${width}.png`});}
 await games.locator('.og-door-next').getByRole('button',{name:'Start saved contest now'}).click();await expect(games.locator('.og-door-settings')).not.toContainText('Completed decoration contest');
 await games.getByRole('button',{name:'Door Contest',exact:true}).click();await expect(games).toContainText('Thanksgiving Door Decorating Contest');
 const history=games.locator('.og-door-history');await history.locator('summary').click();await history.getByLabel('View past contest').selectOption('1');await expect(history).toContainText('School Two · Champion');await expect(history.locator('img')).toBeVisible();
 assert.equal((await db.query('select count(*)::int n from october_live.entries where door_contest=1')).rows[0].n,1);assert.deepEqual(errors,[]);
 console.log('PASS browser: supervisor login, completed Halloween read-only, schedule Thanksgiving via real API/Postgres, explicit start now, on-demand archived champion photo, desktop/390px/320px no overflow.');
}finally{await browser.close();await new Promise(r=>server.close(r));await db.close();}
