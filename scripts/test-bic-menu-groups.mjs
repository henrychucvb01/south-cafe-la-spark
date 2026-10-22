import assert from 'node:assert/strict';
import {bicTestDatabase} from './bic-test-fixture.mjs';
const db=await bicTestDatabase();try{
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const val=async(sql,args=[])=>(await q(sql,args))[0].v;
 await db.exec('set role anon');
 const token=await val("select open_supper_monitoring_session(1,11,'1234',null) v"),other=await val("select open_supper_monitoring_session(2,22,'1234',null) v");
 const make=async(name,t=token)=>val("select breakfast_save_classroom($1,null,null,$2,'Fictional Teacher',20,'Main',true) v",[t,name]);
 const standard=await make('TEST-Standard'),kinder=await make('TEST-Kinder'),special=await make('TEST-Kinder-Milk'),foreign=await make('TEST-Other',other);
 let date='2026-10-07',workspace;
 const ws=async(action='list',payload={},t=token,d=date)=>val('select breakfast_menu_workspace($1,$2,$3,$4) v',[t,d,action,payload]);
 workspace=await ws();assert.deepEqual(workspace.groups,[]);
 const mutate=async(action,payload={},d=date)=>workspace=await ws(action,{revision:workspace.revision,...payload},token,d);
 const main={entree1:'Fictional Toast',entree2:'Fictional Cereal',fruit:'Fictional Pear',juice:'Fictional Juice',milk1:'1% Milk',milkLactaid:'Lactaid',milkSpecial:'Almond milk',vegan:'Dietary Entree',other:'Special Diet'};
 await assert.rejects(ws('menu_save',{revision:workspace.revision,items:main}),/Assign special milk/);await mutate('menu_save',{items:Object.fromEntries(Object.entries(main).filter(([key])=>key!=='milkSpecial'))});
 const preview=(c,d=date)=>ws('preview',{classroom_id:c.id},token,d);
 assert.deepEqual((await preview(standard)).menu,Object.fromEntries(Object.entries(main).filter(([key])=>key!=='milkSpecial')));
 // Existing open teacher screens remain compatible during deployment.
 const compat=await make('TEST-Old-Client'),compatQr=await val('select breakfast_classroom_qr($1,$2) v',[token,compat.id]);
 await val("select breakfast_teacher_submit_v2($1,'2026-10-06',4,'',true,0,10,$2,null,'{}') v",[compatQr,{strokes:[[[0,0],[1,1]]]}]);
 const oldMenu=Object.fromEntries(Object.entries(main).filter(([key])=>['entree1','entree2','vegan','other'].includes(key))),oldCounts={entree1:4,entree2:0,vegan:0,other:0};
 const oldOrder=await val("select breakfast_teacher_preorder_v2($1,'2026-10-06','2026-10-07',$2,$3,0) v",[compatQr,oldCounts,oldMenu]);assert.equal(oldOrder.record.preorder_items.version,2);assert.deepEqual(oldOrder.record.preorder_items.counts,oldCounts);
 await assert.rejects(ws('group_save',{revision:workspace.revision,name:'Foreign',kind:'main',members:[foreign.id]}),/belong to your school/);
 await mutate('group_save',{name:'Kindergarten',kind:'main',members:[kinder.id,special.id]});const kg=workspace.groups.find(g=>g.name==='Kindergarten').id;assert.equal(workspace.groups[0].count,2);
 assert((await preview(kinder)).conflicts[0].includes('has no menu'));
 const km={entree1:'Fictional Toast',fruit:'Fictional Pear',milk1:'1% Milk'};
 await mutate('menu_save',{group_id:kg,items:km});assert.deepEqual((await preview(kinder)).menu,km);
 assert.equal((await preview(standard)).menu.milkSpecial,undefined);assert.equal((await preview(standard)).menu.other,undefined);
 await mutate('group_save',{name:'Special Milk',kind:'milk',members:[special.id]});const mg=workspace.groups.find(g=>g.name==='Special Milk').id;
 await mutate('menu_save',{group_id:mg,items:{milkSpecial:'Almond milk'}});
 let resolved=await preview(special);assert.deepEqual(resolved.menu,{entree1:'Fictional Toast',fruit:'Fictional Pear',milkSpecial:'Almond milk'});assert.equal(resolved.menu.entree2,undefined);assert.equal(resolved.menu.milk1,undefined);
 await assert.rejects(ws('menu_save',{revision:workspace.revision,group_id:mg,items:{entree2:'Expensive food'},confirmed:true}),/milk options only/);
 await assert.rejects(ws('menu_save',{revision:workspace.revision,group_id:kg,items:main}),/Confirm replacing/);
 await mutate('group_save',{name:'Custom Group',kind:'main',members:[special.id]});const custom=workspace.groups.find(g=>g.name==='Custom Group').id;
 await mutate('menu_save',{group_id:custom,items:{entree2:'Different Cereal'}});assert((await preview(special)).conflicts.some(x=>x.includes('conflict')));assert.deepEqual((await preview(special)).menu,{});
 const fixed={...km,milk1:'',milkSpecial:'Almond milk'};delete fixed.milk1;
 await mutate('classroom_save',{classroom_id:special.id,items:fixed,confirmed:true});assert.deepEqual((await preview(special)).menu,fixed);
 const qr=await val('select breakfast_classroom_qr($1,$2) v',[token,special.id]);
 // Count today's meals with the usual signed workflow, then preorder tomorrow.
 await mutate('menu_save',{items:{entree1:'Today Toast'}},'2026-10-06');
 await mutate('classroom_save',{classroom_id:special.id,items:{entree1:'Today Toast'},confirmed:true},'2026-10-06');
 const page=()=>val('select breakfast_teacher_page($1) v',[qr]);let p=await page();assert.deepEqual(p.preorder_menu,fixed);assert.equal(p.menu_groups_version,3);
 p=await val("select breakfast_teacher_submit_v2($1,'2026-10-06',10,'',true,0,15,$2,null,$3) v",[qr,{strokes:[[[0,0],[1,1]]]},p.menu]);
 const order={entree1:10,fruit:10,milkSpecial:2};
 p=await val("select breakfast_teacher_preorder_v2($1,'2026-10-06','2026-10-07',$2,$3,0) v",[qr,order,p.preorder_menu]);assert.deepEqual(p.record.preorder_items.counts,order);
 // Later group edits retain this exact order and its labels/quantities.
 workspace=await ws();await mutate('menu_save',{group_id:kg,items:{entree1:'Later Toast'},confirmed:true});
 assert.deepEqual((await page()).preorder_menu,fixed);assert.deepEqual((await page()).record.preorder_items.counts,order);
 await assert.rejects(ws('classroom_save',{revision:workspace.revision,classroom_id:special.id,items:main,confirmed:true}),/protected/);
 await assert.rejects(ws('menu_save',{revision:0,items:main,confirmed:true}),/configuration changed/);
 const report=await val("select breakfast_packing_report($1,'2026-10-07') v",[token]);const packed=report.rows.find(r=>r.id===special.id);assert.deepEqual(packed.items,order);assert.deepEqual(packed.menu,fixed);assert.equal(packed.quantity_source,'Teacher pre-order');assert.equal(report.rows.find(r=>r.id===standard.id).menu.milkSpecial,undefined);
 // Date copy protects existing target menus and other dates.
 workspace=await ws();await mutate('copy_date',{group_id:kg,destination:'2026-10-08'});assert.deepEqual((await ws('list',{},token,'2026-10-08')).menus[kg],{entree1:'Later Toast'});
 await assert.rejects(ws('copy_date',{revision:workspace.revision,group_id:kg,destination:'2026-10-08'}),/Confirm replacing/);
 await mutate('copy_date',{group_id:kg,destination:'2026-10-08',confirmed:true});
 await mutate('group_save',{id:custom,name:'Renamed Custom',kind:'main',members:[]});assert.equal(workspace.groups.find(g=>g.id===custom).count,0);
 await mutate('group_delete',{id:custom,confirmed:true});assert(!workspace.groups.some(g=>g.id===custom));
 // Fictional worker uses the same QR and roster/PIN flow on the order date.
 await db.exec("reset role;update test_clock set value='2026-10-07 15:00:00+00';set role anon");
 const worker=(await val("select breakfast_worker_login($1,'staff:101','9999') v",[qr])).token;
 let bag=await val('select breakfast_worker_page($1,$2) v',[qr,worker]);assert.deepEqual(bag.menu,fixed);assert.deepEqual(bag.ordered_counts,order);
 const pack=items=>val("select breakfast_worker_pack($1,$2,'2026-10-07',null,$3,$4,true,0) v",[qr,worker,items,bag.menu]);
 await assert.rejects(pack({...order,milkSpecial:3}),/authorized and ordered/);
 bag=await pack(order);assert.equal(bag.packing_revision,1);assert.deepEqual(bag.items_sent,order);assert.deepEqual((await pack(order)).items_sent,order);
 const history=(await val('select breakfast_classroom_history($1,$2) v',[token,special.id])).days;
 const packedSnapshot=history.find(d=>d.service_date==='2026-10-07');
 workspace=await ws();await mutate('group_save',{id:mg,name:'Approved Special Milk',kind:'milk',members:[special.id]});
 await mutate('menu_save',{group_id:mg,items:{milk1:'Regular milk'},confirmed:true});assert.deepEqual((await preview(special)).menu,fixed);
 const after=(await val('select breakfast_classroom_history($1,$2) v',[token,special.id])).days.find(d=>d.service_date==='2026-10-07');assert.deepEqual(after,packedSnapshot);
 // Legacy packed history remains byte-for-byte stable through group edits.
 await db.exec('reset role');
 await q("insert into breakfast_daily_records(classroom_id,location_id,service_date,room_snapshot,teacher_snapshot,enrollment_snapshot,menu_snapshot,items_sent,packing_submitted_at) values($1,1,'2026-10-01','TEST-Standard','Fictional Teacher',20,$2,$3,now())",[standard.id,{entree1:'Original historical toast',milkLactaid:'Original Lactaid'},{entree1:7,milkLactaid:1}]);await db.exec('set role anon');
 const oldReport=await val("select breakfast_packing_report($1,'2026-10-01') v",[token]);assert.equal(oldReport.rows[0].menu.entree1,'Original historical toast');assert.equal(oldReport.rows[0].items.milkLactaid,1);
 // Missing/default, inactive rooms and milk-group conflicts are explicit.
 const noMenu=await preview(standard,'2026-11-17');assert(noMenu.conflicts.some(c=>c.includes('No available')));
 await mutate('group_save',{name:'Conflicting Milk',kind:'milk',members:[kinder.id]});const secondMilk=workspace.groups.find(g=>g.name==='Conflicting Milk').id;
 await mutate('menu_save',{group_id:secondMilk,items:{milkLactaid:'Lactaid'}});
 await mutate('group_save',{id:mg,name:'Approved Special Milk',kind:'milk',members:[special.id,kinder.id]});assert((await preview(kinder)).conflicts.some(c=>c.includes('Milk menu conflict')));
 assert.equal(await val('select breakfast_classroom_qr($1,$2) v',[token,special.id]),qr);
 await assert.rejects(ws('preview',{classroom_id:special.id},other),/not found/);
 await db.exec('reset role');assert.equal((await q('select breakfast_count from meal_counts'))[0].breakfast_count,642);
 const audit=await q('select * from breakfast_menu_group_audit');assert(audit.length>=15);
 await db.exec('set role anon');for(const table of ['breakfast_menu_groups','breakfast_menu_group_members','breakfast_group_daily_menus','breakfast_classroom_daily_menus','breakfast_menu_group_audit'])await assert.rejects(q('select * from '+table),/permission denied/);
 console.log('PASS: fictional group CRUD, memberships, main/milk layering, no blanket dietary extras, explicit conflict resolution, daily menus/copy confirmation/stale saves, unchanged QR and signed teacher workflow, resolved preorders/packing quantities, frozen saved orders, school isolation and private audit.');
}finally{await db.close();}
