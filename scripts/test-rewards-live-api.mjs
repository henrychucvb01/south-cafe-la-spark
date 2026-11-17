import assert from 'node:assert/strict';
import {createRewardsHandler} from '../api/rewards.js';
const calls=[];let denied=false;const handler=createRewardsHandler({rpc:async(name,args)=>{calls.push({name,args});if(denied)return {error:{message:'Invalid session'}};return {data:args.p_action==='capabilities'?{protocol_version:2,supervisor_available:true,manager_enabled:true}:{manager_enabled:true,launch_ready:true}};}},true,'spark_rewards_live');
async function call(body,method='POST'){let status,result;await handler({method,body},{setHeader(k,v){assert.equal(v,'no-store');},status(n){status=n;return this;},json(v){result=v;}});return {status,result};}
assert.deepEqual((await call(null,'GET')).result,{available:true,supervisor_only:false,manager_enabled:true});
for(const body of [{action:'save',token:'manager'},{action:'claim',pin:'admin'},{action:'spin',token:'manager'},{action:'arbitrary',pin:'admin'}])assert.equal((await call(body)).status,403);
assert.equal((await call({action:'manager_context',token:'manager'})).status,200);assert.deepEqual(calls.at(-1),{name:'spark_rewards_live',args:{p_action:'manager_context',p_token:'manager',p_pin:null,p_payload:{}}});
assert.equal((await call({action:'bid',token:'manager',payload:{amount:20}})).status,200);assert.equal((await call({action:'settings',pin:'admin',payload:{manager_enabled:true}})).status,200);
denied=true;assert.equal((await call({action:'bid',token:'forged',payload:{amount:20}})).status,400);
console.log('PASS live API: protocol 2, manager and supervisor routes require appropriate credentials, unknown/spin/save manager actions blocked, server RPC authorization errors retained, no-store responses.');
