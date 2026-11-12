/* Offline cache for the trip planner. Bump VERSION when files change. */
const VERSION="trip-v4";
const SHELL=["./","index.html","app.js","data.js","backend.js","../firebase-config.js","manifest.webmanifest","icon.svg","icon-192.png","icon-512.png"];
const EXTRA=["https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js","https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js","https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js","https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSION).then(async c=>{await c.addAll(SHELL);await Promise.all(EXTRA.map(u=>c.add(u).catch(()=>{})))}).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("trip-")&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;
  const url=new URL(r.url);
  if(url.origin===location.origin){
    // network first so updates arrive; cached copy when offline
    e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(VERSION).then(c=>c.put(r,cp))}return res})
      .catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||(r.mode==="navigate"?caches.match("index.html"):Response.error()))));
  }else if(/fonts\.(googleapis|gstatic)\.com$/.test(url.host)||url.host==="cdnjs.cloudflare.com"||(url.host==="www.gstatic.com"&&url.pathname.startsWith("/firebasejs/"))){
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok||res.type==="opaque"){const cp=res.clone();caches.open(VERSION).then(c=>c.put(r,cp))}return res})));
  }
});
