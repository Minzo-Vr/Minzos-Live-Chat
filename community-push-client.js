/* Community Chat background notifications.
 * Opt-in browser Web Push; supports installed iOS/iPadOS home-screen web apps.
 * Does not change existing in-chat mention, role, announcement, or DND logic.
 */
import {getApps} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";
const $=id=>document.getElementById(id);
const enable=$("enableBackgroundNotifications"),disable=$("disableBackgroundNotifications");
const feedback=$("backgroundNotificationsFeedback");
const PUBLIC_KEY=String(window.COMMUNITY_CHAT_VAPID_PUBLIC_KEY||"").trim();
const PREF_KEY="communityChatAnnouncementPrefsV1";
const SW_PATH="./community-push-sw.js";
const SCOPE="./";
let auth=null,account=null,previousUid=null,registration=null,changing=false;
function notice(text){if(feedback)feedback.textContent=text}
function prefs(){
 try{
  const saved=JSON.parse(localStorage.getItem(PREF_KEY)||"{}");
  return {notifications:saved.notifications===true,dnd:saved.dnd===true};
 }catch{return {notifications:false,dnd:false}}
}
const supported=()=>"serviceWorker" in navigator&&"PushManager" in window&&
 "Notification" in window&&window.isSecureContext;
function publicKeyBytes(key){
 const padded=key.replace(/-/g,"+").replace(/_/g,"/");
 const binary=atob(padded+"=".repeat((4-padded.length%4)%4));
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 if(bytes.length!==65||bytes[0]!==4)throw Error("The site owner's VAPID public key is invalid.");
 return bytes;
}
async function getExisting(){
 if(!supported())return null;
 const active=registration||await navigator.serviceWorker.getRegistration(SCOPE);
 return active?await active.pushManager.getSubscription():null;
}
async function reflect(){
 if(!enable||!disable)return;
 let subscription=null;
 try{subscription=await getExisting()}catch{}
 disable.hidden=!subscription;
 enable.textContent=subscription?"Refresh background notifications":"🔔 Enable notifications after closing";
 enable.disabled=changing||!account;
 disable.disabled=changing||!account;
}
async function sendRegistration(subscription,enabled){
 if(!auth?.currentUser)return;
 const app=auth.app;
 const callable=httpsCallable(getFunctions(app,"us-central1"),"setChatPushSubscription");
 const result=await callable({action:"save",subscription:subscription.toJSON(),enabled});
 if(result.data?.ok!==true)throw Error("Notification service returned an unexpected response.");
}
async function removeRegistration(subscription){
 if(auth?.currentUser){
  const callable=httpsCallable(getFunctions(auth.app,"us-central1"),"setChatPushSubscription");
  await callable({action:"remove",subscription:subscription.toJSON()});
 }
}
async function syncPreferences(){
 if(changing||!account||!PUBLIC_KEY||!supported())return;
 try{
  const subscription=await getExisting();
  if(!subscription)return;
  const setting=prefs();
  await sendRegistration(subscription,setting.notifications&&!setting.dnd);
  notice(setting.dnd?"Background alerts paused by Do Not Disturb.":
    setting.notifications?"Background notification preferences updated.":"Background alerts paused. Enable chat notifications to resume.");
 }catch(err){console.warn("Background notification preference sync",err?.code||err?.message);}
}
function initialFeedback(){
 if(!PUBLIC_KEY)return "Background push setup isn't finished by the Community Hub owner yet. In-chat alerts still work.";
 if(!supported()){
  const apple=/iPad|iPhone|iPod/.test(navigator.userAgent)||
   (navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  return apple?"On iPhone/iPad, add Community Chat to the Home Screen, open it from that icon, then enable notifications here.":
   "Background notifications aren't supported in this browser or embedded view. Open Community Chat directly in a supported HTTPS browser.";
 }
 return account?"Get alerts for new announcements and roles even after closing Community Chat. Tap Enable to opt in.":
   "Sign in to Community Chat to enable alerts after closing the site.";
}
enable?.addEventListener("click",()=>{
 if(changing)return;
 if(!account){notice("Sign in to Community Chat first.");return}
 if(window.self!==window.top){notice("Open Community Chat directly, not inside an embedded frame, to enable background notifications.");return}
 if(!PUBLIC_KEY){notice(initialFeedback());return}
 if(!supported()){notice(initialFeedback());return}
 if(prefs().dnd){notice("Turn off Do Not Disturb before subscribing. You can enable it again later.");return}
 // Permission MUST be requested from the user's actual click gesture, not after an await.
 const permissionPromise=Notification.permission==="granted"?Promise.resolve("granted"):Notification.requestPermission();
 changing=true;void reflect();
 void (async()=>{
  try{
   const permission=await permissionPromise;
   if(permission!=="granted"){notice("Notification permission wasn't granted ("+permission+"). You can change it in device settings.");return}
   const publicKey=publicKeyBytes(PUBLIC_KEY);
   registration=await navigator.serviceWorker.register(SW_PATH,{scope:SCOPE});
   let subscription=await registration.pushManager.getSubscription();
   if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey});
   // A successful callable registration is required; local browser permission alone is NOT enough.
   await sendRegistration(subscription,true);
   const enabledCheckbox=$("enableChatNotifications");
   if(enabledCheckbox&&!enabledCheckbox.checked){
    enabledCheckbox.checked=true;enabledCheckbox.dispatchEvent(new Event("change",{bubbles:true}));
   }
   notice("✓ Background notifications enabled on this device for announcements and new roles. You can close Community Chat.");
  }catch(err){
   const code=String(err?.code||"");
   const msg=/functions\/(not-found|unavailable|internal)/.test(code)?
     "The owner still needs to deploy the Firebase notification service.":
     String(err?.message||"Background notification setup failed.").slice(0,210);
   notice(msg);
  }finally{changing=false;void reflect()}
 })();
});
disable?.addEventListener("click",async()=>{
 if(changing)return;
 changing=true;void reflect();
 try{
  const subscription=await getExisting();
  if(subscription){
   try{await removeRegistration(subscription)}finally{await subscription.unsubscribe()}
  }
  notice("Background notifications turned off on this device. In-chat alerts are unchanged.");
 }catch(err){notice("Couldn't fully disable push: "+String(err?.message||err).slice(0,140))}
 finally{changing=false;void reflect()}
});
for(const id of ["enableChatNotifications","doNotDisturb"]){
 $(id)?.addEventListener(id==="doNotDisturb"?"click":"change",()=>setTimeout(()=>void syncPreferences(),0));
}
window.addEventListener("storage",event=>{if(event.key===PREF_KEY)void syncPreferences()});
async function start(){
 for(let i=0;i<25&&!getApps().length;i++)await new Promise(resolve=>setTimeout(resolve,300));
 const app=getApps().find(a=>a.name==="[DEFAULT]")||getApps()[0];
 if(!app){notice("Community Chat authentication isn't ready.");return}
 auth=getAuth(app);
 onAuthStateChanged(auth,async next=>{
  const oldUid=previousUid;
  previousUid=next?.uid||null;
  account=next;
  if(oldUid&&oldUid!==next?.uid){
   // Prevent delivery to a device after sign-out or switching accounts.
   try{const existing=await getExisting();if(existing)await existing.unsubscribe()}catch{}
  }
  notice(initialFeedback());
  await reflect();
  if(next&&PUBLIC_KEY)void syncPreferences();
 });
}
notice(initialFeedback());
void start().catch(error=>notice("Could not start background notifications: "+String(error?.message||error).slice(0,130)));
