/* Community Hub website availability switches.
 * Uses the free Firebase Realtime Database, not Cloud Functions.
 * Changes are admin-authorized by RTDB rules, not these browser controls.
 * GitHub Pages cannot make public HTML files private or block third-party sites.
 */
import {initializeApp,getApps} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {getDatabase,ref,onValue,set,push,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

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
  ["game-hub","Game Hub","Browser games and game chat","🎮"]
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
  gatewayOpenGames:"game-hub",gameHubToggle:"game-hub"
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
 let pending=new Set(),latestAuth=0;
 const n=(tag,cls,text)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text!==undefined)el.textContent=text;
  return el;
 };
 function disabled(key){return ALL_KEYS.has(key)&&settings[key]===true;}
 function canUse(key){return isAdmin||!disabled(key);}
 const api={
  isDisabled:disabled,
  canUse,
  isAdmin:()=>isAdmin,
  keyForGame,
  openAdmin:()=>openAdminPanel(),
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
  adminButton.hidden=!account||!isAdmin;
  adminSection.hidden=!account||!isAdmin;
  if(!isAdmin){adminSection.open=false;return}
  for(const [key,refs] of adminRows){
   refs.input.checked=disabled(key);
   refs.input.disabled=pending.has(key)||!ready;
   refs.status.textContent=disabled(key)?"Disabled":"Enabled";
  }
  if(adminStatus&&!ready)adminStatus.textContent="Connecting to website settings…";
 }
 function renderLaunchers(){
  for(const [buttonId,key] of Object.entries(KEY_FOR_BUTTON)){
   const button=$(buttonId);
   if(!button)continue;
   const locked=disabled(key)&&!isAdmin;
   if(button.tagName==="BUTTON")button.disabled=locked;
   else button.setAttribute("aria-disabled",String(locked));
   const card=button.closest(".store-card");
   if(!card)continue;
   card.classList.toggle("hub-app-disabled",locked);
   let state=card.querySelector(".hub-app-state");
   if(!state){state=n("div","hub-app-state","Disabled by admin");state.hidden=true;card.querySelector(".store-card-copy")?.append(state)}
   state.hidden=!locked;
   if(locked&&button.tagName!=="BUTTON")button.setAttribute("tabindex","-1");
   else button.removeAttribute("tabindex");
  }
  for(const card of document.querySelectorAll(".store-game-card")){
   const key=card.dataset.hubGame;
   if(!key)continue;
   const locked=!isAdmin&&(disabled("game-hub")||disabled(key));
   card.classList.toggle("hub-app-disabled",locked);
   const play=card.querySelector(".store-game-play");
   if(play)play.disabled=locked;
   const preview=card.querySelector(".store-game-preview");
   if(preview)preview.setAttribute("aria-label","Preview "+(card.dataset.hubGameName||"game")+(locked?" (disabled)":""));
  }
 }
 function unavailableToast(key){
  const name=entries.find(entry=>entry.key===key)?.name||"This experience";
  window.alert(name+" has been disabled by a Community Hub administrator.");
 }
 function enforceActiveGame(){
  if(isAdmin)return;
  const gameHub=$("communityGameHub");
  if(!gameHub||gameHub.hidden)return;
  if(disabled("game-hub")){ $("gameClose")?.click();unavailableToast("game-hub");return; }
  const frame=$("gamePlayFrame");
  if(frame&&!frame.hidden&&frame.dataset.hubGame&&disabled(frame.dataset.hubGame)){
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
  card.append(message,link);overlay.append(card);
  document.body.append(overlay);return overlay;
 }
 function enforcePage(){
  if(currentPage){
   const overlay=createPageBlock();
   const locked=disabled(currentPage)&&!isAdmin;
   overlay.hidden=!locked;
   if(locked) document.getElementById("hubSiteDownText").textContent=
    (entries.find(x=>x.key===currentPage)?.name||"This site")+" is temporarily disabled by a Community Hub administrator.";
   return;
  }
  // index.html doubles as Community Chat and the always-available Hub launcher.
  // A disabled chat must never remove the My Account admin recovery path.
  if(!canUse("chats")&&$("interfaceGateway")?.hidden&&
     window.sessionStorage?.getItem("communityChatEntered")==="yes"){
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
  adminSection=n("details");adminSection.id="hubSiteAdminPanel";adminSection.hidden=true;
  const summary=n("summary",null,"🌐 Website & Game Controls");
  const body=n("div","hub-site-admin-body");
  body.append(n("p",null,"Turn Community Hub apps and games on or off for members. Changes sync across devices. Admins can still open disabled apps so you can turn them back on."));
  adminStatus=n("div");adminStatus.id="hubSiteAdminStatus";adminStatus.setAttribute("role","status");
  body.append(adminStatus);
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
    if(!account||!isAdmin||!db){input.checked=disabled(item.key);return}
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
     adminStatus.textContent=item.name+" "+(disable?"disabled":"enabled")+" for members.";
    }catch(error){
     input.checked=disabled(item.key);
     adminStatus.textContent="Change failed: "+String(error?.code||error?.message||"Check Firebase rules.").slice(0,130);
    }finally{
     pending.delete(item.key);renderAdmin();
    }
   });
  }
  body.append(n("p","hub-site-admin-help","The Hub homepage stays available. Disabling an app prevents access through Community Hub and shows an unavailable screen on its pages; public GitHub Pages source files and unrelated websites remain accessible."));
  adminSection.append(summary,body);
  signed.append(adminButton,adminSection);
  adminButton.addEventListener("click",()=>openAdminPanel());
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
 function openAdminPanel(){
  if(!account||!isAdmin||!adminSection)return;
  const modal=$("hubAccountModal");
  if(modal?.hidden)$("gatewayAccountButton")?.click();
  adminSection.hidden=false;adminSection.open=true;
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
   event.preventDefault();event.stopImmediatePropagation();unavailableToast(key);
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
   if(roleOff){roleOff();roleOff=null}
   roleListenerFor(user);
   const gameAdmin=$("gameHubAdminOpen");
   if(gameAdmin)gameAdmin.hidden=true;
  });
  onValue(ref(db,PATH),snapshot=>{
   settings=snapshot.val()||{};ready=true;refresh();
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
