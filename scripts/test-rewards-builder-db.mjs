import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {rewardsFixture} from './rewards-fixture.mjs';
const {db,migration,rpc}=await rewardsFixture();
try{
 await db.exec("set spark.rewards_development='on'");await db.exec(migration);
 let data=await rpc('context',{location_id:900001}),old=data.catalog.find(r=>r.type==='fixed');
 data=await rpc('save',{...old,icon:'🏆',image_url:'https://example.org/custom.png',config:{price:20,quantity:3,max_claims:1,approval_required:true,refund_policy:'refund'},opens_at:'2027-01-01T00:00:00Z'});
 const snapshot=async()=>JSON.stringify((await db.query('select * from rewards_dev.catalog order by id')).rows)+JSON.stringify((await db.query('select * from rewards_dev.audit order by id')).rows)+JSON.stringify((await db.query('select * from spark_points order by id')).rows);
 const before=await snapshot();const upgrade=await readFile('scripts/rewards-builder-schema.sql','utf8');await db.exec("set spark.rewards_development='off'");await assert.rejects(db.exec(upgrade),/isolated development/);await db.exec('rollback');await db.exec("set spark.rewards_development='on'");await db.exec(upgrade);assert.equal(await snapshot(),before,'all existing catalog, audit and points records survive the upgrade unchanged');
 const retained=(await rpc('context')).catalog.find(r=>r.id===old.id);assert.equal(retained.icon,'🏆');assert.equal(retained.config.quantity,3);assert.equal(retained.config.refund_policy,'refund');assert.equal(retained.image_url,'https://example.org/custom.png');
 const base={name:'New configurable reward',description:'A friendly reward.',active:true,status:'published',fulfillment:'not_started',type:'fixed',config:{price:30}};
 data=await rpc('save',base);assert(data.catalog.some(r=>r.name===base.name&&r.active));
 for(const icon of ['🎁','🍩','🥧','🚗','🥞','👑','🎡','🎤','👔','⭐']){data=await rpc('save',{...base,name:'Icon '+icon,icon});assert.equal(data.catalog.find(r=>r.name==='Icon '+icon).icon,icon);}
 const make=(type)=>({...base,type:'wheel',name:type+' wheel',config:{goal:100,wheel_type:type,session_limit:10,segments:[{id:'a',label:'First',color:'#0f766e',enabled:true,approved:true,outcome:type==='pull'?'extra_spins':type==='punishment'?'challenge':'activity',value:2},{id:'b',label:'Second',color:'#be123c',enabled:true,approved:true,outcome:type==='pull'?'none':type==='punishment'?'challenge':'activity',value:0}]}});
 for(const type of ['pull','punishment','positive']){data=await rpc('save',make(type));assert.equal(data.catalog.find(r=>r.name===type+' wheel').config.wheel_type,type);}
 let invalid=make('pull');invalid.config.segments.pop();await assert.rejects(rpc('save',invalid),/two approved/);
 invalid=make('punishment');invalid.config.segments[0].approved=false;await assert.rejects(rpc('save',invalid),/Approve every/);
 invalid=make('pull');invalid.config.segments[1].id='a';await assert.rejects(rpc('save',invalid),/unique/);
 invalid=make('pull');invalid.config.segments[0].value=1.5;await assert.rejects(rpc('save',invalid),/whole number/);
 invalid=make('positive');invalid.config.segments[0].outcome='extra_spins';await assert.rejects(rpc('save',invalid),/match wheel/);
 invalid=make('pull');invalid.config.session_limit=101;await assert.rejects(rpc('save',invalid),/1 to 100/);
 const auction={...base,type:'auction',name:'Anonymous live auction',opens_at:'2027-01-01T00:00:00Z',closes_at:'2027-01-02T00:00:00Z',config:{starting_bid:100,reserve:300,increment:25,anti_sniping:true,trigger_minutes:1,extension_minutes:5}};
 data=await rpc('save',auction);assert.equal(data.catalog.find(r=>r.name===auction.name).config.extension_minutes,5);
 await assert.rejects(rpc('save',{...auction,config:{...auction.config,reserve:50}}),/Reserve/);await assert.rejects(rpc('save',{...auction,config:{...auction.config,trigger_minutes:4}}),/auction window/);
 for(const action of ['claim','bid','contribute','spin'])await assert.rejects(rpc(action,{location_id:900001,amount:1}),/not enabled/);
 assert.equal((await rpc('context',{location_id:900001})).balance,'125');assert.equal((await db.query('select status from existing_game_progress')).rows[0].status,'unchanged');
 console.log('PASS builder database: guarded additive upgrade, exact preservation of old catalog/audit/points, ten icons/custom images, fixed price without inventory, four reward types, wheel validation, anonymous auction settings, launch and spending still locked.');
}finally{await db.close();}
