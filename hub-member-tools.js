/* Game Hub account buttons and admin member search.
   Uses the same Firebase Auth, per-account session vault, Realtime Database
   permissions and existing admin PIN as Community Chat. */
import {initializeApp,getApps} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {getAuth,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {getDatabase,ref,get,onValue,query,orderByChild,equalTo} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const config={apiKey:"AIzaSyB4wOgGUTR-fgweHtsJiK9XyykU_PND0GE",authDomain:"website-chat-80038.firebaseapp.com",databaseURL:"https://website-chat-80038-default-rtdb.firebaseio.com/",projectId:"website-chat-80038",appId:"1:42470201717:web:890e9ebf1f0865c8ea9b3c"};
const accountBtn=$("gatewayAccountButton"),out=$("gatewaySignOut"),switcher=$("gatewaySwitchAccount"),adminButton=$("gatewayHubAdmin");
const modal=$("hubAdminMemberModal"),close=$("hubAdminMemberClose"),form=$("hubAdminMemberSearchForm"),search=$("hubAdminMemberQuery");
const status=$("hubAdminMemberStatus"),results=$("hubAdminMemberResults"),profile=$("hubAdminMemberProfile");
if(!accountBtn||!out||!switcher||!adminButton||!modal||!form)return;
const app=getApps().find(a=>a.name==="[DEFAULT]")||initializeApp(config);
const auth=getAuth(app),db=getDatabase(app);
let user=null,admin=false,claimAdmin=false,rolesOff=null,version=0,seq=0,running=false,previousFocus=null;
let knownRoles={};
const el=(tag,cls,text)=>{
 const x=document.createElement(tag);
 if(cls)x.className=cls;
 if(text!==undefined)x.textContent=text;
 return x;
};
function updateButtons(){
 out.hidden=!user;
 switcher.hidden=false; // Saved accounts can be selected even after signing out.
 adminButton.hidden=!user||!admin;
 if(!admin&&modal&&!modal.hidden)hideAdmin();
}
async function signOutCurrent(){
 if(!auth.currentUser)return;
 if(!confirm("Sign out of this account and remove its saved session from this device? Other saved accounts stay available."))return;
 out.disabled=true;
 try{
  if(window.CommunityHubAccountActions?.signOut)await window.CommunityHubAccountActions.signOut();
  else await signOut(auth);
  $("hubAccountClose")?.click();
  // Return to the app chooser rather than leaving a protected chat visible.
  window.communityShowLoader?.();
  accountBtn.focus();
 }catch(error){alert("Sign out failed: "+String(error?.code||error?.message||error).slice(0,160));}
 finally{out.disabled=false;}
}
out.addEventListener("click",()=>void signOutCurrent());
switcher.addEventListener("click",async()=>{
 if(typeof window.communityOpenSwitchAccount==="function")await window.communityOpenSwitchAccount();
 else accountBtn.click();
});
function hideAdmin(){
 modal.hidden=true;
 results.replaceChildren();profile.replaceChildren();profile.hidden=true;
 search.value="";status.textContent="Search registered members or inspect allowed public profiles.";
 window.HubAdminPin?.lock("site");
 previousFocus?.focus();
}
close.addEventListener("click",hideAdmin);
modal.addEventListener("click",event=>{if(event.target===modal)hideAdmin();});
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!modal.hidden){event.stopPropagation();hideAdmin();}});
async function openAdmin(){
 if(!user||!admin)return;
 const uid=user.uid;
 if(!await window.HubAdminPin?.request({scope:"site",uid,label:"Game Hub Admin Panel"}))return;
 if(!user||user.uid!==uid||!admin)return;
 previousFocus=document.activeElement;
 modal.hidden=false;
 status.textContent="Search registered members by username, UID, or exact verified email.";
 search.focus();
}
adminButton.addEventListener("click",()=>void openAdmin());
$("hubAdminWebsiteControls").addEventListener("click",()=>{
 if(!admin)return;
 hideAdmin();
 accountBtn.click();
 $("hubSiteAdminOpen")?.click();
});
$("hubAdminBlockUsers").addEventListener("click",()=>{
 if(!admin)return;
 hideAdmin();
 void window.HubUserAccess?.open?.();
});
function displayRoles(uid){
 const raw=knownRoles[uid];
 const roles=typeof raw==="string"?[raw]:raw&&typeof raw==="object"?Object.keys(raw).filter(x=>raw[x]===true):[];
 return roles.length?roles.map(r=>r==="plus"?"MIP":r[0].toUpperCase()+r.slice(1)).join(" · "):"Member";
}
function avatar(){
 const x=el("span","hub-member-avatar","👤");
 return x;
}
function addResult(item){
 const row=el("div","hub-admin-member-result");
 const pic=avatar();
 const label=el("div","hub-admin-member-result-info");
 label.append(el("strong",null,item.name),el("small",null,displayRoles(item.uid)));
 const view=el("button",null,"View profile");view.type="button";
 const open=()=>void inspect(item);
 view.addEventListener("click",open);label.addEventListener("click",open);
 row.append(pic,label,view);
 results.append(row);
}
async function exactEmail(email){
 for(const value of [...new Set([email,email.toLowerCase()])]){
  const snap=await get(query(ref(db,"chatEmailDirectory"),orderByChild("email"),equalTo(value)));
  if(!snap.exists())continue;
  const items=[];
  snap.forEach(record=>{
   const val=record.val();
   if(record.key&&val&&typeof val.name==="string")items.push({uid:record.key,name:val.name.slice(0,80)});
  });
  return items;
 }
 return [];
}
async function performSearch(event){
 event.preventDefault();
 const q=search.value.trim();
 if(!user||!admin||modal.hidden||q.length<2||q.length>100)return;
 const token=++seq;
 running=true;results.replaceChildren();profile.hidden=true;profile.replaceChildren();
 status.textContent="Searching…";
 try{
  const snap=await get(ref(db,"chatAdminUserDirectory"));
  if(token!==seq||modal.hidden||!admin)return;
  const needle=q.toLocaleLowerCase(),found=new Map();
  for(const [uid,item] of Object.entries(snap.val()||{})){
   if(!item||typeof item.name!=="string")continue;
   if(item.name.toLocaleLowerCase().includes(needle)||uid.toLocaleLowerCase().includes(needle)){
    found.set(uid,{uid,name:item.name.trim().slice(0,80)||"Member"});
   }
  }
  if(q.includes("@")){
   try{
    for(const item of await exactEmail(q))found.set(item.uid,item);
   }catch(error){console.warn("Exact email lookup unavailable:",error.code||error.message)}
  }
  if(token!==seq||modal.hidden)return;
  try{knownRoles=(await get(ref(db,"chatRoles"))).val()||{}}catch{knownRoles={}}
  const matched=[...found.values()].sort((a,b)=>a.name.localeCompare(b.name)).slice(0,60);
  for(const item of matched)addResult(item);
  status.textContent=matched.length?
   "Found "+matched.length+(found.size>60?" of "+found.size:"")+" matching member(s). Tap View profile.":
   "No matching accounts yet. Members appear once indexed after sign-in.";
 }catch(error){
  if(token===seq)status.textContent=/permission.denied|permission-denied/i.test(String(error?.code||error?.message))?
   "Firebase denied admin search. Verify your Admin role and publish the latest database rules.":
   "Search failed: "+String(error?.message||error).slice(0,150);
 }finally{if(token===seq)running=false;}
}
form.addEventListener("submit",event=>void performSearch(event));
search.addEventListener("input",()=>{seq++;if(!running)status.textContent="Press Search to look up a member.";});
async function inspect(item){
 const token=seq;
 profile.hidden=false;profile.replaceChildren(el("p",null,"Loading visible profile…"));
 let privacy="none";
 try{
  const p=(await get(ref(db,"chatProfiles/"+item.uid+"/privacy"))).val();
  privacy=["everyone","friends","none"].includes(p)?p:"everyone";
 }catch{privacy="none"}
 let bio="",url="";
 if(privacy==="everyone"){
  try{bio=(await get(ref(db,"chatProfiles/"+item.uid+"/bio"))).val()||""}catch{}
  try{url=(await get(ref(db,"chatProfiles/"+item.uid+"/avatar"))).val()||""}catch{}
 }
 if(token!==seq||modal.hidden)return;
 profile.replaceChildren();
 const head=el("div","hub-admin-member-profile-top"),pic=avatar(),labels=el("div");
 if(/^https:\/\/res\.cloudinary\.com\/lplbbbdh\/image\/upload\//.test(url)){
  const img=el("img");img.src=url;img.alt="";img.loading="lazy";pic.replaceChildren(img);
 }
 labels.append(el("h3",null,item.name),el("small",null,displayRoles(item.uid)));
 head.append(pic,labels);profile.append(head);
 profile.append(el("p",null,privacy==="everyone"?(bio||"No public bio."):"This member's profile is private or friends-only."));
 profile.append(el("small","hub-admin-member-muted","Account UID: "+item.uid));
 const controls=el("div","hub-admin-member-profile-actions");
 const chat=el("button",null,"View chat profile");chat.type="button";
 chat.addEventListener("click",()=>{
  if(!user||!admin)return;
  hideAdmin();
  if(!window.CommunityChatOpenMemberProfile?.(item.uid,item.name)){
   alert("Open Community Chat and sign in to view this member's profile.");
  }
 });
 const block=el("button",null,"Block / Unblock user");block.type="button";
 block.addEventListener("click",()=>{
  if(!user||!admin)return;
  hideAdmin();
  window.HubUserAccess?.selectUser?.(item.uid,item.name);
 });
 controls.append(chat,block);profile.append(controls);
 profile.scrollIntoView({block:"nearest"});
}
async function verifyUser(next){
 const id=++version;
 const previousUid=user?.uid||null;
 if(rolesOff){rolesOff();rolesOff=null}
 user=next;admin=false;claimAdmin=false;
 seq++;updateButtons();
 // After choosing a saved account or completing a new sign-in, return to
 // the launcher so the switched account's apps and permissions can refresh.
 if(previousUid!==next?.uid&&!$("hubAccountSwitchPanel")?.hidden){
  $("hubAccountClose")?.click();
 }
 if(!next)return;
 try{claimAdmin=(await next.getIdTokenResult()).claims?.admin===true}catch{}
 if(id!==version)return;
 admin=claimAdmin;updateButtons();
 rolesOff=onValue(ref(db,"chatRoles/"+next.uid),snap=>{
  if(id!==version)return;
  const value=snap.val();
  admin=claimAdmin||value==="admin"||value?.admin===true;
  updateButtons();
 },()=>{if(id===version){admin=claimAdmin;updateButtons()}});
}
onAuthStateChanged(auth,next=>void verifyUser(next));
})();
