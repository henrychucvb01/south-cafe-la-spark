import {createHandler,validSubscription} from '../../api/supervisor-notifications';
const subscription={endpoint:'https://web.push.apple.com/synthetic',keys:{p256dh:Buffer.alloc(65,1).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')}};
function response(){return {setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()};}
test('blocks private network endpoints and malformed encryption keys',()=>{
 expect(validSubscription(subscription)).toBe(true);
 for(const endpoint of ['http://web.push.apple.com/x','https://127.0.0.1','https://evil.test','https://web.push.apple.com.evil.test','https://user:pass@web.push.apple.com'])expect(validSubscription({...subscription,endpoint})).toBe(false);
 expect(validSubscription({...subscription,keys:{}})).toBe(false);
});
test('manager or anonymous tokens cannot obtain keys or register a device',async()=>{
 const db={rpc:jest.fn().mockResolvedValue({data:false})},res=response();
 await createHandler(db)({method:'POST',body:{action:'key',pin:'employee'}},res);
 expect(res.status).toHaveBeenCalledWith(403);expect(db.rpc).toHaveBeenCalledTimes(1);
});
test('dispatch rejects an invalid secret before claiming any work',async()=>{
 const db={rpc:jest.fn().mockResolvedValue({data:{secret:'correct'}})},res=response();
 await createHandler(db)({method:'POST',body:{action:'dispatch',secret:'wrong'}},res);
 expect(res.status).toHaveBeenCalledWith(403);expect(db.rpc).toHaveBeenCalledTimes(1);
});
test('push contains counts only, uses encryption and deduplicated topic, retires expired subscriptions',async()=>{
 const db={rpc:jest.fn(async(name,{p_action})=>({data:p_action==='config'?{secret:'correct',publicKey:'public',privateKey:'private'}:p_action==='claim'?{counts:{total:4,version:7},lease:'lease',subscriptions:[{id:'one',subscription},{id:'two',subscription}]}:{ok:true}}))};
 const push={sendNotification:jest.fn().mockResolvedValueOnce({}).mockRejectedValueOnce({statusCode:410})},res=response();
 await createHandler(db,push)({method:'POST',body:{action:'dispatch',secret:'correct'}},res);
 expect(push.sendNotification.mock.calls[0][1]).toBe('{"version":7,"total":4}');
 expect(push.sendNotification.mock.calls[0][2]).toEqual(expect.objectContaining({urgency:'low',topic:'spark-supervisor',TTL:300}));
 expect(db.rpc).toHaveBeenCalledWith('supervisor_push_service',{p_action:'ack',p_data:expect.objectContaining({id:'two',status:'gone'})});
});
