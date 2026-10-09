// SPARK Service Worker
// Minimal version — no aggressive caching.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

// Cache holds only this device's opt-in and last delivered version, never review content.
const pushCache='spark-notification-preferences-v1';
const preference='/__spark_notification_preference';
let pushWork=Promise.resolve();
self.addEventListener('message',event=>{
 if(event.data?.type==='supervisor-counts'){
  event.waitUntil((async()=>{
   const cache=await caches.open(pushCache),stored=await cache.match(preference);
   const previous=stored?await stored.json():{enabled:false,version:0};
   if(Number.isSafeInteger(event.data.version)&&event.data.version>=previous.version){
    await cache.put(preference,new Response(JSON.stringify({...previous,version:event.data.version,total:event.data.total})));
    if(event.data.total===0)for(const n of await self.registration.getNotifications())n.close();
   }
  }));return;
 }
 if(!['supervisor-push-enabled','supervisor-push-disabled'].includes(event.data?.type))return;
 event.waitUntil((async()=>{
  const cache=await caches.open(pushCache);
  await cache.put(preference,new Response(JSON.stringify({enabled:event.data.type==='supervisor-push-enabled',version:0})));
  if(event.data.type==='supervisor-push-disabled'){
   await self.registration.pushManager.getSubscription().then(s=>s?.unsubscribe());
   await self.navigator.clearAppBadge?.();
   for(const n of await self.registration.getNotifications())n.close();
  }
 })());
});
self.addEventListener('push',event=>{
 pushWork=pushWork.catch(()=>{}).then(async()=>{
  const cache=await caches.open(pushCache),stored=await cache.match(preference);
  const previous=stored?await stored.json():{enabled:false,version:0};
  if(!previous.enabled)return;
  let data;try{data=event.data.json();}catch{data={};}
  const valid=Number.isSafeInteger(data.total)&&data.total>=0&&Number.isSafeInteger(data.version);
  const fresh=valid&&data.version>=previous.version;
  // Even stale retries must show a notification on Safari. One tag replaces the old one.
  const total=fresh?data.total:previous.total;
  await self.registration.showNotification('SPARK Supervisor',{
   body:Number.isSafeInteger(total)?(total?`${total} items need your attention.`:'All caught up. No items need attention.'):'Open SPARK to review updates.',
   tag:'spark-supervisor',renotify:false,silent:true,icon:'/spark-192.png',data:{url:'/?supervisorNotifications=1'},
  });
  if(fresh){
   try{if(total)await self.navigator.setAppBadge?.(total);else await self.navigator.clearAppBadge?.();}catch{}
   await cache.put(preference,new Response(JSON.stringify({enabled:true,version:data.version,total})));
  }
  for(const client of await self.clients.matchAll({type:'window'}))client.postMessage({type:'supervisor-notifications-updated'});
 });
 event.waitUntil(pushWork);
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const client=windows.find(c=>new URL(c.url).origin===self.location.origin);
  if(client){client.postMessage({type:'open-supervisor-notifications'});await client.focus();}
  else await self.clients.openWindow('/?supervisorNotifications=1');
 })());
});
