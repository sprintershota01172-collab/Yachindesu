/* 家賃デス offline-first v3 */
const CACHE="yachindesu-v3.0.0";
const ASSETS=["./","./index.html","./app.css","./app.js","./firebase-config.js","./manifest.webmanifest","./icon.svg","./apple-touch-icon.png"];
self.addEventListener("install",e=>{
 e.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
 e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",e=>{
 const r=e.request,url=new URL(r.url);
 if(r.method!=="GET"||url.origin!==self.location.origin)return;
 if(r.mode==="navigate"){
  e.respondWith(fetch(r).then(res=>{
   if(res.ok){const clone=res.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(r,clone)));}
   return res;
  }).catch(async()=>await caches.match(r)||await caches.match("./index.html")));
  return;
 }
 e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{
   if(res.ok){const clone=res.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(r,clone)));}
   return res;
 })));
});
self.addEventListener("notificationclick",e=>{
 e.notification.close();
 e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
  for(const c of list){if(c.url.includes("/Yachindesu/"))return c.focus();}
  return clients.openWindow("./");
 }));
});
