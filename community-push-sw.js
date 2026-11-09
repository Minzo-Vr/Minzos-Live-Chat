/* Community Chat background Web Push service worker.
 * Scope is the /Minzos-Live-Chat/ GitHub Pages app only.
 * Pushes contain general update and role alerts, not private chat content.
 */
"use strict";
const APP_PATH="/Minzos-Live-Chat/";
const APP_URL=new URL(APP_PATH,self.location.origin).href;
self.addEventListener("push",event=>{
  let payload={};
  try{payload=event.data?.json()||{}}catch{}
  const type=payload.type==="role"?"role":"announcement";
  const title=type==="role"?"🎉 Community Chat role updated":"📢 Community Chat announcement";
  const body=type==="role"?"Your account received a new role.":"A new Community Chat update is available.";
  // Safari requires a visible notification for incoming push events.
  event.waitUntil(self.registration.showNotification(title,{
    body,
    icon:"./app-icon.svg",
    badge:"./app-icon.svg",
    tag:"community-chat-"+type+"-"+String(payload.id||"").slice(0,75),
    data:{url:APP_URL},
    renotify:false
  }));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const clientsList=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const existing=clientsList.find(client=>client.url.startsWith(APP_URL));
    if(existing){await existing.focus();return}
    await self.clients.openWindow(APP_URL);
  })());
});
