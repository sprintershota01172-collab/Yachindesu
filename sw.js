/* 家賃デス v8 — handwritten chic; offline app shell and optional font cache */
const CACHE="yachindesu-v8.0.0";
const FONT_CACHE="yachindesu-hand-font-v1";
const ASSETS = ["./","./index.html","./app.css","./design.css","./app.js","./yachin-account.js","./auth-ui.js","./yachin-sync.js","./manifest.webmanifest","./icon.svg","./apple-touch-icon.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll(ASSETS.map(url => new Request(url,{cache:"reload"}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("yachindesu-") && k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener("fetch", event => {
  const req=event.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  // Optional handwritten font files: keep the last successfully loaded copy for offline use.
  if(url.hostname==="fonts.googleapis.com"||url.hostname==="fonts.gstatic.com"){
    event.respondWith((async()=>{
      const cache=await caches.open(FONT_CACHE),cached=await cache.match(req);
      if(cached)return cached;
      try{
        const response=await fetch(req);
        if(response.ok||response.type==="opaque")event.waitUntil(cache.put(req,response.clone()));
        return response;
      }catch(error){return Response.error();}
    })());
    return;
  }
  if(url.origin!==self.location.origin)return;
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
