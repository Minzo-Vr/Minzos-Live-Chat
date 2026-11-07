/* Native-only Apple App Store Chat+ subscriptions.
 * RevenueCat public SDK key is injected at build time (never a secret).
 * No Stripe web checkout is opened inside the native iOS app.
 * Entitlements are granted only by a trusted RevenueCat webhook backend.
 */
(()=>{
 "use strict";
 if(!window.Capacitor?.isNativePlatform?.()||window.Capacitor.getPlatform?.()!=="ios")return;
 const config=window.COMMUNITY_CHAT_BILLING||{};
 const state={ready:false,uid:null};
 const getSDK=()=>window.Capacitor?.Plugins?.Purchases;
 function errorMessage(error){return String(error?.message||error||"Purchase unavailable").slice(0,220)}
 async function configure(uid){
   const sdk=getSDK(),key=config.revenueCatAppleApiKey;
   if(!sdk||!key)throw Error("Apple in-app purchases are not configured in this build.");
   if(!state.ready){
     await sdk.configure({apiKey:key,appUserID:uid});
     state.ready=true;state.uid=uid;
   }else if(state.uid!==uid){
     await sdk.logIn({appUserID:uid});state.uid=uid;
   }
   return sdk;
 }
 window.CommunityAppleBilling={
   isNativeApple:true,
   async purchase(uid){
     const sdk=await configure(uid);
     const offerings=await sdk.getOfferings();
     const offering=offerings?.current;
     const pack=offering?.availablePackages?.[0];
     if(!pack)throw Error("No Chat+ subscription is available from the App Store.");
     const result=await sdk.purchasePackage({aPackage:pack});
     return {purchased:!!result?.customerInfo,customerInfo:result?.customerInfo};
   },
   async restore(uid){
     const sdk=await configure(uid);
     const result=await sdk.restorePurchases();
     return {restored:!!result?.customerInfo,customerInfo:result?.customerInfo};
   },
   async status(uid){
     const sdk=await configure(uid);
     return await sdk.getCustomerInfo();
   },
   errorMessage
 };
})();
