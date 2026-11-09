"use strict";
// Optional background Web Push delivery for Community Chat (NOT an FCM web-token flow).
// Firebase Callable authenticates registrations, and RTDB triggers send notifications.
// Requires Blaze Functions deployment, a VAPID key pair, and approved browser permissions.
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {onValueCreated,onValueWritten}=require("firebase-functions/v2/database");
const {defineSecret,defineString}=require("firebase-functions/params");
const {logger}=require("firebase-functions");
const {getDatabase}=require("firebase-admin/database");
const {initializeApp,getApps}=require("firebase-admin/app");
if(!getApps().length)initializeApp({databaseURL:"https://website-chat-80038-default-rtdb.firebaseio.com/"});
const {createHash}=require("node:crypto");
const webpush=require("web-push");
const PRIVATE_KEY=defineSecret("CHAT_PUSH_VAPID_PRIVATE");
const PUBLIC_KEY=defineString("CHAT_PUSH_VAPID_PUBLIC",{default:""});
const PROJECT_INSTANCE="website-chat-80038-default-rtdb";
const REGION="us-central1";
const SUBSCRIPTIONS_PATH="chatPushSubscriptions";
const APP_PATH="https://minzo-vr.github.io/Minzos-Live-Chat/";
function allowedPushUrl(endpoint){
 if(typeof endpoint!=="string"||endpoint.length>2048)return false;
 try{
  const url=new URL(endpoint);
  const h=url.hostname.toLowerCase();
  return url.protocol==="https:"&&!url.username&&!url.password&&!url.port&&(
   h==="fcm.googleapis.com"||h==="updates.push.services.mozilla.com"||
   h==="push.services.mozilla.com"||h==="web.push.apple.com"||
   h.endsWith(".push.apple.com")||h.endsWith(".notify.windows.com")
  );
 }catch{return false}
}
function validKeyPart(raw){
 return typeof raw==="string"&&raw.length>=10&&raw.length<=256&&/^[A-Za-z0-9_-]+$/.test(raw);
}
function cleanSubscription(raw){
 if(!raw||typeof raw!=="object"||!allowedPushUrl(raw.endpoint)||
  !validKeyPart(raw.keys?.p256dh)||!validKeyPart(raw.keys?.auth))return null;
 return {endpoint:raw.endpoint,keys:{p256dh:raw.keys.p256dh,auth:raw.keys.auth}};
}
function recordId(subscription){
 return createHash("sha256").update(subscription.endpoint).digest("hex");
}
function pushReady(){
 return /^[A-Za-z0-9_-]{80,120}$/.test(String(PUBLIC_KEY.value()||""))&&
  /^[A-Za-z0-9_-]{35,60}$/.test(String(PRIVATE_KEY.value()||""));
}
function prepareWebPush(){
 if(!pushReady())throw Error("Community Chat VAPID keys not configured");
 webpush.setVapidDetails(APP_PATH,PUBLIC_KEY.value(),PRIVATE_KEY.value());
}
function activeRoleKeys(value){
 if(typeof value==="string")return new Set(value&&value!=="member"?[value]:[]);
 if(!value||typeof value!=="object"||Array.isArray(value))return new Set();
 return new Set(Object.keys(value).filter(key=>value[key]===true&&key.length<=64));
}
function getSubscriptionEntries(records){
 return Object.entries(records||{}).filter(([key,record])=>
  /^[a-f0-9]{64}$/.test(key)&&record?.enabled===true&&cleanSubscription(record.subscription));
}
async function sendToUser(uid,payload){
 const path=SUBSCRIPTIONS_PATH+"/"+uid;
 const snap=await getDatabase().ref(path).get();
 const subscriptions=getSubscriptionEntries(snap.val());
 if(!subscriptions.length)return;
 prepareWebPush();
 await Promise.all(subscriptions.slice(0,12).map(async([key,record])=>{
  try{
   await webpush.sendNotification(record.subscription,JSON.stringify(payload),{
    TTL:3600,urgency:"normal",contentEncoding:"aes128gcm"
   });
  }catch(error){
   if(error?.statusCode===404||error?.statusCode===410){
    await getDatabase().ref(path+"/"+key).remove();
   }else logger.warn("Community push failed",{code:error?.statusCode||"unknown"});
  }
 }));
}
exports.setChatPushSubscription=onCall({region:REGION,cors:["https://minzo-vr.github.io"],maxInstances:5},async request=>{
 const uid=request.auth?.uid;
 if(!uid||typeof uid!=="string")throw new HttpsError("unauthenticated","Sign in to Community Chat first.");
 const raw=request.data||{};
 const sub=cleanSubscription(raw.subscription);
 if(!sub)throw new HttpsError("invalid-argument","Invalid browser push subscription.");
 const deviceKey=recordId(sub);
 const path=getDatabase().ref(SUBSCRIPTIONS_PATH+"/"+uid+"/"+deviceKey);
 if(raw.action==="remove"){
  await path.remove();
  return {ok:true,removed:true};
 }
 if(raw.action!=="save")throw new HttpsError("invalid-argument","Unknown push action.");
 // The caller can manage only subscriptions belonging to its Firebase UID.
 // Never accept an arbitrary UID, notification title/body, or destination URL.
 if(!PUBLIC_KEY.value())throw new HttpsError("failed-precondition","Push service is not configured by the owner yet.");
 await path.set({
  subscription:sub,enabled:raw.enabled===true,
  updatedAt:Date.now()
 });
 return {ok:true,enabled:raw.enabled===true};
});
exports.sendCommunityPushAnnouncement=onValueCreated({
 ref:"/chatAnnouncementPublished/{releaseId}",instance:PROJECT_INSTANCE,region:REGION,
 secrets:[PRIVATE_KEY],retry:false
},async event=>{
 if(!event.data?.exists()||!PUBLIC_KEY.value())return;
 const all=await getDatabase().ref(SUBSCRIPTIONS_PATH).get();
 const users=all.val()||{};
 // Limit fan-out to avoid runaway costs; use queues for larger communities.
 const uids=Object.keys(users).slice(0,1000);
 const payload={type:"announcement",id:String(event.params.releaseId||"").slice(0,75)};
 for(let i=0;i<uids.length;i+=12){
  await Promise.all(uids.slice(i,i+12).map(uid=>sendToUser(uid,payload)));
 }
 logger.info("Community announcement push processed",{users:uids.length});
});
exports.sendCommunityPushRole=onValueWritten({
 ref:"/chatRoles/{uid}",instance:PROJECT_INSTANCE,region:REGION,
 secrets:[PRIVATE_KEY],retry:false
},async event=>{
 if(!PUBLIC_KEY.value()||!event.data)return;
 const before=activeRoleKeys(event.data.before.val());
 const after=activeRoleKeys(event.data.after.val());
 const added=[...after].filter(role=>!before.has(role));
 if(!added.length)return;
 await sendToUser(event.params.uid,{type:"role",id:String(event.id||"").slice(0,75)});
});
