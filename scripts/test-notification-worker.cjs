const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const webpush=require('web-push'),crypto=require('node:crypto');
async function main(){
 // Real VAPID signing + standards encryption, without sending a network request.
 const vapid=webpush.generateVAPIDKeys(),ecdh=crypto.createECDH('prime256v1');ecdh.generateKeys();
 const subscription={endpoint:'https://web.push.apple.com/synthetic',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
 const request=webpush.generateRequestDetails(subscription,'{"total":3}',{vapidDetails:{subject:'https://spark.cafelalistens.org',...vapid},TTL:300});
 assert.equal(request.headers['Content-Encoding'],'aes128gcm');assert.match(request.headers.Authorization,/vapid/);assert(!request.body.includes(Buffer.from('{"total":3}')));
 const handlers={},stored=new Map(),shown=[],badges=[],messages=[];
 const cache={match:async key=>stored.get(key)?.clone(),put:async(key,value)=>stored.set(key,value.clone())};
 const self={location:{origin:'https://spark.cafelalistens.org'},addEventListener:(type,fn)=>handlers[type]=fn,
  registration:{showNotification:async(title,options)=>shown.push({title,options}),getNotifications:async()=>[],pushManager:{getSubscription:async()=>({unsubscribe:async()=>true})}},
  navigator:{setAppBadge:async n=>badges.push(n),clearAppBadge:async()=>badges.push(0)},
  clients:{matchAll:async()=>[{postMessage:m=>messages.push(m)}]}};
 vm.runInNewContext(fs.readFileSync('public/service-worker.js','utf8'),{self,caches:{open:async()=>cache},Response,URL,fetch});
 async function event(type,data){let work;handlers[type]({data:type==='push'?{json:()=>data}:data,waitUntil:p=>work=p});await work;}
 await event('message',{type:'supervisor-push-enabled'});
 await event('push',{total:3,version:2});assert.equal(badges.at(-1),3);assert.equal(shown.at(-1).options.silent,true);assert.equal(shown.at(-1).options.tag,'spark-supervisor');
 await event('push',{total:0,version:3});assert.equal(badges.at(-1),0);
 await event('push',{total:8,version:1});assert.equal(badges.at(-1),0);assert.match(shown.at(-1).options.body,/All caught up/);
 await event('message',{type:'supervisor-push-disabled'});const before=shown.length;await event('push',{total:5,version:4});assert.equal(shown.length,before,'signout suppresses private supervisor badge');
 assert(messages.length>=2);console.log('PASS: real Web Push encryption/VAPID, grouped quiet notifications, badges, stale retries, foreground refresh and shared-device signout. No push sent.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
