/* Community Hub website availability switches.
 * Uses the free Firebase Realtime Database, not Cloud Functions.
 * Changes are admin-authorized by RTDB rules, not these browser controls.
 * GitHub Pages cannot make public HTML files private or block third-party sites.
 */
import {initializeApp,getApps} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {getDatabase,ref,onValue,set,update,push,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

(()=>{
 "use strict";
 const $=id=>document.getElementById(id);
 const PATH="hubSiteAvailability";
 const RETURN_URL="./?interface=selection";
 const SITE_ITEMS=[
  ["chats","Community Chat","Chat messages, rooms and friends","💬"],
  ["admin-ai","Admin AI","Admin-only AI workspace","🤖"],
  ["shapes-colours","Shapes & Colours","3D editor and building tools","🎨"],
  ["minzify","Minzify","Music search and playlists","🎧"],
  ["minz-apps","Minz Apps","Apps and download catalogue","📱"],
  ["update-centre","Update Centre","Updates and releases","📦"],
  ["game-hub","Game Hub","Browser games and game chat","🎮"],
  ["community-browser","Community Browser","Built-in browser sidebar","🌐"]
 ];
 const GAME_ITEMS=[
  ["2048","🔢"],["Cookie Clicker","🍪"],["Google Dino","🦖"],
  ["Google Snake","🐍"],["Retro Bowl","🏈"],["Slope","⚡"],
  ["Run 3","🚀"],["Minesweeper","💣"],["Blackjack","🃏"],
  ["Moto X3M","🏍️"],["Block Blast","🧩"],["Gorilla Tag","🦍"],
  ["Twerk Race 3D","🏃"]
 ];
 function keyForGame(name){
  const slug=String(name||"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  return "game-"+slug;
 }
 const entries=[...SITE_ITEMS.map(([key,name,description,icon])=>({key,name,description,icon,category:"Websites & apps"})),
  ...GAME_ITEMS.map(([name,icon])=>({key:keyForGame(name),name,icon,description:"Game Hub game",category:"Individual games"}))];
 const ALL_KEYS=new Set(entries.map(item=>item.key));
 const KEY_FOR_BUTTON={
  gatewayOpenChat:"chats",gatewayOpenAI:"admin-ai",gatewayOpenShapes:"shapes-colours",
  gatewayOpenMinzify:"minzify",gatewayOpenMinzSign:"minz-apps",gatewayOpenUpdates:"update-centre",
  gatewayOpenGames:"game-hub",gameHubToggle:"game-hub",browserSidebarToggle:"community-browser"
 };
 const pageFile=(location.pathname.split("/").pop()||"index.html").toLowerCase();
 const PAGE_KEYS={
  "minzify.html":"minzify","minzify-spotify.html":"minzify",
  "minzify-youtube.html":"minzify","shapes-colours.html":"shapes-colours",
  "minzsign.html":"minz-apps","update-centre.html":"update-centre"
 };
 const currentPage=PAGE_KEYS[pageFile]||null;
 let settings={},auth=null,db=null,account=null,isAdmin=false,roleOff=null,ready=false;
 let adminSection=null,adminButton=null,adminRows=new Map(),adminStatus=null;
 let disableAllButton=null,enableAllButton=null,bulkPending=false;
 let pending=new Set(),latestAuth=0;

 // The PIN is only checked after the Admin role has been verified by Firebase.
 // A PIN in public GitHub Pages JavaScript is a convenience lock, not security.
 // Store a one-way hash instead of the PIN itself.
 const PIN_DIGEST="115609c5335582ade0da8f19a7e778797a2247532c386aae158d5eb7197dacae";
 const PIN_CONTEXT="community-hub-maintenance-unlock:v1:";
 const UNLOCK_CACHE="community-hub-admin-unlocks-v1";
 const UNLOCK_MS=15*60*1000;
 const unlocked=new Map();
 let pinModal=null,pinInput=null,pinStatus=null,pinResolve=null,pinKey=null;
 function rememberUnlock(key){
  if(!account?.uid||!isAdmin)return;
  const expires=Date.now()+UNLOCK_MS;
  unlocked.set(key,{uid:account.uid,expires});
  try{
   const data={uid:account.uid,expires:{}};
   for(const [k,record] of unlocked){
    if(record.uid===account.uid&&record.expires>Date.now())data.expires[k]=record.expires;
   }
   sessionStorage.setItem(UNLOCK_CACHE,JSON.stringify(data));
  }catch{}
 }
 function loadUnlocks(user){
  unlocked.clear();
  if(!user)return;
  try{
   const data=JSON.parse(sessionStorage.getItem(UNLOCK_CACHE)||"null");
   if(data?.uid!==user.uid)return;
   for(const [key,expires] of Object.entries(data.expires||{})){
    if(ALL_KEYS.has(key)&&typeof expires==="number"&&expires>Date.now()&&expires<Date.now()+UNLOCK_MS+60000){
     unlocked.set(key,{uid:user.uid,expires});
    }
   }
  }catch{}
 }
 function clearUnlock(key){
  unlocked.delete(key);
  try{
   const data=JSON.parse(sessionStorage.getItem(UNLOCK_CACHE)||"null");
   if(data?.uid===account?.uid&&data.expires){
    delete data.expires[key];
    sessionStorage.setItem(UNLOCK_CACHE,JSON.stringify(data));
   }
  }catch{}
 }
 function isUnlocked(key){
  const record=unlocked.get(key);
  if(!isAdmin||!account||record?.uid!==account.uid)return false;
  if(record.expires<=Date.now()){clearUnlock(key);return false}
  return true;
 }
 async function verifyPin(pin){
  if(!crypto?.subtle||typeof TextEncoder==="undefined")return false;
  const bytes=new TextEncoder().encode(PIN_CONTEXT+String(pin));
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  const hex=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,"0")).join("");
  return hex===PIN_DIGEST;
 }
 function closePin(allowed=false){
  const resolve=pinResolve;
  pinResolve=null;pinKey=null;
  if(pinModal)pinModal.hidden=true;
  if(pinInput)pinInput.value="";
  if(resolve)resolve(allowed);
 }
 function ensurePinModal(){
  if(pinModal)return;
  pinModal=n("div");pinModal.id="hubAdminPinModal";pinModal.hidden=true;
  pinModal.setAttribute("role","dialog");pinModal.setAttribute("aria-modal","true");
  pinModal.setAttribute("aria-labelledby","hubAdminPinTitle");
  const card=n("div","hub-admin-pin-card");
  const title=n("h2",null,"🔐 Admin unlock required");title.id="hubAdminPinTitle";
  const explanation=n("p");explanation.id="hubAdminPinDescription";
  const form=n("form");form.autocomplete="off";
  const label=n("label",null,"4-digit admin PIN");
  pinInput=n("input");pinInput.type="password";pinInput.inputMode="numeric";
  pinInput.name="hubAdminPin";pinInput.required=true;pinInput.minLength=4;pinInput.maxLength=4;
  pinInput.pattern="[0-9]{4}";pinInput.autocomplete="off";
  pinInput.setAttribute("aria-describedby","hubAdminPinStatus");
  label.append(pinInput);form.append(label);
  pinStatus=n("p","hub-admin-pin-status");pinStatus.id="hubAdminPinStatus";pinStatus.setAttribute("role","status");
  const actions=n("div","hub-admin-pin-actions");
  const cancel=n("button",null,"Cancel");cancel.type="button";
  const unlock=n("button",null,"Unlock app");unlock.type="submit";
  actions.append(cancel,unlock);form.append(pinStatus,actions);
  card.append(title,explanation,form);pinModal.append(card);document.body.append(pinModal);
  cancel.addEventListener("click",()=>closePin(false));
  pinModal.addEventListener("click",event=>{if(event.target===pinModal)closePin(false)});
  pinModal.addEventListener("keydown",event=>{
   if(event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();closePin(false)}
   if(event.key==="Tab"){
    const tabs=[pinInput,cancel,unlock],idx=tabs.indexOf(document.activeElement);
    if(event.shiftKey&&idx===0){event.preventDefault();tabs.at(-1).focus()}
    else if(!event.shiftKey&&idx===tabs.length-1){event.preventDefault();tabs[0].focus()}
   }
  },true);
  form.addEventListener("submit",async event=>{
   event.preventDefault();
   const key=pinKey,owner=account?.uid;
   if(!key||!isAdmin||!owner){closePin(false);return}
   const pin=pinInput.value;unlock.disabled=true;
   pinStatus.textContent="Checking PIN…";
   try{
    if(await verifyPin(pin)&&pinKey===key&&account?.uid===owner&&isAdmin){
     rememberUnlock(key);
     closePin(true);refresh();
    }else{
     pinInput.value="";pinStatus.textContent="Incorrect PIN. Try again.";
     pinInput.focus();
    }
   }catch(error){
    pinStatus.textContent="PIN check unavailable in this browser.";
    console.warn("PIN verification unavailable",error?.message||error);
   }finally{unlock.disabled=false}
  });
 }
 function requestAccess(key){
  if(!disabled(key)||isUnlocked(key))return Promise.resolve(true);
  if(!isAdmin||!account){unavailableToast(key);return Promise.resolve(false)}
  ensurePinModal();
  if(pinResolve)closePin(false);
  pinKey=key;
  const name=entries.find(item=>item.key===key)?.name||"this app";
  $("hubAdminPinDescription").textContent=name+" is disabled. Enter the Admin PIN to unlock only this experience for 15 minutes in this browser tab.";
  pinStatus.textContent="";
  pinInput.value="";
  pinModal.hidden=false;
  pinInput.focus();
  return new Promise(resolve=>{pinResolve=resolve});
 }

 const n=(tag,cls,text)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text!==undefined)el.textContent=text;
  return el;
 };
 function disabled(key){return ALL_KEYS.has(key)&&settings[key]===true;}
 function canUse(key){return !disabled(key)||isUnlocked(key);}
 const api={
  isDisabled:disabled,
  canUse,
  requestAccess,
  isAdmin:()=>isAdmin,
  keyForGame,
  openAdmin:()=>openAdminPanel(),
  refreshUI:()=>renderLaunchers(),
  available:()=>ready
 };
 window.HubSiteControls=api;
 function notifyChanged(){
  window.dispatchEvent(new CustomEvent("community-hub-availability-change",{
   detail:{disabledKeys:Object.keys(settings).filter(key=>settings[key]===true),admin:isAdmin,ready}
  }));
 }
 function renderAdmin(){
  if(!adminSection)return;
  const allowed=!!account&&isAdmin;
  adminButton.hidden=!allowed;
  if(!allowed){
   adminSection.open=false;
   adminSection.hidden=true;
   adminButton.setAttribute("aria-expanded","false");
   return;
  }
  // The inner settings panel is not a separate visible card until opened.
  if(!adminSection.open)adminSection.hidden=true;
  for(const [key,refs] of adminRows){
   refs.input.checked=disabled(key);
   refs.input.disabled=bulkPending||pending.has(key)||!ready;
   refs.status.textContent=disabled(key)?"Disabled":"Enabled";
  }
  if(disableAllButton)disableAllButton.disabled=!ready||bulkPending||pending.size>0||entries.every(item=>disabled(item.key));
  if(enableAllButton)enableAllButton.disabled=!ready||bulkPending||pending.size>0||entries.every(item=>!disabled(item.key));
  if(adminStatus&&!ready)adminStatus.textContent="Connecting to website settings…";
 }
 function renderLaunchers(){
  for(const [buttonId,key] of Object.entries(KEY_FOR_BUTTON)){
   const button=$(buttonId);
   if(!button)continue;
   const locked=disabled(key)&&!canUse(key);
   if(button.tagName==="BUTTON")button.disabled=locked&&!isAdmin;
   else button.setAttribute("aria-disabled",String(locked&&!isAdmin));
   const card=button.closest(".store-card");
   if(!card)continue;
   card.classList.toggle("hub-app-disabled",locked);
   card.classList.toggle("hub-pin-available",locked&&isAdmin);
   if(button.classList.contains("store-launch")){
    button.textContent=locked&&isAdmin?"🔐 Unlock":"Open";
    if(locked&&isAdmin)button.setAttribute("aria-label","Unlock "+(entries.find(item=>item.key===key)?.name||"app")+" with Admin PIN");
    else button.removeAttribute("aria-label");
   }
   let state=card.querySelector(".hub-app-state");
   if(!state){state=n("div","hub-app-state","Disabled by admin");state.hidden=true;card.querySelector(".store-card-copy")?.append(state)}
   state.hidden=!locked;
   if(locked&&isAdmin)state.textContent="🔐 PIN required";
   else state.textContent="Disabled by admin";
   if(locked&&!isAdmin&&button.tagName!=="BUTTON")button.setAttribute("tabindex","-1");
   else button.removeAttribute("tabindex");
  }
  for(const card of document.querySelectorAll(".store-game-card")){
   const key=card.dataset.hubGame;
   if(!key)continue;
   const locked=!canUse("game-hub")||!canUse(key);
   card.classList.toggle("hub-app-disabled",locked);
   card.classList.toggle("hub-pin-available",locked&&isAdmin);
   const play=card.querySelector(".store-game-play");
   if(play){
    play.disabled=locked&&!isAdmin;
    play.textContent=locked&&isAdmin?"🔐 Unlock":"Play";
   }
   const preview=card.querySelector(".store-game-preview");
   if(preview)preview.setAttribute("aria-label","Preview "+(card.dataset.hubGameName||"game")+(locked?" (disabled)":""));
  }
 }
 function unavailableToast(key){
  const name=entries.find(entry=>entry.key===key)?.name||"This experience";
  window.alert(name+" has been disabled by a Community Hub administrator.");
 }
 function enforceActiveGame(){
  const browser=$("browserSidebar");
  if(!canUse("community-browser")&&browser&&!browser.hidden)$("browserSidebarClose")?.click();
  const gameHub=$("communityGameHub");
  if(!gameHub||gameHub.hidden)return;
  if(!canUse("game-hub")){ $("gameClose")?.click();return; }
  const frame=$("gamePlayFrame");
  if(frame&&!frame.hidden&&frame.dataset.hubGame&&!canUse(frame.dataset.hubGame)){
   $("gameBack")?.click();
   unavailableToast(frame.dataset.hubGame);
  }
 }
 function createPageBlock(){
  let overlay=$("hubSiteDownOverlay");
  if(overlay)return overlay;
  overlay=n("section");overlay.id="hubSiteDownOverlay";overlay.hidden=true;
  overlay.setAttribute("role","status");overlay.setAttribute("aria-live","polite");
  const card=n("div","hub-site-down-card");
  card.append(n("div",null,"🔒"),n("strong",null,"Temporarily unavailable"));
  const message=n("p");message.id="hubSiteDownText";message.textContent="This Community Hub app has been disabled by an administrator.";
  const link=n("a",null,"← Back to Community Hub");link.href=RETURN_URL;
  const unlockButton=n("button",null,"🔐 Unlock with Admin PIN");
  unlockButton.id="hubSiteDownUnlock";unlockButton.type="button";unlockButton.hidden=true;
  unlockButton.addEventListener("click",()=>{if(currentPage)void requestAccess(currentPage)});
  card.append(message,unlockButton,link);overlay.append(card);
  document.body.append(overlay);return overlay;
 }
 function enforcePage(){
  if(currentPage){
   const overlay=createPageBlock();
   const locked=!canUse(currentPage);
   overlay.hidden=!locked;
   const button=$("hubSiteDownUnlock");
   if(button)button.hidden=!locked||!isAdmin;
   if(locked) document.getElementById("hubSiteDownText").textContent=
    (entries.find(x=>x.key===currentPage)?.name||"This site")+" is temporarily disabled by a Community Hub administrator.";
   return;
  }
  // index.html doubles as Community Chat and the always-available Hub launcher.
  // A disabled chat must never remove the My Account admin recovery path.
  if(!canUse("chats")&&$("interfaceGateway")?.hidden){
    if(typeof window.communityShowLoader==="function")window.communityShowLoader();
    else $("backToLoader")?.click();
  }
 }
 function refresh(){
  renderAdmin();renderLaunchers();enforceActiveGame();enforcePage();notifyChanged();
 }
 function addAdminUI(){
  const signed=$("hubSignedIn");
  if(!signed||adminSection)return;
  adminButton=n("button");adminButton.id="hubSiteAdminOpen";adminButton.type="button";
  adminButton.textContent="🛠 Admin Website Controls";adminButton.hidden=true;
  adminButton.setAttribute("aria-controls","hubSiteAdminPanel");
  adminButton.setAttribute("aria-expanded","false");
  adminSection=n("details");adminSection.id="hubSiteAdminPanel";adminSection.hidden=true;
  const summary=n("summary",null,"🌐 Website & Game Controls");
  const body=n("div","hub-site-admin-body");
  body.append(n("p",null,"Turn Hub apps and games on or off for everyone, including admins. Opening a disabled experience requires verified Admin sign-in and the separate 4-digit PIN. My Account and these controls remain available for recovery."));
  adminStatus=n("div");adminStatus.id="hubSiteAdminStatus";adminStatus.setAttribute("role","status");
  body.append(adminStatus);
  // Batch controls go above the individual blocked-app switches.
  const bulkActions=n("div","hub-site-admin-bulk-actions");
  bulkActions.style.cssText="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;";
  disableAllButton=n("button",null,"⛔ Disable All");
  disableAllButton.type="button";disableAllButton.disabled=true;
  enableAllButton=n("button",null,"✅ Enable All");
  enableAllButton.type="button";enableAllButton.disabled=true;
  bulkActions.append(disableAllButton,enableAllButton);body.append(bulkActions);
  body.append(n("p","hub-site-admin-help","Disable All blocks every listed app and game, including for admins. My Account and Admin Website Controls remain accessible so you can restore access."));
  async function changeAll(disable){
   if(!account||!isAdmin||!db||!ready||bulkPending||pending.size)return;
   const targets=entries.filter(item=>disabled(item.key)!==disable);
   if(!targets.length)return;
   const question=disable
    ?"Disable ALL "+entries.length+" apps and games for everyone, including admins? Admin PIN unlocks are still required for disabled experiences."
    :"Enable ALL apps and games for everyone?";
   if(!window.confirm(question))return;
   const actor=account;
   bulkPending=true;renderAdmin();
   adminStatus.textContent=disable?"Disabling all apps and games…":"Enabling all apps and games…";
   try{
    await update(ref(db,PATH),Object.fromEntries(targets.map(item=>[item.key,disable])));
    void push(ref(db,"chatActivityLog"),{
     uid:actor.uid,actorName:String(actor.displayName||"Admin").slice(0,60),
     action:"website_availability",detail:disable?"all=disabled":"all=enabled",
     at:serverTimestamp()
    }).catch(()=>{});
    adminStatus.textContent=disable
     ?"All apps and games disabled for everyone. My Account and admin controls remain accessible."
     :"All apps and games enabled for everyone.";
   }catch(error){
    adminStatus.textContent="Bulk change failed: "+String(error?.code||error?.message||"Check Firebase rules.").slice(0,130);
   }finally{
    bulkPending=false;renderAdmin();
   }
  }
  disableAllButton.addEventListener("click",()=>void changeAll(true));
  enableAllButton.addEventListener("click",()=>void changeAll(false));
  let lastCategory="";
  for(const item of entries){
   if(item.category!==lastCategory){lastCategory=item.category;body.append(n("h3",null,lastCategory))}
   const row=n("div","hub-site-admin-row");
   const info=n("div");info.append(n("strong",null,item.icon+" "+item.name),n("small",null,item.description));
   const label=n("label","hub-site-admin-switch");
   const input=n("input");input.type="checkbox";input.disabled=true;
   input.setAttribute("aria-label","Disable "+item.name);
   const caption=n("span",null,"Disable");
   const state=n("small",null,"Enabled");
   label.append(input,caption);row.append(info,label,state);body.append(row);
   adminRows.set(item.key,{input,status:state});
   input.addEventListener("change",async()=>{
    if(!account||!isAdmin||!db||bulkPending){input.checked=disabled(item.key);return}
    const disable=input.checked;
    pending.add(item.key);renderAdmin();
    adminStatus.textContent=(disable?"Disabling ":"Enabling ")+item.name+"…";
    try{
     await set(ref(db,PATH+"/"+item.key),disable);
     // Audit is best-effort; the database rule itself verifies Admin access.
     void push(ref(db,"chatActivityLog"),{
      uid:account.uid,actorName:String(account.displayName||"Admin").slice(0,60),
      action:"website_availability",detail:item.key+"="+(disable?"disabled":"enabled"),
      at:serverTimestamp()
     }).catch(()=>{});
     adminStatus.textContent=item.name+" "+(disable?"disabled for everyone, including admins":"enabled for everyone")+".";
    }catch(error){
     input.checked=disabled(item.key);
     adminStatus.textContent="Change failed: "+String(error?.code||error?.message||"Check Firebase rules.").slice(0,130);
    }finally{
     pending.delete(item.key);renderAdmin();
    }
   });
  }
  body.append(n("p","hub-site-admin-help","Admin unlocks last 15 minutes per experience in this tab. These are interface restrictions only: public GitHub Pages files and unrelated websites remain accessible; a short browser PIN is not tamper-proof security."));
  adminSection.append(summary,body);
  signed.append(adminButton,adminSection);
  adminButton.addEventListener("click",()=>openAdminPanel(true));
  adminSection.addEventListener("toggle",()=>{
   const visible=adminSection.open&&!!account&&isAdmin;
   adminSection.hidden=!visible;
   adminButton.setAttribute("aria-expanded",String(visible));
  });
  const gameTop=$("communityGameHub")?.querySelector(".game-top");
  if(gameTop&&!$("gameHubMyAccount")){
   const accountButton=n("button");accountButton.id="gameHubMyAccount";accountButton.type="button";accountButton.textContent="👤 My Account";
   accountButton.addEventListener("click",()=>{$("gatewayAccountButton")?.click()});
   const adminGameButton=n("button");adminGameButton.id="gameHubAdminOpen";adminGameButton.type="button";
   adminGameButton.textContent="🛠 Admin";adminGameButton.hidden=true;
   adminGameButton.addEventListener("click",()=>openAdminPanel());
   gameTop.insertBefore(accountButton,$("gameClose"));
   gameTop.insertBefore(adminGameButton,$("gameClose"));
  }
  renderAdmin();
 }
 function openAdminPanel(toggle=false){
  if(!account||!isAdmin||!adminSection)return;
  if(toggle&&adminSection.open&&!adminSection.hidden){
   adminSection.open=false;
   adminSection.hidden=true;
   adminButton.setAttribute("aria-expanded","false");
   adminButton.focus();
   return;
  }
  const modal=$("hubAccountModal");
  if(modal?.hidden)$("gatewayAccountButton")?.click();
  adminSection.hidden=false;
  adminSection.open=true;
  adminButton.setAttribute("aria-expanded","true");
  adminSection.scrollIntoView({block:"nearest"});
  adminSection.querySelector("summary")?.focus();
 }
 function roleListenerFor(user){
  if(roleOff){roleOff();roleOff=null}
  isAdmin=false;renderAdmin();
  if(!user){refresh();return}
  const request=++latestAuth;
  user.getIdTokenResult().then(result=>{
   if(request!==latestAuth||account?.uid!==user.uid)return;
   const claim=result.claims?.admin===true;
   isAdmin=claim;
   refresh();
   roleOff=onValue(ref(db,"chatRoles/"+user.uid),snapshot=>{
    if(request!==latestAuth||account?.uid!==user.uid)return;
    const value=snapshot.val();
    isAdmin=claim||value==="admin"||value?.admin===true;
    refresh();
   },error=>{
    console.warn("Admin role status not available:",error.code||error.message);
    isAdmin=claim;refresh();
   });
  }).catch(error=>{console.warn("Admin token verification unavailable:",error.code||error.message);refresh()});
 }
 function guardDirectLaunch(event){
  const el=event.target.closest?.("[id]");
  if(!el)return;
  const key=KEY_FOR_BUTTON[el.id];
  if(key&&!canUse(key)){
   event.preventDefault();event.stopImmediatePropagation();
   if(isAdmin)void requestAccess(key).then(ok=>{if(ok&&el.isConnected)el.click()});
   else unavailableToast(key);
  }
 }
 document.addEventListener("click",guardDirectLaunch,true);
 window.addEventListener("community-hub-availability-change",()=>renderLaunchers());
 // Keep the game grid in sync when its current search rerenders cards.
 document.addEventListener("click",event=>{
  if(event.target.closest?.("#gameHubToggle,#gameBack,#gatewayOpenGames"))setTimeout(renderLaunchers,0);
 },false);
 const search=$("gameSearch");search?.addEventListener("input",()=>setTimeout(renderLaunchers,0));
 async function init(){
  addAdminUI();
  const config={
   apiKey:"AIzaSyB4wOgGUTR-fgweHtsJiK9XyykU_PND0GE",
   authDomain:"website-chat-80038.firebaseapp.com",
   databaseURL:"https://website-chat-80038-default-rtdb.firebaseio.com/",
   projectId:"website-chat-80038",
   appId:"1:42470201717:web:890e9ebf1f0865c8ea9b3c"
  };
  const app=getApps().find(a=>a.name==="[DEFAULT]")||initializeApp(config);
  auth=getAuth(app);db=getDatabase(app);
  onAuthStateChanged(auth,user=>{
   latestAuth++;account=user;
   if(pinResolve)closePin(false);
   loadUnlocks(user);
   if(roleOff){roleOff();roleOff=null}
   roleListenerFor(user);
   const gameAdmin=$("gameHubAdminOpen");
   if(gameAdmin)gameAdmin.hidden=true;
  });
  onValue(ref(db,PATH),snapshot=>{
   const previous=settings;
   settings=snapshot.val()||{};
   if(ready)for(const key of ALL_KEYS){
    if((previous[key]===true)!==(settings[key]===true))clearUnlock(key);
   }
   ready=true;refresh();
  },error=>{
   console.warn("Website availability rules unavailable:",error.code||error.message);
   settings={};ready=false;refresh();
   if(adminStatus)adminStatus.textContent="Website switches unavailable. Publish the updated Firebase rules first.";
  });
  // Update Game Hub admin entry whenever an account's admin role changes.
  window.addEventListener("community-hub-availability-change",()=>{
   const btn=$("gameHubAdminOpen");if(btn)btn.hidden=!account||!isAdmin;
  });
  refresh();
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>void init(),{once:true});
 else void init();
})();
