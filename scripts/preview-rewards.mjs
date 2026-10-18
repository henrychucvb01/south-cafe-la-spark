// Loopback-only development preview. All accounts and points below are synthetic.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {rewardsFixture} from './rewards-fixture.mjs';
import {createRewardsHandler} from '../api/rewards.js';
const port=Number(process.env.PORT||4177);await mkdir('.rewards-runtime',{recursive:true});
const fixture=await rewardsFixture('.rewards-runtime/database');await fixture.install();
const handler=createRewardsHandler({rpc:async(name,p)=>{if(name!=='spark_rewards_dev')return {error:{message:'Unknown development RPC'}};try{return {data:await fixture.rpc(p.p_action,p.p_payload,p.p_pin)};}catch(e){return {error:{message:e.message}};}}},true);
const schools=[{id:900001,location_code:'9001',school_name:'Synthetic Preview School',active:true},{id:900002,location_code:'9002',school_name:'Second Preview School',active:true}];
const employee={id:900001,location_id:900001,employee_name:'Synthetic Manager',active:true};
const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://127.0.0.1:'+port);const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
try{
 let body={};if(req.method==='POST'){let text='';for await(const chunk of req){text+=chunk;if(text.length>1000000)throw Error('Request too large');}body=JSON.parse(text||'{}');}req.body=body;
 if(url.pathname==='/api/rewards'){res.status=code=>{res.statusCode=code;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};return handler(req,res);}
 if(url.pathname==='/api/october-games')return json(req.method==='GET'?{enabled:true,mode:'preview'}:body.action==='rewards'?[]:{admin:true,identified:true,production:false,participating:false,settings:{quests_state:'paused',door_state:'paused',mystery_state:'paused'},schools,quests:[],entries:[],rounds:[],rewards:[],guesses:[],unlock_events:[],current_round:null});
 if(url.pathname.startsWith('/api/'))return json([]);
 if(url.pathname.startsWith('/rest/v1/rpc/')){const action=url.pathname.split('/').at(-1);if(action==='spark_security_ready')return json({ready:true,version:1});if(action==='spark_login'){const valid=body.p_role==='supervisor'?body.p_pin==='2468':body.p_pin==='3141';return valid?json((body.p_role==='supervisor'?'a':'b').repeat(64)):json({message:'Synthetic account PIN is incorrect'},400);}if(action==='spark_employee_directory')return json([employee]);if(action==='has_manager_pin')return json(true);if(action==='open_supper_monitoring_session')return json('c'.repeat(64));return json([]);}
 if(url.pathname.startsWith('/rest/v1/')){const table=url.pathname.split('/').at(-1);let rows=table==='locations'?schools:table==='employees'?[employee]:[];if(url.searchParams.has('location_code'))rows=rows.filter(s=>'eq.'+s.location_code===url.searchParams.get('location_code'));if((req.headers.accept||'').includes('vnd.pgrst.object'))return rows.length?json(rows[0]):json({message:'Synthetic school not found'},404);return json(rows);}
 const file=resolve('build','.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(resolve('build')+sep))return json({error:'Invalid path'},400);try{const data=await readFile(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon'}[extname(file)]||'application/octet-stream'});res.end(data);}catch{return json({error:'Build the local preview first'},404);}
}catch(e){return json({error:e.message},400);}});
server.listen(port,'127.0.0.1',()=>console.log(`Rewards Phase 1 preview http://127.0.0.1:${port} · synthetic Supervisor PIN 2468 · no production connection`));
process.on('SIGINT',()=>server.close(async()=>{await fixture.db.close();process.exit(0);}));
