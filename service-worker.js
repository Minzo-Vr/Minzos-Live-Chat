// Only cache static app shell assets. Never cache chat messages, auth responses or Firebase data.
const CACHE="community-chat-static-v1";
const SHELL=["./app-icon.svg","./manifest.webmanifest"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));self.skipWaiting();});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET"||new URL(request.url).origin!==self.location.origin)return;
 const url=new URL(request.url);
 if(url.pathname.endsWith("/app-icon.svg")||url.pathname.endsWith("/manifest.webmanifest")){
   event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
 }
});
