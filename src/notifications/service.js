import {supabase} from '../supabaseClient';
import {PRODUCTION_HOSTS} from '../security/databaseEnvironment';
export async function loadCounts(pin) {
 const rpc=PRODUCTION_HOSTS.includes(window.location.hostname)?'supervisor_notification_counts':'supervisor_notification_preview_counts';
 const {data,error}=await supabase.rpc(rpc,{p_pin:pin});
 if(error)throw error;return data;
}
async function call(body) {
 const response=await fetch('/api/supervisor-notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Notifications unavailable.');return result;
}
export function pushSupported() {return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
export async function updateBadge(total,version) {
 try {if(total>0)await navigator.setAppBadge?.(total);else await navigator.clearAppBadge?.();} catch { /* Badging is optional. */ }
 if(Number.isSafeInteger(version))navigator.serviceWorker?.controller?.postMessage({type:'supervisor-counts',total,version});
}
export async function enablePush(pin) {
 if(!pushSupported())throw Error('On iPhone, add SPARK to your Home Screen, open it there, then enable notifications. iOS 16.4 or later is required.');
 // This call must remain directly in the button's gesture, before any network await.
 const permission=await Notification.requestPermission();
 if(permission!=='granted')throw Error('Notifications are off. You can allow them in your device notification settings.');
 const {publicKey}=await call({action:'key',pin});
 const registration=await navigator.serviceWorker.ready;
 const raw=atob(publicKey.replace(/-/g,'+').replace(/_/g,'/'));
 const key=Uint8Array.from(raw,c=>c.charCodeAt(0));
 const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 let device=localStorage.getItem('spark-push-device');
 if(!device){device=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem('spark-push-device',device);}
 await call({action:'subscribe',pin,subscription:subscription.toJSON(),device});
 registration.active?.postMessage({type:'supervisor-push-enabled'});
 return true;
}
export async function disablePush() {
 // First suppress local notifications even if connectivity is lost during sign-out.
 navigator.serviceWorker?.controller?.postMessage({type:'supervisor-push-disabled'});
 const device=localStorage.getItem('spark-push-device');
 if('serviceWorker' in navigator){const r=await navigator.serviceWorker.getRegistration();r?.active?.postMessage({type:'supervisor-push-disabled'});await (await r?.pushManager.getSubscription())?.unsubscribe();}
 await updateBadge(0);
 if(device)await call({action:'unsubscribe',device});
 localStorage.removeItem('spark-push-device');await updateBadge(0);
}
export function notificationsChanged(){window.dispatchEvent(new Event('supervisor-notifications-updated'));}
