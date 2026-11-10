/* Community Hub account access controls — Firebase Spark plan.
 * Admin UI: block/unblock a Firebase UID. All decisions are enforced by RTDB rules.
 * Client overlay is an additional UX gate; public GitHub Pages files remain public.
 */
import {initializeApp,getApps} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {getAuth,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {getDatabase,ref,get,onValue,set,remove,push,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

(()=>{
 "use strict";
 const $=id=>document.getElementById(id);
 const BLOCKS="hubBlockedUsers";
 let auth=null,db=null,account=null,admin=false,tokenAdmin=false,blocked=false,checked=false,revision=0;
 let stopSelf=null,stopRole=null,stopList=null,selected=null,blockedRecords={},listLoaded=false;
 let panel=null,entry=null,gameEntry=null,status=null,list=null,uidInput=null,reasonInput=null;
 const n=(tag,cls,text)=>{
  const element=document.createElement(tag);
  if(cls)element.className=cls;
  if(text!==undefined)element.textContent=text;
  return element;
 };
 const formatDate=timestamp=>{
  if(typeof timestamp!=="number"||!Number.isFinite(timestamp)||timestamp<=0)return "Unknown date";
  return new Date(timestamp).toLocaleString();
 };
 function showOverlay(value){
  let overlay=$("hubUserBlockedOverlay");
  if(!overlay){
   overlay=n("section");overlay.id="hubUserBlockedOverlay";
   overlay.setAttribute("role","alertdialog");
   overlay.setAttribute("aria-modal","true");
   overlay.setAttribute("aria-labelledby","hubBlockTitle");
   overlay.hidden=true;
   const card=n("div","hub-user-blocked-card");
   card.append(n("div","hub-block-icon","🚫"),n("h1",null,"Access suspended"));
   card.querySelector("h1").id="hubBlockTitle";
   card.append(n("p",null,"This account cannot use Community Hub."));
   const reason=n("p","hub-block-reason");reason.id="hubBlockReason";card.append(reason);
   const help=n("p","hub-block-hint","Contact a Community Hub administrator if you think this is a mistake.");
   const button=n("button",null,"Sign out / Switch account");button.type="button";
   button.addEventListener("click",()=>auth&&signOut(auth).catch(error=>{
    reason.textContent="Could not sign out: "+String(error.message||"unknown");
   }));
   card.append(help,button);overlay.append(card);document.body.append(overlay);
  }
  const active=!!value;
  overlay.hidden=!active;
  if(active){
   const pending=value?.pending===true;
   const failed=value?.error===true;
   $("hubBlockTitle").textContent=pending?"Checking account access…":failed?"Unable to verify access":"Access suspended";
   const message=typeof value.reason==="string"?value.reason.trim().slice(0,180):"";
   $("hubBlockReason").textContent=message?(pending||failed?message:"Reason: "+message):"Your account has been blocked by a Community Hub administrator.";
   // Do not let already-open chat, game players or browser frames keep running.
   const gameFrame=$("gamePlayFrame");
   if(gameFrame){gameFrame.removeAttribute("src");gameFrame.hidden=true;}
   $("browserSidebarClose")?.click();
  }
  document.documentElement.classList.toggle("hub-account-blocked",active);
 }
 function refreshAdminUI(){
  const allowed=!!account&&admin&&!blocked;
  if(entry)entry.hidden=!allowed;
  if(panel){
   if(!allowed){
    panel.open=false;
    panel.hidden=true;
    if(entry)entry.setAttribute("aria-expanded","false");
   }else if(!panel.open){
    panel.hidden=true;
   }
  }
  if(gameEntry)gameEntry.hidden=!allowed;
  if(allowed&&status&&!listLoaded)status.textContent="Open the panel to view blocked accounts.";
 }
 function renderBlockList(){
  if(!list)return;
  list.replaceChildren();
  const records=Object.entries(blockedRecords).filter(([uid,data])=>data&&data.blocked===true);
  records.sort((a,b)=>(b[1].at||0)-(a[1].at||0));
  if(!records.length){
   list.append(n("p","hub-block-empty","No accounts are currently blocked."));
   return;
  }
  for(const [uid,record] of records){
   const row=n("div","hub-block-member");
   const info=n("div");
   info.append(n("strong",null,record.name||"User "+uid.slice(0,8)));
   info.append(n("code",null,uid));
   const details=n("small",null,(record.reason||"No reason entered")+" · "+formatDate(record.at));
   info.append(details);
   const unblock=n("button","hub-block-unblock","Unblock");
   unblock.type="button";
   unblock.addEventListener("click",()=>void setUserBlocked(uid,false,record.name||"Member"));
   row.append(info,unblock);list.append(row);
  }
 }
 function startBlockList(){
  if(stopList||!admin||!account||!db)return;
  if(status)status.textContent="Loading blocked members…";
  stopList=onValue(ref(db,BLOCKS),snapshot=>{
   blockedRecords=snapshot.val()||{};listLoaded=true;renderBlockList();
   if(status)status.textContent=Object.values(blockedRecords).filter(x=>x?.blocked===true).length+" blocked account(s).";
  },error=>{
   if(status)status.textContent="Could not list blocks: "+String(error?.code||error?.message).slice(0,110)+". Publish the updated Firebase rules.";
   if(stopList){stopList();stopList=null}
  });
 }
 function select(uid,name=""){
  if(!admin||!account||blocked||!uidInput)return false;
  const cleaned=String(uid||"").trim();
  if(!/^[^\s.#$\[\]/]{1,128}$/.test(cleaned))return false;
  selected={uid:cleaned,name:String(name||"").trim().slice(0,80)};
  uidInput.value=cleaned;
  if(status)status.textContent="Selected "+(selected.name||"user")+" ("+cleaned+"). Enter a reason and press Block user.";
  open();
  return true;
 }
 function open(toggle=false){
  if(!admin||!account||blocked||!panel)return;
  if(toggle&&panel.open&&!panel.hidden){
   panel.open=false;
   panel.hidden=true;
   entry?.setAttribute("aria-expanded","false");
   entry?.focus();
   return;
  }
  const modal=$("hubAccountModal");
  if(modal?.hidden)$("gatewayAccountButton")?.click();
  panel.hidden=false;
  panel.open=true;
  entry?.setAttribute("aria-expanded","true");
  startBlockList();
  panel.scrollIntoView({block:"nearest"});
  uidInput?.focus();
 }
 async function setUserBlocked(uid,shouldBlock,name=""){
  if(!admin||!account||!db||blocked)return;
  if(uid===account.uid){status.textContent="You cannot block your own admin account.";return}
  if(!/^[^\s.#$\[\]/]{1,128}$/.test(uid)){status.textContent="Enter a valid Firebase user ID.";return}
  const reason=reasonInput?.value.trim()||"";
  if(shouldBlock&&!reason){status.textContent="Enter a reason before blocking a member.";return}
  if(reason.length>180){status.textContent="Keep the reason under 180 characters.";return}
  const action=shouldBlock?"block":"unblock";
  if(!window.confirm((shouldBlock?"Block":"Unblock")+" "+(name||uid)+" "+(shouldBlock?"from using Community Hub?":"and restore account access?")))return;
  status.textContent=(shouldBlock?"Checking member's roles…":"Unblocking account…");
  try{
   // A client-side check to avoid accidents; Firebase rules also reject
   // writes targeting admin-role accounts or the caller's own account.
   if(shouldBlock){
    const snap=await get(ref(db,"chatRoles/"+uid));
    const role=snap.val();
    if(role==="admin"||role?.admin===true){
     status.textContent="Administrator accounts cannot be blocked from this panel.";return;
    }
   }
   const target=ref(db,BLOCKS+"/"+uid);
   if(shouldBlock)await set(target,{
    blocked:true,
    name:(name||selected?.name||"Member").slice(0,80),
    reason,
    by:account.uid,
    at:serverTimestamp()
   });
   else await remove(target);
   status.textContent=(name||uid)+(shouldBlock?" blocked.":" unblocked.");
   if(shouldBlock){uidInput.value="";reasonInput.value="";selected=null}
   void push(ref(db,"chatActivityLog"),{
    uid:account.uid,
    actorName:String(account.displayName||"Admin").slice(0,60),
    action:shouldBlock?"site_access_block":"site_access_unblock",
    detail:"targetUid="+uid,
    at:serverTimestamp()
   }).catch(()=>{});
  }catch(error){
   status.textContent="Could not "+action+": "+String(error.code||error.message||"Permission denied").slice(0,130)+". Check the Firebase rules.";
  }
 }
 function createAdminUI(){
  const signed=$("hubSignedIn");
  if(!signed)return;
  entry=n("button");entry.id="hubUserBlockOpen";entry.type="button";
  entry.textContent="🚫 Block / Unblock Users";entry.hidden=true;
  entry.setAttribute("aria-controls","hubUserBlockPanel");
  entry.setAttribute("aria-expanded","false");
  panel=n("details");panel.id="hubUserBlockPanel";panel.hidden=true;
  const summary=n("summary",null,"🔐 Account Access Controls");
  const body=n("div","hub-user-block-body");
  body.append(n("p",null,"Block a member's Firebase account from Community Hub. Live blocks also deny their protected Realtime Database access. These controls do not block IP addresses or access to public GitHub Pages files."));
  const form=n("form");form.id="hubUserBlockForm";form.autocomplete="off";
  const uidLabel=n("label",null,"Firebase user ID");
  uidInput=n("input");uidInput.id="hubUserBlockUid";uidInput.name="uid";uidInput.placeholder="Paste a UID or select a user in Admin User Search";uidInput.maxLength=128;uidInput.required=true;
  uidLabel.append(uidInput);
  const reasonLabel=n("label",null,"Reason (shown to blocked member)");
  reasonInput=n("textarea");reasonInput.id="hubUserBlockReason";reasonInput.rows=3;reasonInput.maxLength=180;reasonInput.placeholder="Explain why access is suspended";reasonLabel.append(reasonInput);
  const buttons=n("div","hub-block-actions");
  const blockButton=n("button",null,"🚫 Block user");blockButton.type="submit";
  const unblockButton=n("button",null,"Restore access");unblockButton.type="button";
  unblockButton.addEventListener("click",()=>void setUserBlocked(uidInput.value.trim(),false,selected?.name||""));
  buttons.append(blockButton,unblockButton);
  form.append(uidLabel,reasonLabel,buttons);
  uidInput.addEventListener("input",()=>{
   if(selected&&selected.uid!==uidInput.value.trim())selected=null;
  });
  form.addEventListener("submit",event=>{event.preventDefault();void setUserBlocked(uidInput.value.trim(),true,selected?.name||"")});
  status=n("p");status.id="hubUserBlockStatus";status.setAttribute("role","status");status.textContent="Only verified admins can change account access.";
  list=n("div");list.id="hubUserBlockList";
  body.append(form,status,n("h3",null,"Currently blocked accounts"),list);
  panel.append(summary,body);signed.append(entry,panel);
  entry.addEventListener("click",()=>open(true));
  panel.addEventListener("toggle",()=>{
   const visible=panel.open&&!!account&&admin&&!blocked;
   panel.hidden=!visible;
   entry.setAttribute("aria-expanded",String(visible));
   if(visible)startBlockList();
  });
  const gameBar=$("communityGameHub")?.querySelector(".game-top");
  if(gameBar){
   gameEntry=n("button");gameEntry.id="gameHubBlockUsers";gameEntry.type="button";gameEntry.textContent="🚫 Block users";gameEntry.hidden=true;
   gameEntry.addEventListener("click",open);
   gameBar.insertBefore(gameEntry,$("gameClose"));
  }
  refreshAdminUI();
 }
 function unwatch(){
  for(const stop of [stopSelf,stopRole,stopList])try{stop?.()}catch{}
  stopSelf=null;stopRole=null;stopList=null;listLoaded=false;blockedRecords={};
 }
 async function syncUser(user){
  const id=++revision;unwatch();account=user;admin=false;tokenAdmin=false;blocked=false;checked=!user;selected=null;
  showOverlay(false);refreshAdminUI();
  if(!user)return;
  // An authenticated account is not admitted into the Hub until the block status
  // has been read. Database check failure is shown instead of silently accepting.
  const waiting={pending:true,reason:"Checking your Community Hub access…"};
  showOverlay(waiting);
  checked=false;
  try{
   const token=await user.getIdTokenResult();
   if(id!==revision)return;
   tokenAdmin=token.claims?.admin===true;
   admin=tokenAdmin;
   refreshAdminUI();
   stopSelf=onValue(ref(db,BLOCKS+"/"+user.uid),snapshot=>{
    if(id!==revision)return;
    checked=true;
    const wasBlocked=blocked;
    const record=snapshot.val();
    blocked=record?.blocked===true;
    showOverlay(blocked?record:false);
    if(wasBlocked&&!blocked){
     // Reconnect any Firebase listeners that were denied during suspension.
     window.location.reload();
     return;
    }
    refreshAdminUI();
    window.dispatchEvent(new CustomEvent("community-hub-user-block-change",{detail:{blocked,uid:user.uid}}));
   },error=>{
    if(id!==revision)return;
    // A missing/unpublished block-list rule must not lock out every real user.
    // Actual blocked accounts remain restricted by their database permissions.
    blocked=false;
    checked=false;
    showOverlay(false);
    refreshAdminUI();
    console.warn("Community Hub block lookup unavailable; check Firebase rules:",error.code||error.message);
    window.dispatchEvent(new CustomEvent("community-hub-access-verification-error",{
      detail:{code:String(error.code||"unavailable")}
    }));
   });
   stopRole=onValue(ref(db,"chatRoles/"+user.uid),snapshot=>{
    if(id!==revision||blocked)return;
    const role=snapshot.val();
    admin=tokenAdmin||role==="admin"||role?.admin===true;
    refreshAdminUI();
   },error=>{
    if(id!==revision)return;
    admin=tokenAdmin;refreshAdminUI();
    console.warn("Community Hub admin role check failed:",error.code||error.message);
   });
  }catch(error){
   if(id!==revision)return;
   checked=false;blocked=false;
   showOverlay(false);
   console.warn("Community Hub auth verification unavailable:",error.code||error.message);
  }
 }
 const config={
  apiKey:"AIzaSyB4wOgGUTR-fgweHtsJiK9XyykU_PND0GE",
  authDomain:"website-chat-80038.firebaseapp.com",
  databaseURL:"https://website-chat-80038-default-rtdb.firebaseio.com/",
  projectId:"website-chat-80038",
  appId:"1:42470201717:web:890e9ebf1f0865c8ea9b3c"
 };
 window.HubUserAccess={
  selectUser:select,open,isBlocked:()=>blocked,isAdmin:()=>admin&&!!account&&!blocked
 };
 function init(){
  createAdminUI();
  const app=getApps().find(a=>a.name==="[DEFAULT]")||initializeApp(config);
  auth=getAuth(app);db=getDatabase(app);
  onAuthStateChanged(auth,user=>void syncUser(user));
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
 else init();
})();
