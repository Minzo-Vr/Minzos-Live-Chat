import Stripe from "stripe";
import {jwtVerify,createRemoteJWKSet,importPKCS8,SignJWT} from "jose";

// Independent Cloudflare Worker: never share Discord bot secrets or routes.
// Firebase client tokens prove identity; only this Worker holds billing credentials.
const project="website-chat-80038";
const jwks=createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const headers={"content-type":"application/json","cache-control":"no-store"};
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{...headers,...extra}});
const origin="https://minzo-vr.github.io";
function cors(request){
 const o=request.headers.get("Origin");
 return o===origin?{"access-control-allow-origin":origin,"access-control-allow-headers":"authorization,content-type","access-control-allow-methods":"POST,OPTIONS","vary":"Origin"}:{};
}
function stripeClient(env){if(!env.STRIPE_SECRET_KEY)throw Error("Stripe test secret is not configured");return new Stripe(env.STRIPE_SECRET_KEY,{apiVersion:"2025-09-30.clover"});}
async function uidFromToken(request){
 const match=/^Bearer (.+)$/i.exec(request.headers.get("Authorization")||"");
 if(!match)throw Error("Sign in before purchasing Chat+");
 const {payload}=await jwtVerify(match[1],jwks,{issuer:"https://securetoken.google.com/"+project,audience:project});
 if(!payload.sub||typeof payload.sub!=="string")throw Error("Invalid Firebase user");
 return payload.sub;
}
async function googleAccessToken(env){
 if(!env.FIREBASE_SERVICE_ACCOUNT_EMAIL||!env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY)throw Error("Firebase service account not configured");
 const key=await importPKCS8(env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g,"\n"),"RS256");
 const now=Math.floor(Date.now()/1000);
 const jwt=await new SignJWT({scope:"https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email"})
  .setProtectedHeader({alg:"RS256",typ:"JWT"}).setIssuer(env.FIREBASE_SERVICE_ACCOUNT_EMAIL)
  .setSubject(env.FIREBASE_SERVICE_ACCOUNT_EMAIL).setAudience("https://oauth2.googleapis.com/token")
  .setIssuedAt(now).setExpirationTime(now+3600).sign(key);
 const form=new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt});
 const res=await fetch("https://oauth2.googleapis.com/token",{method:"POST",body:form});
 const data=await res.json();if(!res.ok||!data.access_token)throw Error("Google OAuth service authentication failed");
 return data.access_token;
}
function firebaseUrl(env,path){const base=(env.FIREBASE_DATABASE_URL||"https://website-chat-80038-default-rtdb.firebaseio.com").replace(/\/+$/,"");return base+"/"+path+".json";}
async function dbRequest(env,path,method="GET",body){
 const token=await googleAccessToken(env);
 const res=await fetch(firebaseUrl(env,path),{method,headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
 if(!res.ok)throw Error("Firebase billing database request failed ("+res.status+")");
 return res.json();
}
async function billingRecord(env,uid){return await dbRequest(env,"chatBilling/"+encodeURIComponent(uid))||{};}
async function patchBilling(env,uid,source,active,details={}){
 // Billing-owned Plus roles are tracked separately from manual role assignments.
 // Recompute both payment providers before revoking access.
 const current=await billingRecord(env,uid);
 const next={...current,[source]:{...details,active:!!active,checkedAt:Date.now()}};
 await dbRequest(env,"chatBilling/"+encodeURIComponent(uid),"PUT",next);
 const entitled=!!(next.stripe?.active||next.apple?.active);
 const rolePath="chatRoles/"+encodeURIComponent(uid);
 const raw=await dbRequest(env,rolePath);
 const roles=raw&&typeof raw==="object"?{...raw}:typeof raw==="string"?{[raw]:true}:{};
 if(entitled){
   if(roles.plus!==true){
     // If the user had a manually assigned Plus role, don't claim ownership.
     if(raw==="plus"){next.ownedPlus=false;}
     else{roles.plus=true;next.ownedPlus=true;await dbRequest(env,rolePath,"PUT",roles);}
   }
 }else if(next.ownedPlus===true){
   delete roles.plus;
   await dbRequest(env,rolePath,"PUT",Object.keys(roles).length?roles:null);
   next.ownedPlus=false;
 }
 await dbRequest(env,"chatBilling/"+encodeURIComponent(uid),"PUT",next);
 return entitled;
}
async function getSubscriptionState(stripe,subscriptionId,expectedUid){
 const sub=await stripe.subscriptions.retrieve(subscriptionId);
 const uid=sub.metadata?.firebaseUid;
 if(!uid||uid!==expectedUid)throw Error("Subscription owner mismatch");
 return {active:sub.status==="active"||sub.status==="trialing",id:sub.id,status:sub.status,customer:typeof sub.customer==="string"?sub.customer:sub.customer.id};
}
async function handleStripeWebhook(request,env){
 if(!env.STRIPE_WEBHOOK_SECRET)throw Error("Stripe webhook secret not configured");
 const stripe=stripeClient(env);
 const event=await stripe.webhooks.constructEventAsync(await request.text(),request.headers.get("stripe-signature"),env.STRIPE_WEBHOOK_SECRET);
 if(event.livemode!==false)throw Error("Live Stripe events are disabled in this test setup");
 if(!["checkout.session.completed","customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","invoice.paid","invoice.payment_failed"].includes(event.type))return json({received:true});
 const obj=event.data.object;
 let subscriptionId=typeof obj.subscription==="string"?obj.subscription:obj.subscription?.id;
 if(event.type.startsWith("customer.subscription."))subscriptionId=obj.id;
 if(!subscriptionId&&obj.parent?.subscription_details?.subscription)subscriptionId=obj.parent.subscription_details.subscription;
 if(!subscriptionId)return json({received:true});
 const sub=await stripe.subscriptions.retrieve(subscriptionId);
 const uid=sub.metadata?.firebaseUid;
 if(!uid)return json({received:true});
 const verified=await getSubscriptionState(stripe,subscriptionId,uid);
 // Never let an unrelated subscription change the user's entitlement.
 const existing=await billingRecord(env,uid);
 if(existing.stripe?.id&&existing.stripe.id!==subscriptionId&&existing.stripe.active)return json({received:true});
 await patchBilling(env,uid,"stripe",verified.active,{id:verified.id,status:verified.status,customer:verified.customer});
 return json({received:true});
}
async function handleAppleWebhook(request,env){
 const authorization=request.headers.get("Authorization");
 if(!env.REVENUECAT_WEBHOOK_AUTH||authorization!=="Bearer "+env.REVENUECAT_WEBHOOK_AUTH)return json({error:"Unauthorized"},401);
 if(!env.REVENUECAT_SECRET_API_KEY)throw Error("RevenueCat verification API key not configured");
 const payload=await request.json();
 const event=payload?.event||{};
 const uid=event.app_user_id;
 if(typeof uid!=="string"||!/^[A-Za-z0-9_-]{5,128}$/.test(uid))return json({received:true});
 // Do not grant access based solely on a webhook claim. Query RevenueCat's
 // server API for the current entitlement and its verified expiry.
 const response=await fetch("https://api.revenuecat.com/v1/subscribers/"+encodeURIComponent(uid),{headers:{Authorization:"Bearer "+env.REVENUECAT_SECRET_API_KEY}});
 if(!response.ok)throw Error("RevenueCat subscriber verification failed");
 const subscriber=(await response.json()).subscriber;
 const entitlement=subscriber?.entitlements?.chat_plus;
 const expires=entitlement?.expires_date?Date.parse(entitlement.expires_date):0;
 const active=!!entitlement&&(expires===0||expires>Date.now());
 await patchBilling(env,uid,"apple",active,{status:active?"active":"expired",expiresAt:expires||null});
 return json({received:true});
}
async function handleCheckout(request,env){
 const uid=await uidFromToken(request);
 const stripe=stripeClient(env);
 if(!env.STRIPE_PRICE_ID||!/^price_/.test(env.STRIPE_PRICE_ID))throw Error("Stripe price not configured");
 const price=await stripe.prices.retrieve(env.STRIPE_PRICE_ID);
 if(price.currency!=="aud"||price.unit_amount!==100||price.recurring?.interval!=="month"||!price.active)throw Error("Chat+ test price must be AUD 1/month");
 const record=await billingRecord(env,uid);
 if(record.stripe?.active)return json({error:"Chat+ already subscribed. Use Manage billing."},409);
 const session=await stripe.checkout.sessions.create({
   mode:"subscription",line_items:[{price:price.id,quantity:1}],
   client_reference_id:uid,
   customer:record.stripe?.customer||undefined,
   subscription_data:{metadata:{firebaseUid:uid}},
   success_url:origin+"/Minzos-Live-Chat/?chatplus=success",
   cancel_url:origin+"/Minzos-Live-Chat/?chatplus=cancel",
   metadata:{firebaseUid:uid}
 });
 return json({url:session.url});
}
async function handlePortal(request,env){
 const uid=await uidFromToken(request),record=await billingRecord(env,uid);
 if(!record.stripe?.customer)return json({error:"No Stripe subscription is linked to this account"},404);
 const stripe=stripeClient(env);
 const session=await stripe.billingPortal.sessions.create({customer:record.stripe.customer,return_url:origin+"/Minzos-Live-Chat/"});
 return json({url:session.url});
}
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname,extra=cors(request);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:extra});
  if(path==="/health")return json({ok:true,mode:"test",configured:!!(env.STRIPE_SECRET_KEY&&env.STRIPE_PRICE_ID&&env.STRIPE_WEBHOOK_SECRET&&env.FIREBASE_SERVICE_ACCOUNT_EMAIL&&env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY)},200,extra);
  try{
   if(request.method!=="POST")return json({error:"Not found"},404,extra);
   let result;
   if(path==="/stripe/webhook")result=await handleStripeWebhook(request,env);
   else if(path==="/apple/webhook")result=await handleAppleWebhook(request,env);
   else if(path==="/checkout")result=await handleCheckout(request,env);
   else if(path==="/portal")result=await handlePortal(request,env);
   else result=json({error:"Not found"},404);
   const h=new Headers(result.headers);for(const [k,v] of Object.entries(extra))h.set(k,v);
   return new Response(result.body,{status:result.status,headers:h});
  }catch(error){console.error("Billing request failed",path,error?.message);return json({error:"Billing unavailable. Please try again later."},500,extra);}
 }
};
