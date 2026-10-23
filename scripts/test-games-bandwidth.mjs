import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createGamesPhotoCache} from '../lib/gamesPhotoCache.js';
import {createHandler} from '../api/october-games.js';
let clock=0,signs=0,downloads=0,rpcs=0,denied=false,path='original',revealed=[0];
const original=await sharp({create:{width:80,height:60,channels:3,background:'#ff0000'}}).webp().toBuffer();
const pieces=[[[0,0],[500,0],[500,1000],[0,1000]],[[500,0],[1000,0],[1000,1000],[500,1000]]];
const bucket={createSignedUrls:async paths=>{signs++;return {data:paths.map(path=>({path,signedUrl:`https://private.test/${path}?generation=${signs}`}))};},download:async()=>{downloads++;return {data:new Blob([original])};}};
const cache=createGamesPhotoCache({now:()=>clock});
const handler=createHandler({storage:{from:()=>bucket},rpc:async()=>{rpcs++;if(denied)return {error:{message:'Session expired'}};return {data:{participating:true,new_challenge:true,entries:[{id:1,quest:1,state:'approved',consent:true,photo_path:path}],rounds:[{photo_path:'secret',pieces,unlocked:1,revealed_indices:revealed}]}};}},true,true,cache);
async function call(action='list'){let status,result;await handler({method:'POST',body:{action,token:'fictional'}},{setHeader(name,value){assert.equal(value,'no-store');},status(s){status=s;return this;},json(v){result=v;}});return {status,result};}
const first=await call();assert.equal(first.status,200);
for(let i=0;i<10;i++){const next=await call();assert.equal(next.result.entries[0].photo_url,first.result.entries[0].photo_url);assert.equal(next.result.rounds[0].photo_url,first.result.rounds[0].photo_url);}
assert.equal(signs,1);assert.equal(downloads,1);assert.equal(rpcs,11,'every cached response still reauthorizes');
assert.equal((await call('side_quest_gallery')).result.photos[0].url,first.result.entries[0].photo_url);assert.equal(signs,1);
assert.deepEqual((await call('badge')).result,{participating:true,new_challenge:true});assert.equal(downloads,1);
revealed=[1];const other=await call();assert.notEqual(other.result.rounds[0].photo_url,first.result.rounds[0].photo_url);assert.equal(downloads,1,'new reveals reuse original');
const pixels=await sharp(Buffer.from(other.result.rounds[0].photo_url.split(',')[1],'base64')).raw().toBuffer();
assert.deepEqual([...pixels.subarray((30*80+10)*3,(30*80+10)*3+3)],[23,23,23],'hidden pixels stay flattened');
assert(pixels[(30*80+70)*3]>200,'only selected piece is revealed');
path='rotated';const changed=await call();assert.match(changed.result.entries[0].photo_url,/rotated/);assert.equal(signs,2);
denied=true;assert.equal((await call()).status,400);assert.equal((await call('side_quest_gallery')).status,400);assert.equal(signs,2);assert.equal(downloads,1);denied=false;
clock=241000;assert.notEqual((await call()).result.entries[0].photo_url,changed.result.entries[0].photo_url,'signed links renew before expiry');
clock=301000;await call();assert.equal(downloads,2,'source expires after five minutes');
let loads=0;const tiny=createGamesPhotoCache({now:()=>clock,maxBytes:4,maxEntries:2});
const load=async()=>{loads++;return '1234';};await tiny.remember('a',load);await tiny.remember('a',load);assert.equal(loads,1);await tiny.remember('b',load);await tiny.remember('a',load);assert.equal(loads,3,'bounded cache evicts oldest');
let attempts=0;const retry=createGamesPhotoCache();await assert.rejects(retry.remember('failed',async()=>{attempts++;throw Error('temporary');}));assert.equal(await retry.remember('failed',async()=>{attempts++;return 'ok';}),'ok');assert.equal(attempts,2,'failures never cached');
console.log('PASS: 11 authorized refreshes use one signing request and one original download; gallery reuse, badge isolation, distinct private reveals, rotation, expired sessions, URL renewal, source expiry, memory bounds and failure recovery.');
