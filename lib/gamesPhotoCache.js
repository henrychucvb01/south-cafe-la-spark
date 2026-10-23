// Process-local only: no paid cache or public copies of private photos.
// Callers must authorize each request before consulting this cache. Paths are
// immutable UUID uploads; rotation/replacement creates a new path.
export function createGamesPhotoCache({now=Date.now,maxBytes=32*1024*1024,maxEntries=512}={}){
 const entries=new Map();let used=0;
 function drop(key){const entry=entries.get(key);if(entry){used-=entry.size;entries.delete(key);}}
 function get(key){const entry=entries.get(key);if(!entry)return;if(entry.expires<=now()){drop(key);return;}entries.delete(key);entries.set(key,entry);return entry.value;}
 function put(key,value,size,ttl){
  drop(key);if(size>maxBytes)return;
  for(const [old,entry] of entries)if(entry.expires<=now())drop(old);
  while(entries.size&&(used+size>maxBytes||entries.size>=maxEntries))drop(entries.keys().next().value);
  entries.set(key,{value,size,expires:now()+ttl});used+=size;
 }
 return {
  async signedUrls(bucket,paths){
   const urls=new Map(),missing=[];
   for(const path of new Set(paths)){const cached=get('url:'+path);if(cached)urls.set(path,cached);else missing.push(path);}
   if(missing.length){
    const {data,error}=await bucket.createSignedUrls(missing,300);if(error)throw Error('Could not load submission photos.');
    for(const item of data||[])if(!item.error&&item.signedUrl){urls.set(item.path,item.signedUrl);put('url:'+item.path,item.signedUrl,Buffer.byteLength(item.signedUrl),240000);}
   }
   return {data:paths.filter(path=>urls.has(path)).map(path=>({path,signedUrl:urls.get(path)}))};
  },
  async remember(key,load){
   const cached=get(key);if(cached!==undefined)return cached;
   const value=await load();put(key,value,Buffer.isBuffer(value)?value.length:Buffer.byteLength(value),300000);return value;
  }
 };
}
