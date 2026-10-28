import {createHandler} from '../../api/october-games';
jest.mock('sharp',()=>jest.fn());
jest.mock('@supabase/supabase-js',()=>({createClient:jest.fn()}));

test('announcement metadata is authorized and never signs or downloads photos',async()=>{
 const bucket={createSignedUrls:jest.fn(),download:jest.fn()};
 const data={participating:true,server_time:'2026-10-28',game_cycles:[{id:'cycle'}],game_waves:[{id:'wave'}],entries:[{photo_path:'private'}],rounds:[{photo_path:'mystery'}]};
 const db={storage:{from:()=>bucket},rpc:jest.fn().mockResolvedValue({data})};
 const res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()};
 await createHandler(db,true,true)({method:'POST',body:{action:'announcements',token:'valid'}},res);
 expect(db.rpc).toHaveBeenCalledWith('october_games_live',expect.objectContaining({p_action:'list',p_token:'valid'}));
 expect(res.json).toHaveBeenCalledWith({participating:true,server_time:'2026-10-28',game_cycles:[{id:'cycle'}],game_waves:[{id:'wave'}]});
 expect(bucket.createSignedUrls).not.toHaveBeenCalled();expect(bucket.download).not.toHaveBeenCalled();
});
test('invalid sessions cannot retrieve announcement metadata',async()=>{
 const bucket={createSignedUrls:jest.fn(),download:jest.fn()},db={storage:{from:()=>bucket},rpc:jest.fn().mockResolvedValue({error:{message:'Session expired'}})};
 const res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()};
 await createHandler(db,true,true)({method:'POST',body:{action:'announcements',token:'invalid'}},res);
 expect(res.status).toHaveBeenCalledWith(400);expect(bucket.createSignedUrls).not.toHaveBeenCalled();expect(bucket.download).not.toHaveBeenCalled();
});

test('live Showdown polling does not download or re-sign photographs',async()=>{const bucket={createSignedUrls:jest.fn(),download:jest.fn()},db={storage:{from:()=>bucket},rpc:jest.fn().mockResolvedValue({data:{showdown_poll:true,rounds:[{id:'round',photos:[{id:'photo',votes:2}]}]}})},res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()};await createHandler(db,true,true)({method:'POST',body:{action:'showdown_poll',token:'valid'}},res);expect(bucket.createSignedUrls).not.toHaveBeenCalled();expect(bucket.download).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(200);});

test('Showdown photos and comparison targets use existing private signed storage',async()=>{const bucket={createSignedUrls:jest.fn(async paths=>({data:paths.map(path=>({path,signedUrl:'signed-'+path}))}))},data={entries:[],rounds:[],showdowns:{champions:[{quest:7,photo_path:'winner'}],rounds:[{photos:[{photo_path:'defender'},{photo_path:'challenger'}]}],submissions:[{photo_path:'pending',target_photo:'original'}]}},db={storage:{from:()=>bucket},rpc:jest.fn().mockResolvedValue({data})},res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()};await createHandler(db,true,true)({method:'POST',body:{action:'list',token:'valid'}},res);const result=res.json.mock.calls[0][0];expect(result.showdowns.champions[0].photo_url).toBe('signed-winner');expect(result.showdowns.submissions[0].target_photo_url).toBe('signed-original');expect(JSON.stringify(result)).not.toContain('photo_path');expect(result.showdowns.submissions[0].target_photo).toBeUndefined();});
test('gallery rejects invalid sessions before signing any photos',async()=>{const bucket={createSignedUrls:jest.fn()},db={storage:{from:()=>bucket},rpc:jest.fn().mockResolvedValue({error:{message:'Session expired'}})},res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()};await createHandler(db,true,true)({method:'POST',body:{action:'side_quest_gallery',token:'invalid'}},res);expect(res.status).toHaveBeenCalledWith(400);expect(bucket.createSignedUrls).not.toHaveBeenCalled();});
test('gallery uses authorized list and excludes own pending entries and mystery photos',async()=>{const bucket={createSignedUrls:jest.fn().mockResolvedValue({data:[{path:'approved',signedUrl:'signed'}]}),upload:jest.fn(),download:jest.fn()},db={storage:{from:()=>bucket},rpc:jest.fn().mockResolvedValue({data:{entries:[{id:'1',state:'approved',consent:true,quest:1,photo_path:'approved'},{id:'2',state:'pending',consent:true,quest:2,photo_path:'private'}],rounds:[{photo_path:'mystery'}]}})},res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()};await createHandler(db,true,true)({method:'POST',body:{action:'side_quest_gallery',token:'valid'}},res);expect(db.rpc).toHaveBeenCalledWith('october_games_live',expect.objectContaining({p_action:'list',p_token:'valid'}));expect(bucket.createSignedUrls).toHaveBeenCalledWith(['approved'],300);expect(bucket.upload).not.toHaveBeenCalled();expect(bucket.download).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].photos).toHaveLength(1);});
