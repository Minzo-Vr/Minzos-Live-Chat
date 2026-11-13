/* Collaborative Python rooms for Community Hub.
 * Yjs CRDT + Firebase RTDB atomic transactions merge simultaneous edits.
 * Only approved Firebase UIDs can access room code and shared output.
 */
import * as Y from "https://cdn.jsdelivr.net/npm/yjs@13.6.33/+esm";
import {initializeApp,getApps} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {getDatabase,ref,onValue,get,set,remove,update,push,runTransaction,onDisconnect,query,orderByKey,limitToLast} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

(()=>{
"use strict";
const $=id=>document.getElementById(id);
const config={apiKey:"AIzaSyB4wOgGUTR-fgweHtsJiK9XyykU_PND0GE",authDomain:"website-chat-80038.firebaseapp.com",databaseURL:"https://website-chat-80038-default-rtdb.firebaseio.com/",projectId:"website-chat-80038",appId:"1:42470201717:web:890e9ebf1f0865c8ea9b3c"};
const app=getApps().find(a=>a.name==="[DEFAULT]")||initializeApp(config);
const auth=getAuth(app),db=getDatabase(app);
const ROOM_ROOT="hubPythonRooms",INDEX_ROOT="hubPythonRoomIndex",REQUEST_ROOT="hubPythonRoomRequests";
const CODE=$("pythonCode"),OUT=$("console"),RUN=$("runCode"),STOP=$("stopCode");
const SELECT=$("sharedRoomList"),STATUS=$("sharedStatus");
let wanted=new URLSearchParams(location.search).get("room")||"";
let openingRoom="";
let account=null,room=null,ownerUid="",ydoc=null,ytext=null,docRef=null;
let pending=[],writing=false,writeTimer=null,writeRetry=null,editRendering=false,roomVersion=0;
let subscriptions=[],accountIndexOff=null,roomIndex={},presenceTimer=null;
let sharedWorker=null,sharedRunKey=null,sharedRunValue="",sharedRunTimer=null,sharedRunTimeout=null;
let sharedRunRunning=false,sharedWorkerSeq=0;
const MAX_LENGTH=20000;
const safeRoomId=id=>/^[A-Za-z0-9_-]{12,32}$/.test(String(id||""));
const niceError=e=>/permission.denied|permission_denied/i.test(String(e?.code||e?.message||e))?"Access denied by Firebase. Check membership or publish the collaboration database rules.":String(e?.code||e?.message||e||"Unknown error").slice(0,200);
const notify=s=>{STATUS.textContent=s};
const path=(id,child="")=>ROOM_ROOT+"/"+id+(child?"/"+child:"");
const to64=bytes=>{
 let out="";for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(out);
};
const from64=str=>{
 const binary=atob(str);const bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return bytes;
};
function identity(){return String(account?.displayName||account?.email?.split("@")[0]||"Member").slice(0,65)}
function roomLink(id){const u=new URL("./python-editor.html",location.href);u.searchParams.set("room",id);return u.href}
async function copy(text){
 try{await navigator.clipboard.writeText(text);return true}
 catch{window.prompt("Copy this text:",text);return false}
}
function readCodeDiff(before,after){
 if(before===after)return;
 let start=0;
 while(start<before.length&&start<after.length&&before[start]===after[start])start++;
 let tail=0;
 while(tail<before.length-start&&tail<after.length-start&&before[before.length-1-tail]===after[after.length-1-tail])tail++;
 ydoc.transact(()=>{
  if(before.length-start-tail)ytext.delete(start,before.length-start-tail);
  if(after.length-start-tail)ytext.insert(start,after.slice(start,after.length-tail));
 },"user");
}
function renderCode(){
 if(!room||!ytext)return;
 const next=ytext.toString(),prev=CODE.value;
 if(next===prev)return;
 const start=(()=>{let i=0;while(i<prev.length&&i<next.length&&prev[i]===next[i])i++;return i})();
 let end=0;while(end<prev.length-start&&end<next.length-start&&prev[prev.length-1-end]===next[next.length-1-end])end++;
 const oldRemoved=prev.length-start-end,inserted=next.length-start-end;
 const adjust=position=>position<=start?position:(position>=start+oldRemoved?position+inserted-oldRemoved:start+inserted);
 const selA=adjust(CODE.selectionStart),selB=adjust(CODE.selectionEnd);
 editRendering=true;
 CODE.value=next;
 CODE.setSelectionRange(Math.max(0,selA),Math.max(0,selB));
 CODE.dispatchEvent(new Event("input",{bubbles:true}));
 editRendering=false;
}
CODE.addEventListener("input",()=>{
 if(!room||!ytext||editRendering)return;
 if(CODE.value.length>MAX_LENGTH){notify("Shared code exceeds 20,000 characters. Please shorten it.");return;}
 readCodeDiff(ytext.toString(),CODE.value);
});
function setRoomMode(active){
 document.body.classList.toggle("shared-active",active);
 window.PythonCollab={active:()=>!!room};
 $("roomActive").hidden=!active;
 $("sharedRunNotice").hidden=!active;
 RUN.textContent=active?"▶ Run for everyone":"▶ Run Python";
 $("sharedCreateRoom").disabled=!account||active;
 $("sharedJoinRoom").disabled=!account||active;
 $("sharedOpenRoom").disabled=!account||active;
 $("sharedJoinCode").disabled=!account||active;
 $("sharedRoomList").disabled=!account||active;
 $("sharedEditorTitle").textContent=room?.title||"";
 if(active){
  $("projectName").value=room.title;
  $("runStatus").textContent="Shared room ready";
 }
 document.dispatchEvent(new Event("python-collab-room-change"));
}
window.PythonCollab={active:()=>!!room};
function updateSyncStatus(message){
 if(!room)return;
 $("sharedEditorTitle").textContent=room.title;
 notify(message||((pending.length||writing)?"Syncing edits…":"All changes synced · "+room.title));
}
function cleanupSubscriptions(){
 for(const unsub of subscriptions){try{unsub()}catch{}}
 subscriptions=[];
 if(presenceTimer){clearInterval(presenceTimer);presenceTimer=null}
}
async function leaveRoom(){
 const prior=room;
 if(!prior)return;
 roomVersion++;wanted="";
 if(pending.length||writing)notify("Leaving: any unsynced edits may be lost. Reopen this room to check.");
 clearTimeout(writeTimer);clearTimeout(writeRetry);
 stopSharedRun(false);
 cleanupSubscriptions();
 pending=[];writing=false;docRef=null;
 ytext?.unobserve(renderCode);
 ydoc?.destroy();ydoc=null;ytext=null;room=null;ownerUid="";
 if(account?.uid)void remove(ref(db,path(prior.id,"presence/"+account.uid))).catch(()=>{});
 setRoomMode(false);
 $("sharedPeople").textContent="";
 $("roomOwnerTools").hidden=true;
 $("roomAccessPrompt").hidden=true;
 $("sharedJoinCode").value="";
 $("runStatus").textContent="Ready to run";
 $("sharedRunNotice").hidden=true;
 const next=new URL(location.href);next.searchParams.delete("room");history.replaceState(null,"",next);
 notify("Left shared room. Your private projects remain available.");
}
async function flush(){
 if(!room||!docRef||writing||!pending.length)return;
 const id=room.id,revision=roomVersion,updates=pending.splice(0);
 writing=true;updateSyncStatus();
 try{
  const result=await runTransaction(docRef,current=>{
   if(!current||typeof current.state!=="string")return;
   const combined=Y.mergeUpdates([from64(current.state),...updates]);
   const state=to64(combined);
   if(state.length>190000)throw Error("Room history is too large; create a new room.");
   return {state,updatedAt:Date.now()};
  },{applyLocally:false});
  if(!result.committed)throw Error("Room was not ready for edits.");
  if(room?.id===id&&roomVersion===revision)updateSyncStatus("Live edits saved.");
 }catch(err){
  if(room?.id!==id||roomVersion!==revision)return;
  pending.unshift(...updates);
  notify("Sync failed: "+niceError(err)+". Retrying…");
  clearTimeout(writeRetry);writeRetry=setTimeout(()=>void flush(),1800);
 }finally{
  if(room?.id===id&&roomVersion===revision){
   writing=false;
   if(pending.length&&!writeRetry)queueFlush();
  }
 }
}
function queueFlush(){
 clearTimeout(writeTimer);
 writeTimer=setTimeout(()=>{writeRetry=null;void flush()},260);
}
function memberLabel(uid){
 return uid===account?.uid?"You":uid.slice(0,9)+"…";
}
function showPeople(members={},presence={}){
 const current=Object.keys(members).filter(id=>members[id]===true);
 const online=current.filter(uid=>presence[uid]&&Date.now()-Number(presence[uid].at||0)<90000);
 const label=current.map(uid=>{
  const person=presence[uid],display=person?.name?person.name:memberLabel(uid);
  return (online.includes(uid)?"🟢 ":"⚪ ")+display+(uid===ownerUid?" (owner)":"");
 });
 $("sharedPeople").textContent="Collaborators ("+online.length+" online / "+current.length+" invited): "+(label.join(", ")||"Only you");
}
function showRequests(requests){
 const box=$("sharedRequests");box.replaceChildren();
 if(!room||ownerUid!==account?.uid)return;
 const people=Object.entries(requests||{});
 if(!people.length){const p=document.createElement("p");p.textContent="No pending access requests.";box.append(p);return;}
 for(const [uid,data] of people){
  const row=document.createElement("div"),label=document.createElement("span"),approve=document.createElement("button");
  label.textContent=(data?.name||"User")+" ("+uid.slice(0,10)+"…)";
  approve.textContent="Approve";approve.type="button";
  approve.addEventListener("click",()=>void invite(uid,true,approve));
  row.append(label,approve);box.append(row);
 }
}
async function invite(uid,fromRequest=false,button=null){
 if(!room||ownerUid!==account?.uid)return;
 uid=String(uid||"").trim();
 if(!/^[^\s.#$\[\]/]{1,128}$/.test(uid))return notify("Paste a valid Firebase account ID.");
 const id=room.id;if(button)button.disabled=true;
 try{
  await set(ref(db,path(id,"members/"+uid)),true);
  await set(ref(db,INDEX_ROOT+"/"+uid+"/"+id),true);
  if(fromRequest)await remove(ref(db,REQUEST_ROOT+"/"+id+"/"+uid));
  $("sharedInviteUid").value="";
  notify("Invitation approved. This account can now open the room link.");
 }catch(err){notify("Could not invite: "+niceError(err))}
 finally{if(button)button.disabled=false}
}
async function joinRoom(id){
 id=String(id||"").trim();
 if(!safeRoomId(id))return notify("Enter a valid room link or room code.");
 if(!account)return notify("Sign in to Community Hub first.");
 if(openingRoom===id||room?.id===id)return;
 if(room){
  if(pending.length||writing){if(!confirm("Some edits are still syncing. Leave this room anyway?"))return;}
  await leaveRoom();
 }
 openingRoom=id;wanted=id;
 const uid=account.uid,revision=++roomVersion;
 notify("Checking access to shared room…");
 try{
  const snapshot=await get(ref(db,path(id)));
  if(revision!==roomVersion||account?.uid!==uid)return;
  if(!snapshot.exists())throw Error("Room not found.");
  const value=snapshot.val();
  if(value.ownerUid!==uid&&value.members?.[uid]!==true)throw Error("Only invited members may join.");
  const d=new Y.Doc(),t=d.getText("code");
  Y.applyUpdate(d,from64(value.document?.state||""),"firebase");
  if(t.length>MAX_LENGTH)throw Error("Shared code exceeds editor limit.");
  ydoc=d;ytext=t;docRef=ref(db,path(id,"document"));
  ownerUid=value.ownerUid;
  room={id,title:String(value.title||"Python collaboration").slice(0,80)};
  pending=[];writing=false;
  ytext.observe(renderCode);
  ydoc.on("update",(data,origin)=>{
   if(origin==="firebase"||!room||room.id!==id)return;
   pending.push(data);queueFlush();updateSyncStatus();
  });
  CODE.value=t.toString();
  CODE.dispatchEvent(new Event("input",{bubbles:true}));
  $("roomAccessPrompt").hidden=true;
  $("sharedJoinCode").value=id;
  $("sharedRoomTitle").textContent="👥 "+room.title;
  $("roomOwnerTools").hidden=uid!==ownerUid;
  setRoomMode(true);
  const u=new URL(location.href);u.searchParams.set("room",id);history.replaceState(null,"",u);
  updateSyncStatus("Connected. Changes merge automatically with everyone in the room.");
  subscriptions.push(onValue(docRef,snap=>{
   if(room?.id!==id||!snap.exists())return;
   try{Y.applyUpdate(ydoc,from64(snap.val().state),"firebase")}catch(err){notify("Cannot decode room changes: "+niceError(err))}
  },err=>notify("Document sync unavailable: "+niceError(err))));
  let latestMembers={},latestPresence={};
  subscriptions.push(onValue(ref(db,path(id,"members")),snap=>{
   if(room?.id!==id)return;
   latestMembers=snap.val()||{};
   if(latestMembers[uid]!==true&&uid!==ownerUid){notify("You no longer have access to this room.");void leaveRoom();return;}
   showPeople(latestMembers,latestPresence);
  }));
  subscriptions.push(onValue(ref(db,path(id,"presence")),snap=>{
   latestPresence=snap.val()||{};if(room?.id===id)showPeople(latestMembers,latestPresence);
  }));
  subscriptions.push(onValue(query(ref(db,path(id,"runs")),orderByKey(),limitToLast(1)),snap=>{
   if(room?.id!==id)return;
   const values=snap.val()||{},last=Object.keys(values).sort().at(-1);
   if(!last)return;
   const run=values[last];if(!run)return;
   OUT.textContent=String(run.output||"")||"Waiting for output…";
   $("runStatus").textContent=run.status==="running"?"Running for everyone · "+(run.byName||"member"):("Shared run "+run.status+" · "+(run.byName||"member"));
   STOP.disabled=!sharedRunRunning;
  }));
  if(uid===ownerUid){
   subscriptions.push(onValue(ref(db,REQUEST_ROOT+"/"+id),snap=>{if(room?.id===id)showRequests(snap.val())},err=>notify("Access requests unavailable: "+niceError(err))));
  }
  const presence=ref(db,path(id,"presence/"+uid));
  try{await onDisconnect(presence).remove()}catch(err){console.warn("Presence cleanup:",err)}
  async function touchPresence(){
   if(room?.id!==id||account?.uid!==uid)return;
   try{await set(presence,{name:identity(),at:Date.now()})}catch(err){console.warn("Room presence:",err)}
  }
  void touchPresence();
  presenceTimer=setInterval(()=>void touchPresence(),30000);
  if(!roomIndex[id])void set(ref(db,INDEX_ROOT+"/"+uid+"/"+id),true).catch(()=>{});
 }catch(err){
  if(revision!==roomVersion)return;
  if(ydoc&&!room){ydoc.destroy();ydoc=null;ytext=null}
  $("roomAccessPrompt").hidden=false;
  $("sharedJoinCode").value=id;
  notify("Could not enter room: "+niceError(err)+". You can request access from the owner.");
 }finally{if(openingRoom===id)openingRoom=""}
}
function getRoomInput(){
 const val=$("sharedJoinCode").value.trim();
 if(!val)return"";
 try{const parsed=new URL(val);return parsed.searchParams.get("room")||""}catch{return val}
}
async function requestRoomAccess(){
 const id=getRoomInput();
 if(!safeRoomId(id)||!account)return notify("Sign in and paste a valid room link or code.");
 wanted=id;
 try{
  await set(ref(db,REQUEST_ROOT+"/"+id+"/"+account.uid),{name:identity(),at:Date.now()});
  notify("Access requested. The room owner must approve you. Keep or reopen this invite link.");
  $("roomAccessPrompt").hidden=false;
 }catch(err){notify("Access request failed: "+niceError(err))}
}
async function createRoom(){
 if(!account||room)return notify("Leave the current room before creating another.");
 const title=(window.prompt("Name your shared Python room:","Python team")||"").trim().slice(0,80);
 if(!title)return;
 const uid=account.uid,id=push(ref(db,ROOM_ROOT)).key;
 const seed=new Y.Doc();seed.getText("code").insert(0,CODE.value.slice(0,MAX_LENGTH));
 const state=to64(Y.encodeStateAsUpdate(seed));seed.destroy();
 try{
  notify("Creating your private collaboration room…");
  await set(ref(db,path(id)),{ownerUid:uid,title,members:{[uid]:true},document:{state,updatedAt:Date.now()},createdAt:Date.now()});
  await set(ref(db,INDEX_ROOT+"/"+uid+"/"+id),true);
  await joinRoom(id);
  notify("Room created! Copy the invite link. Visitors request access; you approve them.");
 }catch(err){notify("Could not create room: "+niceError(err))}
}
function refreshRoomList(){
 const selected=SELECT.value;SELECT.replaceChildren();
 for(const id of Object.keys(roomIndex||{}).filter(safeRoomId)){
  const option=document.createElement("option");option.value=id;option.textContent=id.slice(0,9)+"…";SELECT.append(option);
 }
 if(selected&&roomIndex[selected])SELECT.value=selected;
 else SELECT.selectedIndex=-1;
}
function syncRoomIndex(user){
 if(accountIndexOff){accountIndexOff();accountIndexOff=null}
 roomIndex={};refreshRoomList();
 if(!user)return;
 const uid=user.uid;
 accountIndexOff=onValue(ref(db,INDEX_ROOT+"/"+uid),snap=>{
  if(account?.uid!==uid)return;
  roomIndex=snap.val()||{};refreshRoomList();
  if(wanted&&safeRoomId(wanted)&&roomIndex[wanted]&&!room)void joinRoom(wanted);
 },err=>notify("Cannot list shared rooms: "+niceError(err)));
}
onAuthStateChanged(auth,async user=>{
 const previous=account?.uid;
 if(previous!==user?.uid&&room)await leaveRoom();
 account=user||null;
 $("sharedOwnUid").textContent=account?.uid||"Sign in first";
 $("sharedCopyUid").disabled=!account;
 $("sharedCreateRoom").disabled=!account;
 $("sharedJoinRoom").disabled=!account;
 $("sharedJoinCode").disabled=!account;
 $("sharedRoomList").disabled=!account;
 $("sharedOpenRoom").disabled=!account;
 syncRoomIndex(account);
 if(!account){notify("Sign in through Community Hub before creating or joining a room.");return}
 if(wanted&&!roomIndex[wanted]&&safeRoomId(wanted))void joinRoom(wanted);
 else notify("Create a room or open one from your private list.");
});

$("sharedCopyUid").addEventListener("click",async()=>{if(account){await copy(account.uid);notify("Your account ID is ready to share with a room owner.")}});
$("sharedCreateRoom").addEventListener("click",()=>void createRoom());
$("sharedJoinRoom").addEventListener("click",()=>void joinRoom(getRoomInput()));
$("sharedJoinCode").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();void joinRoom(getRoomInput())}});
$("sharedRequestAccess").addEventListener("click",()=>void requestRoomAccess());
$("sharedOpenRoom").addEventListener("click",()=>void joinRoom(SELECT.value));
SELECT.addEventListener("dblclick",()=>void joinRoom(SELECT.value));
$("sharedCopyLink").addEventListener("click",async()=>{if(room){await copy(roomLink(room.id));notify("Invite link copied. Others must be approved before joining.")}});
$("sharedLeaveRoom").addEventListener("click",()=>void leaveRoom());
$("sharedInviteMember").addEventListener("click",()=>void invite($("sharedInviteUid").value));
window.addEventListener("beforeunload",e=>{if(room&&(pending.length||writing)){e.preventDefault();e.returnValue=""}});

// Run for everyone: only the initiating client executes Python, then publishes
// its output to the approved members. Participants do not re-execute it.
async function postSharedRun(final=false,ok=true){
 if(!sharedRunKey||!room||!account)return;
 const id=sharedRunKey,output=sharedRunValue.slice(0,59000);
 const patch={output};
 if(final){patch.status=ok?"done":"error";patch.endedAt=Date.now()}
 try{await update(ref(db,path(room.id,"runs/"+id)),patch)}
 catch(err){notify("Shared console update failed: "+niceError(err))}
}
function queueRunOutput(){
 clearTimeout(sharedRunTimer);
 sharedRunTimer=setTimeout(()=>void postSharedRun(),280);
}
async function stopSharedRun(publish=true){
 if(sharedWorker){sharedWorker.terminate();sharedWorker=null}
 clearTimeout(sharedRunTimeout);clearTimeout(sharedRunTimer);
 sharedWorkerSeq++;sharedRunRunning=false;STOP.disabled=true;RUN.disabled=false;
 const id=sharedRunKey;
 if(publish&&id&&room){
  try{await update(ref(db,path(room.id,"runs/"+id)),{output:sharedRunValue.slice(0,59000),status:"stopped",endedAt:Date.now()})}
  catch(err){notify("Stop failed: "+niceError(err))}
 }
 sharedRunKey=null;
}
async function runForEveryone(){
 if(!room||!account||sharedRunRunning)return;
 if(CODE.value.length>MAX_LENGTH)return notify("Shared program exceeds the 20,000-character limit.");
 if($("programInput").value.length>6000)return notify("Program input is too long.");
 if(pending.length||writing)await flush();
 if(!room)return;
 const id=push(ref(db,path(room.id,"runs"))).key;
 const roomId=room.id,uid=account.uid;
 try{
  await set(ref(db,path(roomId,"runs/"+id)),{
   byUid:uid,byName:identity(),code:CODE.value,input:$("programInput").value,
   output:"",status:"running",startedAt:Date.now()
  });
 }catch(err){notify("Could not start shared run: "+niceError(err));return}
 let instance;
 try{instance=new Worker("./python-runner-worker.mjs",{type:"module"})}
 catch(err){
  await update(ref(db,path(roomId,"runs/"+id)),{output:niceError(err),status:"error",endedAt:Date.now()}).catch(()=>{});
  return;
 }
 sharedWorker=instance;sharedRunKey=id;sharedRunValue="";sharedRunRunning=true;
 const execution=++sharedWorkerSeq;
 RUN.disabled=true;STOP.disabled=false;
 $("runStatus").textContent="Loading Python for everyone…";
 function append(text){
  sharedRunValue=(sharedRunValue+String(text||"")).slice(0,59000);
  OUT.textContent=sharedRunValue;queueRunOutput();
 }
 instance.onmessage=async e=>{
  if(sharedWorker!==instance||sharedWorkerSeq!==execution||room?.id!==roomId)return;
  const msg=e.data||{};if(msg.id!==execution)return;
  if(msg.type==="output")append(msg.value);
  if(msg.type==="status"){
   $("runStatus").textContent=msg.value;
   if(msg.value==="Running Python…"){
    clearTimeout(sharedRunTimeout);
    sharedRunTimeout=setTimeout(async()=>{
     if(sharedWorker!==instance||sharedWorkerSeq!==execution)return;
     append("\n[Stopped after 20 seconds.]\n");
     await stopSharedRun(true);
    },20000);
   }
  }
  if(msg.type==="done"){
   clearTimeout(sharedRunTimer);clearTimeout(sharedRunTimeout);
   await postSharedRun(true,!!msg.ok);
   if(sharedWorker===instance&&sharedWorkerSeq===execution){
    instance.terminate();sharedWorker=null;sharedRunKey=null;sharedRunRunning=false;
    RUN.disabled=false;STOP.disabled=true;
   }
  }
 };
 instance.onerror=e=>{
  if(sharedWorker!==instance||sharedWorkerSeq!==execution)return;
  append("\nPython execution error: "+String(e.message||"Worker failed")+"\n");
  void postSharedRun(true,false).then(()=>stopSharedRun(false));
 };
 instance.postMessage({id:execution,code:CODE.value,stdin:$("programInput").value});
}
RUN.addEventListener("click",e=>{
 if(!room)return;
 e.preventDefault();e.stopImmediatePropagation();void runForEveryone();
},true);
STOP.addEventListener("click",e=>{
 if(!room)return;
 e.preventDefault();e.stopImmediatePropagation();void stopSharedRun(true);
},true);
$("clearOutput").addEventListener("click",e=>{
 if(!room)return;
 e.preventDefault();e.stopImmediatePropagation();
 OUT.textContent="Output cleared on this screen. Run again to share a new output.";
},true);

})();
