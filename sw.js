/* 家賃デス - fast offline-first 3.1 */
const CACHE="yachindesu-v4.0.0";
const ASSETS = ["./","./index.html","./app.css","./app.js","./yachin-sync.js","./manifest.webmanifest","./icon.svg","./apple-touch-icon.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll(ASSETS.map(url => new Request(url,{cache:"reload"}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("yachindesu-") && k !== CACHE).map(k => caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener("fetch", event => {
  const req=event.request;
  if(req.method!=="GET"||new URL(req.url).origin!==self.location.origin)return;
  if(req.mode==="navigate"){
    event.respondWith((async()=>{
      const cached=await caches.match("./index.html");
      const update=fetch(req).then(async response=>{
        if(response.ok){const cache=await caches.open(CACHE);await cache.put("./index.html",response.clone());}
        return response;
      });
      if(cached){
        event.waitUntil(update.catch(()=>{}));
        return cached;
      }
      try{return await update;}
      catch(error){return (await caches.match("./")) || Response.error();}
    })());
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(req);
    if(cached)return cached;
    const response=await fetch(req);
    if(response.ok){const cache=await caches.open(CACHE);event.waitUntil(cache.put(req,response.clone()));}
    return response;
  })());
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(windows=>{
    const opened=windows.find(w=>w.url.includes("/Yachindesu/"));
    return opened ? opened.focus() : self.clients.openWindow("./");
  }));
});
