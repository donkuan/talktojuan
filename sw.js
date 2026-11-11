/* Offline cache for Talk to Juan. Bump VERSION when files change. */
const VERSION="ttj-v4";
const SHELL=["./","index.html","app.js","content.js","firebase-config.js","backend-firebase.js","manifest.webmanifest","icon.svg","icon-192.png","icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;
  const url=new URL(r.url);
  if(url.origin===location.origin){
    // network first for app files so updates arrive, cache as fallback offline
    e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(VERSION).then(c=>c.put(r,cp))}return res}).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match("index.html"))));
  }else if(/fonts\.(googleapis|gstatic)\.com$/.test(url.host)||(url.host==="www.gstatic.com"&&url.pathname.startsWith("/firebasejs/"))){
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{const cp=res.clone();caches.open(VERSION).then(c=>c.put(r,cp));return res})));
  }
});
