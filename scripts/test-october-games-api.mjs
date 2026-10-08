import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHandler,previewEnabled} from '../api/october-games.js';
import {makePieces,maskSvg} from '../lib/octoberGeometry.js';
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
check(previewEnabled({VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main'}),false);
check(previewEnabled({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'spark-development'}),true);
check(previewEnabled({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'unrelated'}),false);
const area=t=>Math.abs(t[0][0]*(t[1][1]-t[2][1])+t[1][0]*(t[2][1]-t[0][1])+t[2][0]*(t[0][1]-t[1][1]))/2;
for(let i=0;i<30;i++){const pieces=makePieces();check(pieces.length,32);assert(Math.abs(pieces.reduce((sum,p)=>sum+area(p),0)-1000000)<.001);checks++;assert(pieces.every(t=>area(t)>0&&t.every(p=>p.every(n=>n>=0&&n<=1000))));checks++;}
assert.notDeepEqual(makePieces(),makePieces());checks++;
const raster=await sharp({create:{width:80,height:60,channels:3,background:'#ff0000'}}).webp().toBuffer();
const pieces=makePieces();const calls=[];let invalid=false;
const db={storage:{from:name=>{check(name,'october-games-dev');return {
 upload:async(path,bytes,opts)=>{calls.push(['upload',path,bytes,opts]);return{};},remove:async paths=>{calls.push(['remove',paths]);return{};},
 createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:'https://private.test/'+path}))}),
 createSignedUrl:async path=>{calls.push(['signed',path]);return{data:{signedUrl:'https://private.test/'+path}};},download:async()=>({data:new Blob([raster])})};}},
 rpc:async(name,args)=>{calls.push(['rpc',args]);check(name,'october_games_dev');if(args.p_token==='invalid'||invalid)return{error:{message:'Invalid session'}};
  if(args.p_action==='authorize')return{data:{admin:args.p_pin==='admin'}};
  return{data:{admin:args.p_pin==='admin',entries:[{photo_path:'approved.webp'}],rounds:[{id:1,photo_path:'secret.webp',pieces,unlocked:0},{id:2,photo_path:null,pieces:null,unlocked:0}]}};
 }};
async function request(body,enabled=true,method='POST'){let status,result;await createHandler(db,enabled)({method,body},{setHeader(){},status(s){status=s;return this;},json(v){result=v;return this;}});return{status,result};}
check((await request({},false)).status,404);check(calls.length,0);check((await request({},true,'GET')).result.enabled,true);
check((await request({action:'submit',token:'invalid',photo:{base64:raster.toString('base64')}})).status,400);check(calls.filter(c=>c[0]==='upload').length,0);
let res=await request({action:'submit',token:'manager',payload:{photo_path:'evil.webp',pieces:['evil']},photo:{base64:raster.toString('base64')}});
check(res.status,200);const submitted=calls.find(c=>c[0]==='rpc'&&c[1].p_action==='submit')[1].p_payload;assert.match(submitted.photo_path,/\.webp$/);check(submitted.pieces,undefined);
check(res.result.entries[0].photo_path,undefined);check(res.result.rounds[0].photo_path,undefined);check(res.result.rounds[1].photo_url,undefined);
check(calls.some(c=>c[0]==='signed'&&c[1]==='secret.webp'),false);
const image=Buffer.from(res.result.rounds[0].photo_url.split(',')[1],'base64');const {data:raw,info}=await sharp(image).raw().toBuffer({resolveWithObject:true});
check(info.channels,3);for(let i=0;i<raw.length;i+=3){assert.deepEqual([...raw.subarray(i,i+3)],[53,39,66]);}checks++;
const full=await sharp(raster).ensureAlpha().composite([{input:maskSvg(pieces,32,80,60),blend:'dest-in'}]).png().toBuffer();assert((await sharp(full).stats()).channels[3].mean>254);checks++;
const before=calls.filter(c=>c[0]==='upload').length;res=await request({action:'round',token:'manager',photo:{base64:raster.toString('base64')}});check(res.status,400);check(calls.filter(c=>c[0]==='upload').length,before);
res=await request({action:'round',pin:'admin',payload:{id:1},photo:{base64:raster.toString('base64')}});check(res.status,200);
const roundPayload=calls.find(c=>c[0]==='rpc'&&c[1].p_action==='round')[1].p_payload;check(roundPayload.pieces.length,32);
check((await request({action:'submit',token:'manager',photo:{base64:Buffer.from('<svg/>').toString('base64')}})).status,400);
console.log(`PASS ${checks} assertions: preview-only server, authorized uploads, re-encoding, 32 randomized triangles with complete coverage, private originals, unrecoverable hidden pixels, future-image privacy, server-owned paths and geometry.`);
