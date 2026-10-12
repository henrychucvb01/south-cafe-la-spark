import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import webpack from 'webpack';
import {chromium,expect} from '@playwright/test';
import {createHandler} from '../api/snp-monitoring.js';
import {QUESTIONS} from '../src/snpMonitoring/model.js';
// Dedicated component harness. All data is synthetic and all external requests are blocked.
const dir=resolve('.security-runtime/snp/browser');await mkdir(dir,{recursive:true});
const token=randomUUID()+randomUUID();let records=[],documents=new Map();
const rpc=async(name,a)=>{
 let r=records.find(r=>r.id===a.p_id);
 if(name==='snp_sites')return [{key:'main',name:'Synthetic School',staff:'Parent Manager'},{key:'dolores-eec',name:'Dolores EEC',staff:'Parent Manager'}];
 if(name==='snp_list')return records.map(r=>({...r,meal:r.payload.meal,visit_date:r.payload.visitDate}));
 if(name==='snp_get')return r;
 if(name==='supper_context')return {actor_role:'supervisor'};
 if(name==='snp_save'){if(!r){r={id:a.p_id,site_key:a.p_site,site_name:a.p_payload.siteName,revision:0,status:'draft'};records.push(r);}Object.assign(r,{payload:a.p_payload,revision:r.revision+1,section:a.p_section});return r;}
 if(name==='snp_finalize'){documents.set(a.p_id,a.p_pdf);Object.assign(r,{status:'finalized',revision:r.revision+1});return r;}
 if(name==='snp_pdf')return documents.get(a.p_id);
 throw Error(`Unexpected mock RPC ${name}`);
};
const api=createHandler({database:{rpc:async(n,a)=>({data:await rpc(n,a)})}});
await writeFile(resolve(dir,'auth.js'),`export const openSession=async()=>${JSON.stringify(token)};export const openSupervisorSession=openSession;export const closeSession=async()=>{};`);
await writeFile(resolve(dir,'client.js'),`export const supabase={rpc:async(name,args)=>({data:await(await fetch('/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)})).json()})};`);
await writeFile(resolve(dir,'entry.js'),`import React from 'react';import {createRoot} from 'react-dom/client';import SNP from ${JSON.stringify(resolve('src/snpMonitoring/SnpMonitoringPage.js'))};const manager=location.search.includes('manager');createRoot(document.getElementById('root')).render(<SNP location={{id:1,school_name:'Synthetic School'}} employee={{id:1,employee_name:'Parent Manager'}} managerPin="fixture" supervisorPin={manager?undefined:'fixture'} onBack={()=>{}}/>);`);
await new Promise((ok,bad)=>webpack({mode:'development',devtool:false,entry:resolve(dir,'entry.js'),output:{path:dir,filename:'bundle.js'},module:{rules:[{test:/\.js$/,exclude:/node_modules/,use:{loader:'babel-loader',options:{presets:['@babel/preset-react']}}},{test:/\.css$/,use:['style-loader','css-loader']}]},plugins:[new webpack.NormalModuleReplacementPlugin(/supperMonitoring[\/]service$/,resolve(dir,'auth.js')),new webpack.NormalModuleReplacementPlugin(/supabaseClient$/,resolve(dir,'client.js'))]},(e,s)=>e||s.hasErrors()?bad(e||Error(s.toString({all:false,errors:true}))):ok()));
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path.startsWith('/rpc/')||path==='/api/snp-monitoring'){let body='';for await(const c of req)body+=c;req.body=JSON.parse(body);if(path.startsWith('/rpc/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await rpc(path.slice(5),req.body)));return;}res.status=c=>{res.statusCode=c;return res;};res.json=b=>res.end(JSON.stringify(b));res.send=b=>res.end(b);await api(req,res);return;}
 if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial}</style><div id="root"></div><script src="/bundle.js"></script>');return;}
 const base=path.startsWith('/pdfjs/')?resolve('public'):dir;const file=resolve(base,'.'+path);if(!file.startsWith(base+sep)){res.writeHead(403).end();return;}
 res.setHeader('Content-Type',({'.js':'application/javascript','.mjs':'application/javascript','.wasm':'application/wasm'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch(e){res.writeHead(500).end(e.message);}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
try{
 for(const width of [390,1360]){
  records=[];documents.clear();const context=await browser.newContext({viewport:{width,height:844},hasTouch:width<600,serviceWorkers:'block'});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await page.goto(origin);
  await page.getByRole('button',{name:'Dolores EEC',exact:true}).click();await expect(page.getByLabel('Site staff responsible for meal counts')).toHaveValue('Parent Manager');await page.getByLabel('Review date').fill('2026-10-12');await page.getByRole('button',{name:'Breakfast',exact:true}).click();await page.getByLabel('Arrival time').fill('08:00');await page.getByLabel('Departure time').fill('09:00');await page.getByLabel('Monitor name',{exact:true}).fill('Test Monitor');
  for(let section=0;section<4;section++){
   await page.getByRole('button',{name:new RegExp(`^${section+1}\\. `)}).click();await expect(page.locator('[id^="snp-section-"]')).toHaveCount(1);
   if(section===1){await page.getByLabel('Today’s menu').fill('Cereal 1 oz; milk 8 oz; apple 1/2 cup');await page.getByLabel('K-5',{exact:true}).check();}
   if(section===2)await page.getByLabel('2. Where').fill('Office binder');
   for(const q of QUESTIONS.filter(q=>q.section===section))await page.locator('.snp-question').filter({has:page.locator('legend').filter({hasText:new RegExp(`^${q.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\. `)})}).getByRole('button',{name:q.trigger==='No'?'Yes':'No',exact:true}).click();
  }
  await page.getByRole('button',{name:/^5\. /}).click();await page.getByLabel('No Findings').check();await page.getByRole('group',{name:'Site appears to be in compliance, no corrective action is needed.'}).getByRole('button',{name:'Yes',exact:true}).click();
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved');await page.getByRole('button',{name:/^6\. /}).click();await page.getByLabel('Site representative printed name').fill('Test Representative');
  for(const name of ['Monitor','Site Representative']){
   const pad=page.locator('.sm-signature').filter({has:page.getByRole('button',{name:'Sign with Finger'})}).first();await pad.getByRole('button',{name:'Sign with Finger'}).click();const canvas=pad.locator('canvas');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();await page.mouse.move(box.x+20,box.y+25);await page.mouse.down();await page.mouse.move(box.x+60,box.y+65);await page.mouse.move(box.x+110,box.y+35);await page.mouse.up();await pad.getByRole('checkbox').check();await pad.getByRole('button',{name:'Accept Signature'}).click();
  }
  await expect(page.getByText(/Signature Complete/)).toHaveCount(2);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Phone layout stays within viewport');await page.screenshot({path:resolve(dir,`signatures-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'Preview official PDF'}).click();await expect(page.getByLabel('PDF page',{exact:true})).toHaveValue('1');await expect(page.getByLabel('I reviewed all pages')).toBeEnabled({timeout:30000});
  for(const num of ['2','3','4']){await page.getByLabel('PDF page',{exact:true}).selectOption(num);await expect(page.getByLabel(`PDF page ${num} content`)).toBeVisible();await expect(page.getByLabel('I reviewed all pages')).toBeEnabled();}
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF'}).click();assert.equal((await downloadPromise).suggestedFilename(),'Dolores_EEC_SNP-Breakfast_2026-10-12.pdf');
  await page.getByLabel('I reviewed all pages').check();await page.getByRole('button',{name:'Finalize monitoring',exact:true}).click();await expect(page.getByText(/Finalized · 0 outstanding/)).toBeVisible();assert.equal(records[0].status,'finalized');
  await page.goto(origin+'/?manager');await page.getByRole('button',{name:/Dolores EEC · Breakfast/}).click();await expect(page.getByRole('button',{name:'Save draft',exact:true})).toHaveCount(0);await page.getByRole('button',{name:/^6\. /}).click();await page.getByRole('button',{name:'View finalized PDF'}).click();await expect(page.getByLabel('PDF page',{exact:true})).toBeVisible();await context.close();
 }
 assert.deepEqual(errors,[]);console.log('Desktop + phone: all 42 responses, accordions, inherited staff, autosave, signatures, four-page preview, download, finalization and manager view passed.');
}finally{await browser.close();await new Promise(ok=>server.close(ok));}
