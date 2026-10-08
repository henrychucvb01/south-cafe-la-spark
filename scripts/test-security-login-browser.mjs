// All Supabase browser traffic is fulfilled from the local fixture. Every
// other non-loopback request is blocked; no production network call is made.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import {chromium,expect} from '@playwright/test';
const require=createRequire(import.meta.url);const {sql}=require('./test-security-auth-local.cjs');
sql("update employees set active=true where id=900001; update employees set manager_pin_hash=null where id=900003; delete from spark_private.login_limits;");
const build=resolve('build');
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'}).end('{"error":"External service excluded from isolated login test"}');return;}
  let file=resolve(build,'.'+url.pathname);if(file!==build&&!file.startsWith(build+sep))return res.writeHead(403).end();
  if(file===build)file=resolve(build,'index.html');
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const localOrigin='http://127.0.0.1:'+server.address().port;
const origin=process.argv[2]||'https://south-cafe-la-spark.vercel.app';
if(!['https://south-cafe-la-spark.vercel.app','https://spark.cafelalistens.org'].includes(origin))throw new Error('Choose an approved production origin for the isolated browser test');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const role of ['employee','new','covering','supervisor']){
    const context=await browser.newContext({serviceWorkers:'block'});
    let releaseReady=role!=='employee';
    const requestErrors=[];
    await context.route('**/*',async route=>{
      const req=route.request();const url=new URL(req.url());
      if(url.origin===origin){const response=await fetch(localOrigin+url.pathname+url.search);return route.fulfill({status:response.status,contentType:response.headers.get('content-type')||'text/html',body:Buffer.from(await response.arrayBuffer())});}
      if(url.origin==='https://kkrcxqhfzepifhkryodd.supabase.co'&&url.pathname.startsWith('/rest/v1/')){
        if(!releaseReady&&url.pathname.endsWith('/spark_security_ready'))return route.fulfill({status:404,contentType:'application/json',body:'{"code":"PGRST202"}'});
        const headers={};for(const [k,v]of Object.entries(req.headers()))if(['accept','content-type','prefer','range','range-unit','x-spark-session'].includes(k))headers[k]=v;
        const response=await fetch('http://127.0.0.1:55433'+url.pathname.slice('/rest/v1'.length)+url.search,{method:req.method(),headers,body:req.postData()||undefined});
        if(!response.ok)requestErrors.push(`${req.method()} ${url.pathname}: ${response.status}`);
        return route.fulfill({status:response.status,contentType:response.headers.get('content-type')||'application/json',body:await response.text()});
      }
      return route.abort();
    });
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>sessionStorage.setItem('sparkIntroPlayed','yes'));
    await page.goto(origin);
    if(role==='employee'){
      await expect(page.getByText('Connecting to SPARK…')).toBeVisible();
      await expect(page.getByLabel('Location Code')).toHaveCount(0);
      releaseReady=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    }
    if(role==='supervisor'){
      await page.getByRole('button',{name:'Supervisor Access',exact:true}).click();
      await page.locator('input[type=password]').fill('1618');
      await page.getByRole('button',{name:'Open Command Center'}).click();
      await expect(page.locator('.command-main')).toBeVisible();
    }else{
      await page.getByLabel('Location Code').fill(role==='covering'?'9002':'9001');
      await page.getByRole('button',{name:'Continue',exact:true}).click();
      if(role==='employee'||role==='new')await page.getByRole('button',{name:role==='employee'?/Synthetic Manager/:/Synthetic New Manager/}).click();
      else{
        await page.getByRole('button',{name:/I'm covering this location/}).click();
        await page.locator('input[type=text]').fill('Synthetic Cover');
        await page.getByRole('button',{name:/^Continue/}).click();
      }
      await page.locator('#managerPin').fill(role==='employee'?'3141':role==='new'?'4321':'2718');
      if(role==='new'){
        await page.locator('#managerPinConfirm').fill('4321');
        await page.getByRole('button',{name:'Create PIN & Continue'}).click();
      }
      await expect(page.getByText('Manager Tools',{exact:true})).toBeVisible();
      await expect(page.getByText(role==='employee'?'Welcome, Synthetic Manager':role==='new'?'Welcome, Synthetic New Manager':'Welcome, Synthetic Cover',{exact:true})).toBeVisible();
    }
    if(errors.length)throw Error(errors.join('\n'));
    if(requestErrors.length)throw Error(requestErrors.join('\n'));
    await context.close();
    console.log(`PASS: ${role} login retains its existing screen flow using isolated real authorization.`);
  }
}finally{await browser.close();await new Promise(r=>server.close(r));}
