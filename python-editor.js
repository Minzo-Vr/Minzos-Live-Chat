/* Community Hub Python Editor: per-account private Firebase projects.
 * The Firebase rules, not the browser UI, enforce account isolation.
 */
import {initializeApp,getApps} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {getDatabase,ref,onValue,push,set,remove,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

(()=>{
 "use strict";
 const $=id=>document.getElementById(id);
 const ROOT="hubPythonProjects";
 const MAX_CODE=20000;
 const shared=()=>window.PythonCollab?.active?.()===true;
 const MAX_PROJECTS=40;
 const DEFAULT_CODE='# Hello from Community Hub!\nname = "Python"\nfor count in range(1, 4):\n    print(f"{count}. Hello, {name}!")';
 const config={
  apiKey:"AIzaSyB4wOgGUTR-fgweHtsJiK9XyykU_PND0GE",
  authDomain:"website-chat-80038.firebaseapp.com",
  databaseURL:"https://website-chat-80038-default-rtdb.firebaseio.com/",
  projectId:"website-chat-80038",
  appId:"1:42470201717:web:890e9ebf1f0865c8ea9b3c"
 };
 const app=getApps().find(a=>a.name==="[DEFAULT]")||initializeApp(config);
 const auth=getAuth(app),db=getDatabase(app);
 let account=null,projects={},stopProjects=null,currentId=null,dirty=true,saving=false;
 let worker=null,runId=0,running=false,killTimer=null,outputCount=0;
 const projectList=$("projectList"),nameInput=$("projectName"),codeInput=$("pythonCode"),status=$("cloudStatus");
 const cloudPath=uid=>ROOT+"/"+uid;
 function say(message){status.textContent=message;}
 function errorMessage(e){
  const msg=String(e?.code||e?.message||e||"unknown error");
  return /permission.denied/i.test(msg)?"Access denied. The private Python projects Firebase rules need to be published.":msg.slice(0,180);
 }
 function markDirty(){
  dirty=true;
  $("dirtyState").textContent="Unsaved changes";
  $("sizeState").textContent=codeInput.value.length.toLocaleString()+" / "+MAX_CODE.toLocaleString()+" characters";
  refreshButtons();
 }
 function markSaved(){
  dirty=false;
  $("dirtyState").textContent=currentId?"Saved to account":"Not saved";
  $("sizeState").textContent=codeInput.value.length.toLocaleString()+" / "+MAX_CODE.toLocaleString()+" characters";
  refreshButtons();
 }
 function refreshButtons(){
  const signed=!!account;
  projectList.disabled=!signed||shared();
  $("newProject").disabled=shared();
  $("importCode").disabled=shared();
  nameInput.disabled=shared();
  $("saveProject").disabled=shared()||!signed||saving||nameInput.value.trim().length===0||codeInput.value.length>MAX_CODE;
  $("deleteProject").disabled=shared()||!signed||saving||!projectList.value||!projects[projectList.value];
  $("loadProject").disabled=shared()||!signed||saving||!projectList.value||!projects[projectList.value];
  $("accountState").textContent=signed?"☁ Signed in as "+(account.displayName||account.email||"your account"):"🔒 Sign in to Community Hub to save";
 }
 function renderList(){
  const prior=projectList.value;
  projectList.replaceChildren();
  for(const [id,entry] of Object.entries(projects).filter(([,p])=>p&&typeof p.code==="string").sort((a,b)=>(b[1].updatedAt||0)-(a[1].updatedAt||0))){
   const option=document.createElement("option");option.value=id;
   option.textContent=String(entry.name||"Untitled").slice(0,60);
   projectList.append(option);
  }
  if(prior&&projects[prior])projectList.value=prior;
  else if(currentId&&projects[currentId])projectList.value=currentId;
  else projectList.selectedIndex=-1;
  refreshButtons();
 }
 function checkUnsaved(){return !dirty||confirm("Discard the unsaved code currently in your editor?");}
 function newProject(){
  if(shared())return say("Leave the shared room to manage private projects.");
  if(!checkUnsaved())return;
  currentId=null;nameInput.value="Untitled script";codeInput.value="# Start writing your Python here\nprint('Hello!')\n";
  projectList.selectedIndex=-1;markDirty();codeInput.focus();
  say(account?"New unsaved script. Press Save to store it privately.":"Sign in to Community Hub before saving.");
 }
 function loadSelected(){
  if(shared())return say("Leave the shared room to load a private project.");
  const id=projectList.value,project=projects[id];
  if(!account||!project)return;
  if(!checkUnsaved())return;
  currentId=id;
  nameInput.value=String(project.name||"Untitled").slice(0,60);
  codeInput.value=String(project.code||"");
  markSaved();
  say("Loaded privately saved project: "+nameInput.value);
 }
 async function saveProject(){
  if(shared())return say("Shared room changes save automatically. Leave the room to save privately.");
  if(!account||saving)return say("Sign in first to save this script.");
  const name=nameInput.value.trim(),code=codeInput.value;
  if(!name||name.length>60)return say("Project name must be 1–60 characters.");
  if(code.length>MAX_CODE)return say("Code exceeds "+MAX_CODE.toLocaleString()+" characters.");
  if(!currentId&&Object.keys(projects).length>=MAX_PROJECTS)return say("This editor supports up to "+MAX_PROJECTS+" saved projects per account.");
  const uid=account.uid;
  const id=currentId||push(ref(db,cloudPath(uid))).key;
  saving=true;refreshButtons();say("Saving privately to your account…");
  try{
   await set(ref(db,cloudPath(uid)+"/"+id),{name,code,updatedAt:serverTimestamp()});
   if(account?.uid!==uid)return;
   currentId=id;projects[id]={name,code,updatedAt:Date.now()};
   renderList();projectList.value=id;markSaved();
   say("Saved to your account. Only this Firebase UID can access the project.");
  }catch(err){say("Save failed: "+errorMessage(err));}
  finally{saving=false;refreshButtons();}
 }
 async function deleteSelected(){
  if(shared())return say("Leave the shared room to delete private projects.");
  if(!account||saving)return;
  const id=projectList.value,project=projects[id];if(!project)return;
  if(!confirm("Permanently delete '"+String(project.name||"Untitled").slice(0,60)+"' from your account?"))return;
  const uid=account.uid;
  saving=true;refreshButtons();say("Deleting project…");
  try{
   await remove(ref(db,cloudPath(uid)+"/"+id));
   if(account?.uid!==uid)return;
   delete projects[id];
   if(currentId===id){
    currentId=null;nameInput.value="Untitled script";codeInput.value=DEFAULT_CODE;dirty=true;
   }
   renderList();markDirty();say("Project deleted from your account.");
  }catch(err){say("Delete failed: "+errorMessage(err));}
  finally{saving=false;refreshButtons();}
 }
 document.addEventListener("python-collab-room-change",refreshButtons);
 nameInput.addEventListener("input",markDirty);
 codeInput.addEventListener("input",markDirty);
 codeInput.addEventListener("keydown",event=>{
  if(event.key!=="Tab")return;
  event.preventDefault();
  const a=codeInput.selectionStart,b=codeInput.selectionEnd;
  codeInput.setRangeText("    ",a,b,"end");markDirty();
  if(shared())codeInput.dispatchEvent(new Event("input",{bubbles:true}));
 });
 projectList.addEventListener("change",refreshButtons);
 $("newProject").addEventListener("click",newProject);
 $("loadProject").addEventListener("click",loadSelected);
 projectList.addEventListener("dblclick",loadSelected);
 $("saveProject").addEventListener("click",()=>void saveProject());
 $("deleteProject").addEventListener("click",()=>void deleteSelected());
 $("importCode").addEventListener("click",()=>{if(shared())return say("Leave the shared room before importing into private projects.");$("importFile").click();});
 $("importFile").addEventListener("change",async()=>{
  const file=$("importFile").files?.[0];$("importFile").value="";
  if(!file||shared())return;
  if(file.size>MAX_CODE*4)return say("File too large. Maximum "+MAX_CODE+" characters of code.");
  if(!checkUnsaved())return;
  try{
   const contents=await file.text();
   if(contents.length>MAX_CODE)throw Error("File code exceeds "+MAX_CODE+" characters.");
   currentId=null;projectList.selectedIndex=-1;
   nameInput.value=file.name.replace(/\.(py|txt)$/i,"").slice(0,60)||"Imported script";
   codeInput.value=contents;markDirty();say("Imported locally. Press Save to store it in your account.");
  }catch(err){say("Import failed: "+errorMessage(err));}
 });
 $("exportCode").addEventListener("click",()=>{
  const name=(nameInput.value.trim()||"python-project").replace(/[^a-z0-9_-]+/gi,"_").slice(0,55);
  const blob=new Blob([codeInput.value],{type:"text/x-python;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");anchor.href=url;anchor.download=name+".py";
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 onAuthStateChanged(auth,user=>{
  const uid=user?.uid||null,prior=account?.uid||null;
  account=user||null;
  if(uid===prior){refreshButtons();return;}
  if(stopProjects){stopProjects();stopProjects=null;}
  projects={};currentId=null;
  nameInput.value="My first Python script";codeInput.value=DEFAULT_CODE;markDirty();
  renderList();
  if(!uid){say("Sign in to Community Hub first. Your projects will not be available to other accounts.");return;}
  say("Loading your private Python projects…");
  stopProjects=onValue(ref(db,cloudPath(uid)),snap=>{
   if(account?.uid!==uid)return;
   projects=snap.val()||{};
   renderList();
   say(Object.keys(projects).length+" private project(s) found. Select one and press Load.");
  },err=>{
   if(account?.uid===uid){projects={};renderList();say("Could not load projects: "+errorMessage(err));}
  });
 },err=>say("Sign-in check failed: "+errorMessage(err)));

 function appendOutput(value){
  if(outputCount>60000)return;
  const chunk=String(value||"").slice(0,60000-outputCount);
  outputCount+=chunk.length;
  $("console").textContent+=chunk;
  $("console").scrollTop=$("console").scrollHeight;
  if(outputCount>=60000)$("console").textContent+="\n[Output truncated at 60,000 characters]\n";
 }
 function resetRun(){
  running=false;clearTimeout(killTimer);killTimer=null;
  $("runCode").disabled=false;$("stopCode").disabled=true;
 }
 function stopRun(message="Stopped."){
  if(worker){worker.terminate();worker=null;}
  runId++;resetRun();$("runStatus").textContent=message;
 }
 $("stopCode").addEventListener("click",()=>stopRun("Stopped by user."));
 $("clearOutput").addEventListener("click",()=>{$("console").textContent="";outputCount=0;});
 $("runCode").addEventListener("click",()=>{
  if(running)return;
  if(!window.Worker)return $("runStatus").textContent="This browser does not support Web Workers.";
  if(codeInput.value.length>MAX_CODE)return $("runStatus").textContent="Code exceeds editor limit.";
  if(!worker){
   try{worker=new Worker("./python-runner-worker.mjs",{type:"module"});}
   catch(err){return $("runStatus").textContent="Cannot start Python: "+errorMessage(err);}
  }
  const instance=worker,id=++runId;
  running=true;outputCount=0;$("console").textContent="";
  $("runCode").disabled=true;$("stopCode").disabled=false;
  $("runStatus").textContent="Starting Python…";
  instance.onmessage=event=>{
   if(instance!==worker||id!==runId||event.data?.id!==id)return;
   const message=event.data;
   if(message.type==="output")appendOutput(message.value);
   if(message.type==="status"){
    $("runStatus").textContent=message.value;
    if(message.value==="Running Python…"){
     clearTimeout(killTimer);
     killTimer=setTimeout(()=>{
      appendOutput("\n[Execution stopped after 20 seconds. Please check your code.]\n");
      stopRun("Stopped: 20-second execution limit.");
     },20000);
    }
   }
   if(message.type==="done"){
    resetRun();$("runStatus").textContent=message.ok?"Finished.":"Python finished with an error.";
   }
  };
  instance.onerror=event=>{
   if(instance!==worker||id!==runId)return;
   appendOutput("\nPython worker failed: "+String(event.message||"Could not load engine")+"\n");
   stopRun("Python engine error.");
  };
  instance.postMessage({id,code:codeInput.value,stdin:$("programInput").value});
 });
 $("sizeState").textContent=codeInput.value.length+" / "+MAX_CODE+" characters";
 refreshButtons();
})();
