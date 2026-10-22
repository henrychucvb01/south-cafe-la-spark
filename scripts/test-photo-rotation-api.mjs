import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHandler} from '../api/october-games.js';
const original=await sharp({create:{width:80,height:60,channels:3,background:'#ff0000'}}).composite([{input:await sharp({create:{width:40,height:60,channels:3,background:'#0000ff'}}).png().toBuffer(),left:40,top:0}]).webp().toBuffer();
let admin=true,state='pending',revision=1,race=false,uploads=[],removed=[],downloads=[],saved;
const db={storage:{from:()=>({download:async path=>{downloads.push(path);return {data:new Blob([original])};},upload:async(path,bytes,options)=>{uploads.push({path,bytes,options});return {};},remove:async paths=>{removed.push(...paths);return {};},createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:'https://photos.test/'+path}))})})},rpc:async(name,args)=>{
 assert.equal(name,'october_games_live');
 if(args.p_action==='photo_rotate'){saved=args.p_payload;if(race)return {error:{message:'Submission changed'}};return {data:{admin:true,entries:[{id:'entry',photo_path:saved.photo_path,state:'pending',revision:2}],rounds:[]}};}
 assert.equal(args.p_action,'list');return {data:{admin,entries:[{id:'entry',photo_path:'trusted-original.webp',state,revision}],rounds:[]}};
}};
async function call(payload={}){let status,result;await createHandler(db,true,true)({method:'POST',body:{action:'photo_rotate',pin:'admin',payload:{id:'entry',revision:1,angle:90,...payload}}},{setHeader(){},status(s){status=s;return this;},json(r){result=r;return this;}});return {status,result};}
admin=false;assert.equal((await call()).status,400);assert.equal(downloads.length,0);admin=true;
assert.equal((await call({angle:45})).status,400);state='approved';assert.equal((await call()).status,400);state='pending';revision=2;assert.equal((await call()).status,400);revision=1;
let response=await call({photo_path:'evil',expected_photo_path:'evil'});assert.equal(response.status,200);assert.deepEqual(downloads,['trusted-original.webp']);assert.equal(saved.expected_photo_path,'trusted-original.webp');assert.notEqual(saved.photo_path,'evil');assert.equal(uploads[0].options.upsert,false);
const meta=await sharp(uploads[0].bytes).metadata();assert.equal(meta.width,60);assert.equal(meta.height,80);
assert.deepEqual(await sharp(uploads[0].bytes).raw().toBuffer(),await sharp(await sharp(original).rotate(90).webp({quality:90}).toBuffer()).raw().toBuffer());
assert.equal(response.result.entries[0].photo_path,undefined);assert.equal(removed.length,0);
race=true;response=await call();assert.equal(response.status,400);assert.deepEqual(removed,[uploads[1].path]);assert(!removed.includes('trusted-original.webp'));
console.log('PASS: real rotated pixels/dimensions, supervisor/pending/revision checks, server-owned paths, signed result and cleanup on concurrent-change rejection; original retained.');
