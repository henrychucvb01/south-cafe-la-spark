import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table locations(id bigint primary key,school_name text,location_code text,active boolean);
 insert into locations values(1,'Winner','1111',true),(2,'Other School','2222',true);
 create table spark_points(location_id bigint references locations(id),points integer,point_type text,description text,service_date date,source text,unique_key text unique);
 alter table spark_points enable row level security;`);
 await db.exec(await readFile('supabase/migrations/202609250010_mystery_pull.sql','utf8'));
 const rpc=async(name,args=[])=>(await db.query(`select mystery_${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
 const admin=(await rpc('open',['0928'])).token;
 const manager=(await rpc('choose_school',[(await rpc('open',['1234'])).token,'1111'])).token;
 const other=(await rpc('choose_school',[(await rpc('open',['1234'])).token,'2222'])).token;
 const change=(payload,id=randomUUID())=>rpc('admin',[admin,id,payload]);
 const context=()=>rpc('context',[manager]);
 let extra=(await rpc('context',[admin])).prizes.find(p=>p.kind==='extra_pull');
 await change({action:'tokens',location_id:1,delta:3,revision:1});
 await change({action:'stock',id:extra.id,revision:extra.revision,delta:1});
 const old=await rpc('pull',[manager,randomUUID(),(await context()).revision]);
 const before=await context();
 await db.exec(await readFile('supabase/migrations/202609260001_mystery_pull_prize_bundles.sql','utf8'));
 assert.deepEqual(await context(),before,'Migration must not change tokens');
 assert.equal((await rpc('pull_result',[manager,old.win.request_id])).bonus_tokens,1);
 assert.equal((await db.query('select count(*) n from spark_points')).rows[0].n,0,'No retroactive points');
 await db.exec('set role anon');
 await assert.rejects(db.exec('select * from spark_points'),/permission denied/);
 await assert.rejects(change({action:'prize',name:'Bad',description:'',icon:'x',kind:'spark_points',points_amount:0}),/check constraint/);
 let prize=await change({action:'prize',name:'School points + another chance',description:'School reward',icon:'⭐',kind:'spark_points',points_amount:25,bonus_tokens:1});
 await change({action:'stock',id:prize.id,revision:prize.revision,delta:2});
 const request=randomUUID(),revision=(await context()).revision;
 const [win,replay]=await Promise.all([rpc('pull',[manager,request,revision]),rpc('pull',[manager,request,revision])]);
 assert.deepEqual(win,replay);assert.equal(win.win.points_awarded,25);assert.equal(win.win.bonus_tokens,1);assert.equal(win.tokens,3);assert.equal(win.win.status,'received');
 await assert.rejects(rpc('pull',[other,request,revision]),/another school/);
 assert.equal(await rpc('pull_result',[other,request]),null);
 await db.exec('reset role');
 const ledger=(await db.query('select * from spark_points')).rows;
 assert.equal(ledger.length,1);assert.equal(ledger[0].location_id,1);assert.equal(ledger[0].points,25);assert.equal(ledger[0].unique_key,'mystery-pull-'+request);
 assert.equal((await db.query('select sum(points) total from spark_points where location_id=1')).rows[0].total,25,'School total includes prize');
 // Ledger failure must roll back all changes, allowing a safe retry later.
 await db.exec(`create function reject_test_credit() returns trigger language plpgsql as $$begin raise exception 'test ledger unavailable';end$$;
 create trigger reject_test_credit before insert on spark_points for each row execute function reject_test_credit();set role anon;`);
 const snapshot=await context(),inventory=(await rpc('context',[admin])).prizes.find(p=>p.id===prize.id).inventory,failed=randomUUID();
 await assert.rejects(rpc('pull',[manager,failed,snapshot.revision]),/ledger unavailable/);
 assert.deepEqual(await context(),snapshot);assert.equal(await rpc('pull_result',[manager,failed]),null);
 assert.equal((await rpc('context',[admin])).prizes.find(p=>p.id===prize.id).inventory,inventory);
 await db.exec('reset role;drop trigger reject_test_credit on spark_points;set role anon;');
 await rpc('pull',[manager,failed,snapshot.revision]);
 prize=(await rpc('context',[admin])).prizes.find(p=>p.id===prize.id);
 // Older admin clients preserve fields that they do not know about.
 const {bonus_tokens,points_amount,...legacyEditor}=prize;
 const preserved=await change({action:'prize',...legacyEditor,name:'Renamed points'});
 assert.equal(preserved.points_amount,25);assert.equal(preserved.bonus_tokens,1);
 let candy=await change({action:'prize',name:'Candy and pull',description:'Both rewards',icon:'🍬',kind:'manual',bonus_tokens:1});
 await change({action:'stock',id:candy.id,revision:candy.revision,delta:1});
 const bundle=await rpc('pull',[manager,randomUUID(),(await context()).revision]);
 assert.equal(bundle.win.prize_name,'Candy and pull');assert.equal(bundle.win.status,'waiting');assert.equal(bundle.win.bonus_tokens,1);assert.equal(bundle.tokens,3);assert.equal(bundle.win.points_awarded,0);
 await db.exec('reset role');assert.equal((await db.query('select sum(points) total from spark_points')).rows[0].total,50);
 // Submit a burst from 40 schools against ten prizes. PGlite queues these
 // transactions; this checks contention outcomes, not hosted-server throughput.
 await db.exec(`update mystery_prizes set active=false;
 insert into locations select n,'Burst School '||n,n::text,true from generate_series(1001,1040) n;`);
 const burstPrize=await change({action:'prize',name:'Burst test points',description:'Test only',icon:'⭐',kind:'spark_points',points_amount:7});
 await change({action:'stock',id:burstPrize.id,revision:burstPrize.revision,delta:10});
 const sessions=[];
 for(let id=1001;id<=1040;id++){
  const session=(await rpc('choose_school',[(await rpc('open',['1234'])).token,String(id)])).token;
  await change({action:'tokens',location_id:id,delta:1,revision:1});sessions.push(session);
 }
 await db.exec('set role anon');
 const results=await Promise.allSettled(sessions.map(session=>rpc('pull',[session,randomUUID(),2])));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,10);
 assert.equal(results.filter(r=>r.status==='rejected'&&/restocked/.test(r.reason.message)).length,30);
 await db.exec('reset role');
 assert.equal((await db.query('select sum(tokens) n from mystery_balances where location_id>=1001')).rows[0].n,30);
 assert.equal((await db.query('select count(*) n from mystery_wins where location_id>=1001')).rows[0].n,10);
 assert.equal((await db.query('select sum(points) n from spark_points where location_id>=1001')).rows[0].n,70);
 assert.equal((await db.query('select inventory from mystery_prizes where id=$1',[burstPrize.id])).rows[0].inventory,0);
 console.log('PASS: reward integrity, duplicate prevention, atomic rollback, school isolation and 40 queued requests competing for 10 prizes. No live writes.');
}finally{await db.close();}
