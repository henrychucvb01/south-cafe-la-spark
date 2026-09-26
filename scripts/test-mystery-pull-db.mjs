import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const db=new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;create table locations(id bigint primary key,school_name text,location_code text,active boolean);insert into locations values(1,'School One','1111',true),(2,'School Two','2222',true),(3,'Closed','3333',false);`);
 await db.exec(await readFile('supabase/migrations/202609250010_mystery_pull.sql','utf8'));
 await db.exec('set role anon');
 const rpc=async(name,args=[])=>(await db.query(`select mystery_${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
 const login=async code=>rpc('open',[code]);
 const admin=(await login('0928')).token;
 const entry=(await login('1234')).token;
 assert.equal((await login('0000')).error,'That access code is not valid.');
 await assert.rejects(rpc('choose_school',[entry,'3333']),/not found/);
 const manager=(await rpc('choose_school',[entry,'1111'])).token;
 const manager2=(await rpc('choose_school',[(await login('1234')).token,'2222'])).token;
 await assert.rejects(rpc('choose_school',[manager,'2222']),/access code first/);
 await assert.rejects(db.query('select * from mystery_prizes'),/permission denied/);
 await assert.rejects(db.query('select * from mystery_wins'),/permission denied/);
 await assert.rejects(db.query('update mystery_balances set tokens=100'),/permission denied/);
 await assert.rejects(rpc('require',[manager]),/permission denied/);
 await assert.rejects(rpc('admin',[manager,randomUUID(),{action:'tokens',location_id:1,delta:5,revision:1}]),/supervisor/);
 let m=await rpc('context',[manager]);assert.equal(m.tokens,0);assert.equal(m.prizes_available,false);assert(!('prizes' in m));assert(!('schools' in m));
 const change=(payload,id=randomUUID())=>rpc('admin',[admin,id,payload]);
 let a=await rpc('context',[admin]);assert.equal(a.prizes.length,5);assert.equal(a.schools.length,2);
 const gift=a.prizes.find(p=>p.name==='$5 Gift Card'),extra=a.prizes.find(p=>p.kind==='extra_pull');
 await assert.rejects(rpc('pull',[manager,randomUUID(),m.revision]),/No Mystery Pulls/);
 const tokenReq=randomUUID(),payload={action:'tokens',location_id:1,delta:2,revision:1};
 await change(payload,tokenReq);await change(payload,tokenReq);assert.equal((await rpc('context',[manager])).tokens,2);
 await assert.rejects(change({...payload,delta:5},tokenReq),/another change/);
 await assert.rejects(change({...payload,delta:-3,revision:2}),/negative/);
 m=await rpc('context',[manager]);
 await assert.rejects(rpc('pull',[manager,randomUUID(),m.revision]),/restocked/);assert.equal((await rpc('context',[manager])).tokens,2);
 await change({action:'stock',id:gift.id,revision:gift.revision,delta:1});
 const request=randomUUID(),wins=await Promise.all([rpc('pull',[manager,request,m.revision]),rpc('pull',[manager,request,m.revision])]);
 assert.equal(wins[0].win.id,wins[1].win.id);assert.equal(wins[0].tokens,1);assert.equal(wins[0].win.status,'waiting');
 assert.equal((await rpc('history',[manager,null,false])).length,1);
 assert.equal((await rpc('history',[manager2,null,false])).length,0);
 assert.equal(await rpc('pull_result',[manager2,request]),null);
 await assert.rejects(rpc('pull',[manager2,request,1]),/another school/);
 assert.equal((await rpc('pull_result',[manager,request])).id,wins[0].win.id);
 a=await rpc('context',[admin]);assert.equal(a.prizes.find(p=>p.id===gift.id).inventory,0);
 await assert.rejects(rpc('pull',[manager,randomUUID(),m.revision]),/balance changed/);
 await assert.rejects(rpc('admin',[manager,randomUUID(),{action:'fulfill',id:wins[0].win.id}]),/supervisor/);
 await change({action:'fulfill',id:wins[0].win.id});
 let history=await rpc('history',[manager,null,false]);assert.equal(history[0].status,'received');assert(history[0].fulfilled_at);assert.equal((await rpc('history',[admin,null,true])).length,0);
 // Extra pull is finite stock, immediate balance credit, and no manual fulfillment.
 await change({action:'stock',id:extra.id,revision:extra.revision,delta:1});m=await rpc('context',[manager]);
 const extraWin=await rpc('pull',[manager,randomUUID(),m.revision]);assert.equal(extraWin.tokens,m.tokens);assert.equal(extraWin.win.prize_kind,'extra_pull');assert.equal(extraWin.win.status,'received');
 assert.equal((await rpc('history',[admin,null,true])).length,0);
 // Both schools compete for a single remaining prize: exactly one wins.
 a=await rpc('context',[admin]);let g=a.prizes.find(p=>p.id===gift.id);
 await change({action:'stock',id:g.id,revision:g.revision,delta:1});await change({action:'tokens',location_id:2,delta:1,revision:1});
 const c1=await rpc('context',[manager]),c2=await rpc('context',[manager2]);
 const race=await Promise.allSettled([rpc('pull',[manager,randomUUID(),c1.revision]),rpc('pull',[manager2,randomUUID(),c2.revision])]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await rpc('context',[manager2])).tokens,1);
 // Historical prize snapshots survive edits; inactive prizes cannot win.
 a=await rpc('context',[admin]);g=a.prizes.find(p=>p.id===gift.id);
 await change({action:'prize',...g,name:'Renamed gift',description:'Changed',active:false});
 a=await rpc('context',[admin]);g=a.prizes.find(p=>p.id===gift.id);await change({action:'stock',id:g.id,revision:g.revision,delta:10});
 assert.equal((await rpc('history',[manager,null,false])).find(w=>w.id===wins[0].win.id).prize_name,'$5 Gift Card');
 await assert.rejects(rpc('pull',[manager2,randomUUID(),(await rpc('context',[manager2])).revision]),/restocked/);
 // Random selection reaches multiple eligible types; zero-stock and inactive entries never appear.
 for(let i=0;i<3;i++) {const p=await change({action:'prize',name:'Pool '+i,description:'Test reward',icon:'🎁',kind:'manual',active:true});await change({action:'stock',id:p.id,revision:p.revision,delta:100});}
 m=await rpc('context',[manager2]);await change({action:'tokens',location_id:2,delta:60,revision:m.revision});
 const types=new Set();for(let i=0;i<60;i++){m=await rpc('context',[manager2]);const r=await rpc('pull',[manager2,randomUUID(),m.revision]);types.add(r.win.prize_name);assert(r.win.prize_name.startsWith('Pool '));}
 assert.equal(types.size,3);
 const first=await rpc('history',[manager2,null,false]);assert.equal(first.length,50);const second=await rpc('history',[manager2,first.at(-1).id,false]);assert.equal(second.length,10);
 assert(!JSON.stringify(await rpc('history',[manager,null,false])).includes('inventory'));
 // A known manager code cannot clear failed-code throttling.
 for(let i=0;i<9;i++){await login('0000');if(i<8)await login('1234');}
 assert.match((await login('0928')).error,/wait 15 minutes/);
 await rpc('close',[manager]);await assert.rejects(rpc('context',[manager]),/expired/);
 console.log('PASS: isolated migration, codes, school scopes, permissions, idempotency, stale devices, last stock, randomness, extra tokens, immutable prize snapshots, fulfillment, pagination and sign-out. No live writes.');
}finally {await db.close();}
