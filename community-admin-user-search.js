/* Free (Spark-plan) Community Hub Admin User Search.
 * Uses Firebase Realtime Database rules, not Cloud Functions or account impersonation.
 * Only self-registered usernames are indexed. Exact verified emails use the
 * existing private chatEmailDirectory. Private profile fields stay private.
 */
import {getApps} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {getDatabase,ref,get,onValue,set,push,serverTimestamp,query,orderByChild,equalTo} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
(()=>{
 "use strict";
 const $=id=>document.getElementById(id);
 const form=$("adminUserSearchForm"),input=$("adminUserQuery");
 const submit=$("adminUserSearchSubmit"),results=$("adminUserSearchResults");
 const status=$("adminUserSearchStatus"),detail=$("adminUserProfile"),more=$("adminUserSearchMore");
 if(!form||!input||!submit||!results||!status||!detail||!more)return;
 const DIRECTORY="chatAdminUserDirectory";
 let auth=null,db=null,account=null,unwatchName=null,searchSequence=0,loading=false;
 let matches=[],offset=0,knownRoles={},hasRoleData=false;
 const create=(tag,cls,text)=>{
  const element=document.createElement(tag);
  if(cls)element.className=cls;
  if(text!==undefined)element.textContent=text;
  return element;
 };
 const friendlyDate=value=>{
  const time=Number(value);
  if(!Number.isFinite(time)||time<=0)return "Not available";
  return new Date(time).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
 };
 function reset(){
  matches=[];offset=0;results.replaceChildren();detail.replaceChildren();detail.hidden=true;more.hidden=true;
 }
 function busy(value){
  loading=value;
  submit.disabled=value||!account;
  input.disabled=value||!account;
  more.disabled=value||!account;
 }
 function getRoles(uid){
  const source=knownRoles[uid];
  if(typeof source==="string")return source==="member"?[]:[source];
  if(source&&typeof source==="object")return Object.keys(source).filter(key=>source[key]===true).slice(0,12);
  return [];
 }
 function cleanName(value){
  return typeof value==="string"&&value.trim()?value.trim().slice(0,80):"Community member";
 }
 function publishMyDirectoryEntry(user,name){
  if(auth.currentUser?.uid!==user.uid)return;
  const record={name:cleanName(name),updatedAt:serverTimestamp()};
  // Users can register only their own name. This path never stores a password,
  // session token, private message or email address.
  void set(ref(db,DIRECTORY+"/"+user.uid),record).catch(error=>
   console.warn("Community user directory registration unavailable:",error?.code||error?.message)
  );
  // Register only the member's public display name for ordinary chat member
  // search. The chatMemberDirectory rules allow writing only one's own entry.
  // Do not include email addresses, private bio, avatar or account tokens.
  void set(ref(db,"chatMemberDirectory/"+user.uid),{
   name:cleanName(name).slice(0,24),updatedAt:serverTimestamp()
  }).catch(error=>console.warn("Member profile discovery unavailable:",error?.code||error?.message));
 }
 function watchOwnProfile(user){
  if(unwatchName){unwatchName();unwatchName=null}
  if(!user)return;
  const uid=user.uid;
  const fallback=cleanName(user.displayName||"Community member");
  unwatchName=onValue(ref(db,"chatProfiles/"+uid+"/name"),snapshot=>{
   if(auth.currentUser?.uid!==uid)return;
   publishMyDirectoryEntry(user,snapshot.val()||fallback);
  },error=>{
   console.warn("Couldn't read your own profile name for directory:",error?.code||error?.message);
   publishMyDirectoryEntry(user,fallback);
  });
 }
 function row(item){
  const article=create("article","admin-inspector-result");
  const avatar=create("div","admin-inspector-avatar","👤");
  const copy=create("div","admin-inspector-copy");
  copy.append(create("strong",null,item.name));
  const roles=getRoles(item.uid);
  copy.append(create("small",null,(hasRoleData?(roles.length?roles.join(", "):"Member"):"Roles unavailable")+" · Account lookup"));
  copy.append(create("code",null,item.uid));
  const button=create("button","admin-inspector-view","View profile");
  button.type="button";
  button.addEventListener("click",()=>void inspect(item));
  article.append(avatar,copy,button);
  return article;
 }
 function showPage(){
  const end=Math.min(offset+25,matches.length);
  for(;offset<end;offset++)results.append(row(matches[offset]));
  more.hidden=offset>=matches.length;
  status.textContent=matches.length?
   "Showing "+offset+" of "+matches.length+" matching registered members.":
   "No matches. Members appear here after their next sign-in; email lookups require a verified account.";
 }
 async function readEmailMatch(q){
  // The existing chatEmailDirectory rules permit admin/moderator reads only
  // for a query ordered by email and scoped to an exact value.
  const options=[q];
  if(q.toLowerCase()!==q)options.push(q.toLowerCase());
  for(const email of options){
   const snap=await get(query(ref(db,"chatEmailDirectory"),orderByChild("email"),equalTo(email)));
   if(snap.exists()){
    const records=[];
    snap.forEach(child=>{
     const item=child.val();
     if(item&&child.key)records.push({uid:child.key,name:cleanName(item.name),source:"Verified email lookup"});
    });
    return records;
   }
  }
  return [];
 }
 async function doSearch(){
  if(loading||!db||!account)return;
  const q=input.value.trim();
  if(q.length<2||q.length>100){status.textContent="Enter 2–100 characters to search.";return}
  const sequence=++searchSequence;
  reset();busy(true);status.textContent="Searching registered community accounts…";
  try{
   // This read is only allowed to admins, checked by Realtime Database rules.
   const directorySnap=await get(ref(db,DIRECTORY));
   if(sequence!==searchSequence)return;
   const entries=directorySnap.val()||{};
   const needle=q.toLocaleLowerCase();
   const found=new Map();
   for(const [uid,data] of Object.entries(entries)){
    if(!data||typeof data.name!=="string")continue;
    const name=cleanName(data.name);
    if(name.toLocaleLowerCase().includes(needle)||uid.toLocaleLowerCase().includes(needle)){
     found.set(uid,{uid,name,updatedAt:Number(data.updatedAt)||null,source:"Community directory"});
    }
   }
   if(q.includes("@")){
    // The existing private email index is restricted to admins/moderators.
    // A match may exist even before the user has registered in our new directory.
    try{
     for(const item of await readEmailMatch(q)){
      found.set(item.uid,{...item,...(found.get(item.uid)||{})});
     }
    }catch(error){
     console.warn("Admin email lookup unavailable:",error?.code||error?.message);
    }
   }
   if(sequence!==searchSequence)return;
   matches=[...found.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.uid.localeCompare(b.uid));
   try{
    const rolesSnap=await get(ref(db,"chatRoles"));
    knownRoles=rolesSnap.val()||{};hasRoleData=true;
   }catch{knownRoles={};hasRoleData=false}
   showPage();
   // Best-effort audit; never store search text or email addresses in logs.
   void push(ref(db,"chatActivityLog"),{
    uid:account.uid,
    actorName:cleanName(account.displayName||"Admin").slice(0,60),
    action:"admin_user_search",
    detail:"matches="+matches.length,
    at:serverTimestamp()
   }).catch(()=>{});
  }catch(error){
   status.textContent=String(error?.code||"").includes("permission-denied")?
    "Access denied by Firebase. Sign in as a verified Community Hub admin and publish the updated Realtime Database rules.":
    "Search unavailable: "+String(error?.message||error).slice(0,190);
  }finally{
   if(sequence===searchSequence)busy(false);
  }
 }
 function field(list,label,value){
  list.append(create("dt",null,label),create("dd",null,String(value??"")));
 }
 async function inspect(item){
  const sequence=searchSequence;
  const uid=item.uid;
  detail.replaceChildren();detail.hidden=false;
  detail.append(create("p","admin-inspector-note","Loading this member's public profile…"));
  // Database rules enforce the user's profile privacy. An admin does not get
  // unrestricted access to photos, bios, messages or another user's session.
  let privacy="everyone";
  try{
   const privacySnap=await get(ref(db,"chatProfiles/"+uid+"/privacy"));
   if(sequence!==searchSequence)return;
   const value=privacySnap.val();
   if(["everyone","friends","none"].includes(value))privacy=value;
  }catch{privacy="none"} // Fail closed when visibility cannot be checked.
  const fields={avatar:"",bio:""};
  if(privacy==="everyone"){
   for(const key of ["avatar","bio"]){
    try{
     const value=(await get(ref(db,"chatProfiles/"+uid+"/"+key))).val();
     if(typeof value==="string")fields[key]=value;
    }catch{} // Keep private profile fields unavailable.
   }
  }
  if(sequence!==searchSequence)return;
  detail.replaceChildren();
  const head=create("div","admin-inspector-profile-head");
  const avatar=create("div","admin-inspector-avatar","👤");
  if(/^https:\/\/res\.cloudinary\.com\/lplbbbdh\/image\/upload\//.test(fields.avatar)){
   const image=create("img");image.src=fields.avatar;image.alt="";image.loading="lazy";
   avatar.replaceChildren(image);
  }
  const title=create("div");
  title.append(create("strong",null,item.name));
  const roles=getRoles(uid);
  title.append(create("small",null,hasRoleData?(roles.length?roles.join(", "):"Member"):"Roles not available"));
  head.append(avatar,title);detail.append(head);
  detail.append(create("p","admin-inspector-note","Read-only profile. You're signed in as yourself—not this member. Private messages and passwords cannot be accessed."));
  const dl=create("dl","admin-inspector-fields");
  field(dl,"User ID",uid);
  field(dl,"Visibility",privacy==="everyone"?"Public":privacy==="friends"?"Friends only":"Private");
  field(dl,"Bio",privacy==="everyone"?(fields.bio||"No public bio"):"Hidden by this member's privacy settings");
  field(dl,"Directory updated",friendlyDate(item.updatedAt));
  field(dl,"Record source",item.source);
  detail.append(dl);
  const blockButton=create("button","admin-block-user-button","🚫 Block from Community Hub");
  blockButton.type="button";
  blockButton.addEventListener("click",()=>{
   if(!window.HubUserAccess?.selectUser(uid,item.name)){
    status.textContent="The Block Users panel is only available to verified admins. Open My Account → Block / Unblock Users.";
   }
  });
  detail.append(blockButton);
  const close=create("button","admin-inspector-back","Close profile");close.type="button";
  close.addEventListener("click",()=>{detail.hidden=true;detail.replaceChildren();input.focus()});
  detail.append(close);
  detail.scrollIntoView({block:"nearest",behavior:"smooth"});
 }
 form.addEventListener("submit",event=>{event.preventDefault();void doSearch()});
 more.addEventListener("click",showPage);
 input.maxLength=100;
 input.placeholder="Search username, user ID or verified email…";
 input.addEventListener("input",()=>{
  searchSequence++;reset();
  status.textContent="Search by name or user ID, or by an exact verified email address.";
 });
 async function init(){
  for(let i=0;i<32&&!getApps().length;i++)await new Promise(resolve=>setTimeout(resolve,250));
  const app=getApps().find(a=>a.name==="[DEFAULT]")||getApps()[0];
  if(!app){status.textContent="Firebase sign-in hasn't loaded. Refresh and try again.";return}
  auth=getAuth(app);db=getDatabase(app);
  onAuthStateChanged(auth,next=>{
   searchSequence++;account=next;reset();busy(false);
   if(next)watchOwnProfile(next);else if(unwatchName){unwatchName();unwatchName=null}
   status.textContent=next?
    "Search by username, user ID, or exact verified email. Results are available to verified admins only.":
    "Sign in as a verified Community Hub admin to search registered members.";
  });
 }
 busy(true);
 void init().catch(error=>{busy(false);status.textContent="Couldn't start user search: "+String(error?.message||error).slice(0,150)});
})();
