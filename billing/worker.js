/**
 * Community Hub Chat+ billing backend. Cloudflare Worker, no Node dependencies.
 * Web: Stripe Checkout. iOS: StoreKit purchases through RevenueCat.
 * Firebase entitlements are server-only writes; NO payment status is read from
 * request body or checkout return URL. Configure all secrets before deployment.
 */
const PROJECT="website-chat-80038";
const DEFAULT_DB="https://website-chat-80038-default-rtdb.firebaseio.com";
const WEB_ORIGIN="https://minzo-vr.github.io";
const textEncoder=new TextEncoder();
const jwksUrl="https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}});
const value=b=>b instanceof ArrayBuffer?new Uint8Array(b):new Uint8Array(b.buffer||b);
const b64url=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
const fromB64=s=>Uint8Array.from(atob(s.replaceAll("-","+").replaceAll("_","/")+"=".repeat((4-s.length%4)%4)),x=>x.charCodeAt(0));
function fail(status,message){const e=Error(message);e.status=status;throw e;}
function same(a,b){if(typeof a!=="string"||typeof b!=="string")return false;const x=textEncoder.encode(a),y=textEncoder.encode(b);let diff=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]||0)^(y[i]||0);return diff===0}
function appUrl(env){return String(env.PUBLIC_SITE_URL||"https://minzo-vr.github.io/Minzos-Live-Chat/")}
function originHeaders(origin){return origin===WEB_ORIGIN?{"access-control-allow-origin":WEB_ORIGIN,"vary":"Origin","access-control-allow-headers":"authorization, content-type","access-control-allow-methods":"GET, POST, OPTIONS"}:{}}
function isStripeConfigured(env){
 return !!(env.STRIPE_SECRET_KEY&&env.STRIPE_WEBHOOK_SECRET&&/^price_/.test(env.STRIPE_PRICE_ID||"")&&env.FIREBASE_SERVICE_ACCOUNT);
}
const testMode=env=>env.STRIPE_MODE!=="live";
async function stripe(env,method,path,params){
 if(!env.STRIPE_SECRET_KEY)fail(503,"Stripe not configured.");
 if(testMode(env)&&!env.STRIPE_SECRET_KEY.startsWith("sk_test_"))fail(503,"Test mode requires a Stripe test key.");
 if(!testMode(env)&&!env.STRIPE_SECRET_KEY.startsWith("sk_live_"))fail(503,"Live mode requires a Stripe live key.");
 const response=await fetch("https://api.stripe.com/v1"+path,{method,headers:{"authorization":"Bearer "+env.STRIPE_SECRET_KEY,...(params?{"content-type":"application/x-www-form-urlencoded"}:{})},...(params?{body:new URLSearchParams(params)}:{})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)fail(502,"Stripe: "+String(data.error?.message||response.status).slice(0,180));
 return data;
}
async function verifyHmac(secret,payload,signatureHeader){
 if(!secret||!signatureHeader)return false;
 const pieces=Object.fromEntries(signatureHeader.split(",").map(x=>x.trim().split("=")));
 const ts=Number(pieces.t);
 if(!Number.isSafeInteger(ts)||Math.abs(Date.now()/1000-ts)>300||!/^[0-9a-f]{64}$/i.test(pieces.v1||""))return false;
 const key=await crypto.subtle.importKey("raw",textEncoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const mac=await crypto.subtle.sign("HMAC",key,textEncoder.encode(ts+"."+payload));
 return same([...new Uint8Array(mac)].map(x=>x.toString(16).padStart(2,"0")).join(""),pieces.v1.toLowerCase());
}
async function verifyFirebaseToken(req){
 const header=req.headers.get("authorization")||"",jwt=header.startsWith("Bearer ")?header.slice(7):"";
 const parts=jwt.split(".");
 if(parts.length!==3||parts.some(x=>x.length>8000||!x))fail(401,"Sign in with your Community Chat account.");
 let head,payload;
 try{head=JSON.parse(new TextDecoder().decode(fromB64(parts[0])));payload=JSON.parse(new TextDecoder().decode(fromB64(parts[1])))}catch{fail(401,"Invalid authentication token.")}
 if(head.alg!=="RS256"||typeof head.kid!=="string"||payload.aud!==PROJECT||payload.iss!=="https://securetoken.google.com/"+PROJECT||
    typeof payload.sub!=="string"||payload.sub.length<1||payload.sub.length>128||!Number.isFinite(payload.iat)||!Number.isFinite(payload.exp)||
    payload.exp<=Math.floor(Date.now()/1000)||payload.iat>Math.floor(Date.now()/1000)||!payload.auth_time)fail(401,"Expired or invalid Firebase sign-in.");
 const response=await fetch(jwksUrl,{headers:{accept:"application/json"}});
 if(!response.ok)fail(503,"Google identity keys temporarily unavailable.");
 const jwks=await response.json();
 const jwk=jwks.keys?.find(key=>key.kid===head.kid&&key.kty==="RSA");
 if(!jwk)fail(401,"Unrecognised Firebase sign-in key.");
 const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
 const verified=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,fromB64(parts[2]),textEncoder.encode(parts[0]+"."+parts[1]));
 if(!verified)fail(401,"Firebase token signature was invalid.");
 return {uid:payload.sub,email:typeof payload.email==="string"?payload.email:null};
}
let cachedGoogleToken=null;
async function googleAccess(env){
 if(cachedGoogleToken&&cachedGoogleToken.until>Date.now()+60000)return cachedGoogleToken.token;
 if(!env.FIREBASE_SERVICE_ACCOUNT)fail(503,"Firebase server credentials are not configured.");
 let sa;try{sa=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)}catch{fail(503,"Firebase service account JSON is invalid.")}
 if(sa.project_id!==PROJECT||!sa.client_email||!sa.private_key)fail(503,"Firebase service account project mismatch.");
 const pem=sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
 const key=await crypto.subtle.importKey("pkcs8",Uint8Array.from(atob(pem),x=>x.charCodeAt(0)),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const now=Math.floor(Date.now()/1000),head=b64url(textEncoder.encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
 const claim=b64url(textEncoder.encode(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3500})));
 const unsigned=head+"."+claim,signature=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,textEncoder.encode(unsigned));
 const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:unsigned+"."+b64url(value(signature))})});
 const data=await response.json();
 if(!response.ok||!data.access_token)fail(503,"Firebase server authentication failed.");
 cachedGoogleToken={token:data.access_token,until:Date.now()+(Math.min(Number(data.expires_in)||3600,3600)*1000)};
 return cachedGoogleToken.token;
}
async function database(env,method,path,body){
 const url=(env.FIREBASE_DATABASE_URL||DEFAULT_DB).replace(/\/$/,"")+"/"+path.split("/").map(encodeURIComponent).join("/")+".json";
 if(!url.startsWith("https://website-chat-80038-default-rtdb.firebaseio.com/"))fail(503,"Unexpected Firebase database host.");
 const token=await googleAccess(env);
 const res=await fetch(url,{method,headers:{"authorization":"Bearer "+token,...(body!==undefined?{"content-type":"application/json"}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 if(!res.ok)fail(502,"Firebase database update failed ("+res.status+").");
 return res.status===204?null:await res.json().catch(()=>null);
}
const uidValid=uid=>typeof uid==="string"&&/^[a-zA-Z0-9_-]{1,128}$/.test(uid);
async function setEntitlement(env,uid,source,{active,expiresAt,id,status}){
 if(!uidValid(uid))fail(400,"Invalid subscription account.");
 const exp=Math.max(0,Number(expiresAt)||0);
 const state={active:active===true&&exp>Date.now(),expiresAt:exp,updatedAt:Date.now(),status:String(status||"unknown").slice(0,40)};
 await database(env,"PUT","chatBillingEntitlements/"+uid+"/"+source,state);
 return state;
}
async function createCustomer(env,uid,email){
 const previous=await database(env,"GET","chatBillingPrivate/"+uid+"/stripeCustomerId");
 if(typeof previous==="string"&&/^cus_/.test(previous))return previous;
 const p={"metadata[firebase_uid]":uid};if(email)p.email=email;
 const customer=await stripe(env,"POST","/customers",p);
 if(!/^cus_/.test(customer.id||""))fail(502,"Stripe customer creation failed.");
 await database(env,"PUT","chatBillingPrivate/"+uid+"/stripeCustomerId",customer.id);
 return customer.id;
}
async function createCheckout(env,identity){
 if(!isStripeConfigured(env))fail(503,"Web checkout is not configured yet.");
 const existing=await database(env,"GET","chatBillingEntitlements/"+identity.uid);
 if(existing?.stripe?.active===true&&existing.stripe.expiresAt>Date.now())fail(409,"Chat+ is already active through Stripe; use Manage subscription.");
 const price=await stripe(env,"GET","/prices/"+encodeURIComponent(env.STRIPE_PRICE_ID));
 if(price.currency!=="aud"||price.unit_amount!==100||price.recurring?.interval!=="month"||price.type!=="recurring"||
    price.livemode===testMode(env))fail(503,"Stripe price must be AUD 1.00/month and match checkout mode.");
 const customer=await createCustomer(env,identity.uid,identity.email);
 const root=appUrl(env),session=await stripe(env,"POST","/checkout/sessions",{
  mode:"subscription",customer,client_reference_id:identity.uid,
  "line_items[0][price]":env.STRIPE_PRICE_ID,"line_items[0][quantity]":"1",
  "subscription_data[metadata][firebase_uid]":identity.uid,
  success_url:root+(root.includes("?")?"&":"?")+"chatPlus=success",
  cancel_url:root+(root.includes("?")?"&":"?")+"chatPlus=cancel"
 });
 if(!/^https:\/\/checkout\.stripe\.com\//.test(session.url||""))fail(502,"Invalid Stripe Checkout URL.");
 return {url:session.url,mode:testMode(env)?"test":"live"};
}
async function portal(env,identity){
 if(!isStripeConfigured(env))fail(503,"Subscription management is unavailable.");
 const customer=await database(env,"GET","chatBillingPrivate/"+identity.uid+"/stripeCustomerId");
 if(typeof customer!=="string"||!/^cus_/.test(customer))fail(404,"No Stripe subscription found for your account.");
 const result=await stripe(env,"POST","/billing_portal/sessions",{customer,return_url:appUrl(env)});
 if(!/^https:\/\/billing\.stripe\.com\//.test(result.url||""))fail(502,"Invalid Stripe billing portal URL.");
 return {url:result.url};
}
async function syncStripeSubscription(env,subscriptionId){
 if(!/^sub_[a-zA-Z0-9]+$/.test(subscriptionId||""))return;
 const sub=await stripe(env,"GET","/subscriptions/"+subscriptionId);
 if(Boolean(sub.livemode)===testMode(env))fail(400,"Stripe event mode did not match.");
 const uid=sub.metadata?.firebase_uid;
 if(!uidValid(uid))fail(400,"Subscription is not attached to a verified Firebase user.");
 // Re-fetch current subscription so reordered webhooks cannot replace newer status.
 const valid=sub.status==="active"||sub.status==="trialing";
 // Stripe Basil (2025+) moved subscription periods to individual items.
 const latestPeriod=Math.max(0,...(sub.items?.data||[]).map(item=>Number(item.current_period_end)||0));
 const expiresAt=(latestPeriod||Number(sub.current_period_end)||0)*1000;
 await setEntitlement(env,uid,"stripe",{active:valid,expiresAt,id:subscriptionId,status:sub.status});
}
async function stripeWebhook(req,env){
 if(!env.STRIPE_WEBHOOK_SECRET)fail(503,"Stripe webhook is not configured.");
 const raw=await req.text(),verified=await verifyHmac(env.STRIPE_WEBHOOK_SECRET,raw,req.headers.get("stripe-signature"));
 if(!verified)fail(400,"Stripe signature verification failed.");
 let event;try{event=JSON.parse(raw)}catch{fail(400,"Invalid Stripe event payload.")}
 if(Boolean(event.livemode)===testMode(env))fail(400,"Unexpected Stripe test/live mode.");
 const obj=event.data?.object||{};
 const subId=typeof obj.subscription==="string"?obj.subscription:
              obj.object==="subscription"?obj.id:null;
 if(subId&&/^sub_/.test(subId)){
  await syncStripeSubscription(env,subId);
 }
 return {received:true};
}
async function revenuecatSubscriber(env,uid){
 if(!env.REVENUECAT_SECRET_API_KEY)fail(503,"RevenueCat server API key missing.");
 const response=await fetch("https://api.revenuecat.com/v1/subscribers/"+encodeURIComponent(uid),{
  headers:{"authorization":"Bearer "+env.REVENUECAT_SECRET_API_KEY,"accept":"application/json"}});
 if(!response.ok)fail(502,"RevenueCat subscriber verification failed ("+response.status+").");
 return response.json();
}
async function revenuecatWebhook(req,env){
 if(!env.REVENUECAT_WEBHOOK_SECRET||!env.REVENUECAT_SECRET_API_KEY)fail(503,"RevenueCat server verification not configured.");
 const raw=await req.text(),verified=await verifyHmac(env.REVENUECAT_WEBHOOK_SECRET,raw,req.headers.get("X-RevenueCat-Webhook-Signature"));
 if(!verified)fail(401,"RevenueCat webhook signature invalid.");
 let payload;try{payload=JSON.parse(raw)}catch{fail(400,"Malformed RevenueCat event.")}
 const ev=payload.event||{},uid=ev.app_user_id;
 if(!uidValid(uid))fail(400,"RevenueCat event has no signed-in Firebase UID.");
 // Never grant entitlements from webhook claims alone; verify with RC's REST API.
 const subscriber=await revenuecatSubscriber(env,uid);
 const record=subscriber.subscriber?.entitlements?.[env.REVENUECAT_ENTITLEMENT_ID||"chat_plus"];
 const productId=String(env.REVENUECAT_IOS_PRODUCT_ID||"");
 const subscription=subscriber.subscriber?.subscriptions?.[productId];
 const expires=record?.expires_date?Date.parse(record.expires_date):0;
 const sandbox=String(ev.environment||"").toUpperCase()==="SANDBOX"||subscription?.is_sandbox===true;
 if(sandbox&&env.REVENUECAT_ALLOW_SANDBOX!=="true")return {received:true,sandboxIgnored:true};
 const active=!!productId&&record?.product_identifier===productId&&
   Number.isFinite(expires)&&expires>Date.now()&&subscription?.store==="app_store"&&
   !subscription?.refunded_at;
 await setEntitlement(env,uid,"apple",{active,expiresAt:Number.isFinite(expires)?expires:0,id:productId,status:active?"active":"expired"});
 return {received:true};
}
export default {
 async fetch(req,env){
  const url=new URL(req.url),headers=originHeaders(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  try{
   if(url.pathname==="/health"&&req.method==="GET")return json({ok:true,checkoutEnabled:isStripeConfigured(env),iosEnabled:!!(env.REVENUECAT_SECRET_API_KEY&&env.REVENUECAT_WEBHOOK_SECRET),stripeMode:testMode(env)?"test":"live"},200,headers);
   if(url.pathname==="/stripe-webhook"&&req.method==="POST")return json(await stripeWebhook(req,env));
   if(url.pathname==="/revenuecat-webhook"&&req.method==="POST")return json(await revenuecatWebhook(req,env));
   if(url.pathname!=="/checkout"&&url.pathname!=="/portal"&&url.pathname!=="/status")return json({error:"Not found"},404,headers);
   if(req.headers.get("origin")&&req.headers.get("origin")!==WEB_ORIGIN)fail(403,"Origin not permitted.");
   const identity=await verifyFirebaseToken(req);
   if(url.pathname==="/status"&&req.method==="GET"){
    const state=await database(env,"GET","chatBillingEntitlements/"+identity.uid);
    return json({stripe:state?.stripe||null,apple:state?.apple||null,checkoutEnabled:isStripeConfigured(env),stripeMode:testMode(env)?"test":"live"},200,headers);
   }
   if(req.method!=="POST")fail(405,"Method not allowed.");
   return json(url.pathname==="/checkout"?await createCheckout(env,identity):await portal(env,identity),200,headers);
  }catch(error){console.error("Billing request failed",url.pathname,String(error.message||error));return json({error:String(error.message||"Billing unavailable").slice(0,220)},Number(error.status)||500,headers);}
 }
};