/* Admin User Search — Community Hub.
 * All account searches are verified by Firebase Cloud Functions.
 * This is a read-only profile inspector, never Firebase Auth impersonation.
 */
import {getApps} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";
(()=>{
 "use strict";
 const $=id=>document.getElementById(id);
 const form=$("adminUserSearchForm");
 const query=$("adminUserQuery");
 const submit=$("adminUserSearchSubmit");
 const results=$("adminUserSearchResults");
 const status=$("adminUserSearchStatus");
 const detail=$("adminUserProfile");
 const more=$("adminUserSearchMore");
 if(!form||!query||!submit||!results||!status||!detail||!more)return;
 let auth=null,account=null,searchCallable=null,requestId=0,currentQuery="",nextPageToken=null,loading=false;
 let records=new Map();
 const create=(tag,cls,text)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text!==undefined)el.textContent=text;
  return el;
 };
 const friendlyDate=raw=>{
  if(typeof raw!=="string")return "Not available";
  const date=new Date(raw);
  return Number.isNaN(date.getTime())?"Not available":date.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
 };
 function clearProfile(){detail.hidden=true;detail.replaceChildren()}
 function clearSearch(){
  records.clear();results.replaceChildren();clearProfile();nextPageToken=null;more.hidden=true;
 }
 function updateBusy(on){
  loading=on;
  submit.disabled=on||!account;
  query.disabled=on||!account;
  more.disabled=on||!account;
 }
 function renderProfile(user){
  detail.replaceChildren();
  if(!user)return;
  const heading=create("div","admin-inspector-profile-head");
  const avatar=create("div","admin-inspector-avatar","👤");
  if(user.avatar){
   const image=create("img");image.alt="";image.src=user.avatar;image.loading="lazy";
   avatar.replaceChildren(image);
  }
  const title=create("div");
  title.append(create("strong",null,user.name||"Community member"));
  const roles=Array.isArray(user.roles)&&user.roles.length?user.roles.join(", "):"Member";
  title.append(create("small",null,"Roles: "+roles));
  heading.append(avatar,title);
  detail.append(heading);
  const note=create("p","admin-inspector-note","Read-only account profile. You are still signed in as yourself; no user sessions, messages or passwords are accessible here.");
  detail.append(note);
  const fields=[
   ["User ID",user.uid],
   ["Profile visibility",user.privacy==="everyone"?"Everyone":user.privacy==="friends"?"Friends only":"Private"],
   ["Bio",user.privacy==="everyone"?(user.bio||"No bio added"):"Hidden by member's profile privacy settings"],
   ["Account created",friendlyDate(user.createdAt)],
   ["Last sign-in",friendlyDate(user.lastSignInAt)],
   ["Account status",user.disabled?"Disabled":"Active"],
   ["Linked sign-in providers",(user.providers||[]).join(", ")||"Not listed"]
  ];
  const dl=create("dl","admin-inspector-fields");
  for(const [label,value] of fields){
   dl.append(create("dt",null,label),create("dd",null,String(value??"")));
  }
  detail.append(dl);
  const close=create("button","admin-inspector-back","Close profile");close.type="button";
  close.addEventListener("click",()=>{clearProfile();query.focus()});
  detail.append(close);detail.hidden=false;
  detail.scrollIntoView({block:"nearest",behavior:"smooth"});
 }
 function appendUser(user){
  if(!user||typeof user.uid!=="string"||records.has(user.uid))return;
  records.set(user.uid,user);
  const item=create("article","admin-inspector-result");
  const avatar=create("div","admin-inspector-avatar","👤");
  if(user.avatar){const img=create("img");img.src=user.avatar;img.alt="";img.loading="lazy";avatar.replaceChildren(img)}
  const copy=create("div","admin-inspector-copy");
  copy.append(create("strong",null,user.name||"Community member"));
  copy.append(create("small",null,(user.roles?.length?user.roles.join(", "):"Member")+" · "+(user.privacy==="everyone"?"Public profile":"Restricted profile")));
  // UIDs are used for exact moderation/account support, never credentials.
  copy.append(create("code",null,user.uid));
  const inspect=create("button","admin-inspector-view","View profile");
  inspect.type="button";
  inspect.setAttribute("aria-label","View read-only profile for "+(user.name||"Community member"));
  inspect.addEventListener("click",()=>renderProfile(user));
  item.append(avatar,copy,inspect);results.append(item);
 }
 async function search(page=false){
  if(loading||!account||!searchCallable)return;
  const text=query.value.trim();
  if(text.length<2||text.length>80){
   status.textContent="Enter at least 2 characters to search by name, email or Firebase user ID.";
   return;
  }
  if(!page){clearSearch();currentQuery=text}
  else if(!nextPageToken||text!==currentQuery)return;
  const session=requestId;
  updateBusy(true);status.textContent="Searching verified user accounts…";
  try{
   const payload={query:currentQuery};
   if(page)payload.pageToken=nextPageToken;
   const response=await searchCallable(payload);
   if(session!==requestId||!account)return;
   const data=response.data||{};
   for(const user of Array.isArray(data.users)?data.users:[])appendUser(user);
   nextPageToken=typeof data.nextPageToken==="string"?data.nextPageToken:null;
   more.hidden=!nextPageToken;
   const count=records.size;
   status.textContent=count?count+" member"+(count===1?"":"s")+" found"+(nextPageToken?" in pages checked so far. Search more to continue.":"."):
    (nextPageToken?"No matches in this page. Search more to continue.":"No matches found. Try another username, UID or email.");
  }catch(err){
   const code=String(err?.code||"");
   if(code.includes("permission-denied"))status.textContent="Access denied. This feature requires a verified Community Hub admin account.";
   else if(code.includes("not-found")||code.includes("unimplemented"))status.textContent="The account search function hasn't been deployed to Firebase yet.";
   else status.textContent="Search failed: "+String(err?.message||"Firebase account search unavailable.").slice(0,200);
  }finally{
   if(session===requestId)updateBusy(false);
  }
 }
 form.addEventListener("submit",event=>{event.preventDefault();void search(false)});
 more.addEventListener("click",()=>void search(true));
 query.addEventListener("input",()=>{
  // Clear stale search results immediately when search text changes.
  requestId++;clearSearch();
  status.textContent="Search by name, email, or Firebase user ID. Admin access is checked on the server.";
 });
 async function init(){
  // Game Hub and Chat both use the default Firebase app, loaded asynchronously.
  for(let i=0;i<30&&!getApps().length;i++)await new Promise(resolve=>setTimeout(resolve,250));
  const app=getApps().find(item=>item.name==="[DEFAULT]")||getApps()[0];
  if(!app){status.textContent="Firebase sign-in isn't ready. Refresh the page.";return}
  auth=getAuth(app);
  searchCallable=httpsCallable(getFunctions(app,"us-central1"),"searchCommunityUsers",{timeout:30000});
  onAuthStateChanged(auth,next=>{
   requestId++;account=next;clearSearch();updateBusy(false);
   status.textContent=next?
    "Search by name, email, or Firebase user ID. Admin access is verified on the server.":
    "Sign in as a verified Community Hub admin to search users.";
  });
 }
 clearProfile();updateBusy(true);
 void init().catch(err=>{status.textContent="Couldn't load admin search: "+String(err?.message||err).slice(0,150)});
})();
