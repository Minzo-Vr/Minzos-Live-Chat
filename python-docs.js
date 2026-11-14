/* File-first Python workspace. Existing private project and Yjs room code
   remain the source of truth; this layer only changes navigation/presentation. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const grid=$("pythonFileGrid"),list=$("projectList"),rooms=$("sharedRoomList");
const state={filter:"all",open:false};
const icon=(shared)=>shared?
 '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="23" cy="24" r="9"/><circle cx="43" cy="24" r="8"/><path d="M6 52c0-12 8-19 17-19s17 7 17 19M37 37c9-3 21 3 21 15"/></svg>':
 '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 14h19l11 11v27H18z"/><path d="M37 14v11h11M24 34h17M24 41h17M24 48h11"/></svg>';
function currentRoom(){return !!window.PythonCollab?.active?.()}
function openEditor(){
 document.body.classList.remove("python-home");
 state.open=true;
 updateTitle();
 window.scrollTo({top:0,behavior:"instant"});
}
function showHome(){
 if(currentRoom()){
  // Keep the room open until the user explicitly leaves; no unsynced
  // collaboration edits are discarded by changing the visible page.
 }
 document.body.classList.add("python-home");
 state.open=false;
 render();
 window.scrollTo({top:0,behavior:"instant"});
}
function updateTitle(){
 const shared=currentRoom();
 const name=shared?($("sharedEditorTitle").textContent||"Shared Python file"):($("projectName").value.trim()||"Untitled Python file");
 $("pythonDocumentTitle").textContent=name;
 $("pythonDocumentSubtitle").textContent=shared?"Live shared document":"Private Python document";
 $("pythonDocumentSaveState").textContent=shared?($("sharedStatus").textContent||"Syncing"):$("dirtyState").textContent;
}
function card({name,type,date,id}){
 const article=document.createElement("article");
 article.className="python-file-card"+(type==="shared"?" shared":"");
 const button=document.createElement("button");
 button.type="button";button.className="python-file-open";
 const thumb=document.createElement("span");thumb.className="python-file-thumbnail";thumb.innerHTML=icon(type==="shared");
 const title=document.createElement("strong");title.className="python-file-name";title.textContent=name;
 const meta=document.createElement("span");meta.className="python-file-meta";
 meta.textContent=type==="shared"?"Shared Python room":"Python script · .py";
 button.append(thumb,title,meta);
 const footer=document.createElement("div");footer.className="python-file-card-footer";
 const time=document.createElement("span");time.textContent=date||"Saved to your account";
 const open=document.createElement("button");open.type="button";open.textContent="Open";
 const activate=()=>{
  if(type==="shared"){
   if(currentRoom()&&$("sharedEditorTitle").textContent===name){openEditor();return;}
   rooms.value=id;
   $("sharedOpenRoom").click();
   // The room-change event opens the document once Firebase authorizes it.
  }else{
   if(currentRoom()){ $("sharedStatus").textContent="Leave the shared room before opening a private file.";openEditor();document.body.classList.add("python-sidebar-open");return; }
   list.value=id;
   $("loadProject").click();
   if($("projectName").value.trim()===name){openEditor();}
  }
 };
 button.addEventListener("click",activate);
 open.addEventListener("click",activate);
 footer.append(time,open);article.append(button,footer);
 return article;
}
function parseRooms(){
 return [...rooms.options].filter(opt=>opt.value&&opt.textContent.trim()).map(opt=>({
  name:opt.textContent.replace(/\s+\(.*?\)\s*$/,"").trim(),
  id:opt.value,type:"shared"
 }));
}
function render(){
 const personal=[...list.options].filter(opt=>opt.value).map(opt=>({
  name:opt.textContent.trim()||"Untitled Python file",id:opt.value,type:"mine"
 }));
 const shared=parseRooms();
 const all=state.filter==="mine"?personal:state.filter==="shared"?shared:[...personal,...shared];
 grid.replaceChildren();
 for(const file of all)grid.append(card(file));
 if(!all.length){
  const empty=document.createElement("div");empty.className="python-file-empty";
  empty.textContent=state.filter==="shared"?"No shared rooms yet. Join a room or create one from Collaborate.":state.filter==="mine"?"No saved Python files yet. Create your first file!":"No Python files here yet. Click New Python file to get started.";
  grid.append(empty);
 }
 $("pythonHomeCount").textContent=all.length+" "+(all.length===1?"file":"files");
 const account=$("accountState").textContent||"";
 $("pythonHomeHint").textContent=/Sign in/i.test(account)?
  "Sign in through Community Hub to access your private files and shared rooms.":
  "Your private files are saved to your account. Shared rooms are only visible to invited members.";
}
function newFile(){
 if(currentRoom()){
  $("sharedLeaveRoom").click();
 }
 $("newProject").click();
 openEditor();
 $("projectName").focus();
 $("projectName").select();
}
$("pythonHomeNew").addEventListener("click",newFile);
$("pythonBackFiles").addEventListener("click",showHome);
$("pythonHomeJoin").addEventListener("click",()=>{
 openEditor();document.body.classList.add("python-sidebar-open");
 $("sharedJoinCode").focus();
 $("sharedJoinCode").scrollIntoView({block:"center",behavior:"smooth"});
});
for(const button of document.querySelectorAll("[data-python-filter]")){
 button.addEventListener("click",()=>{
  state.filter=button.dataset.pythonFilter;
  for(const other of document.querySelectorAll("[data-python-filter]")){
   const active=other===button;
   other.classList.toggle("active",active);
   other.setAttribute("aria-pressed",String(active));
  }
  render();
 });
}
const watch=new MutationObserver(()=>{
 render();
 if(state.open)updateTitle();
});
for(const el of [list,rooms,$("accountState"),$("dirtyState"),$("sharedStatus"),$("sharedEditorTitle")]){
 watch.observe(el,{childList:true,characterData:true,subtree:true,attributes:el===list||el===rooms});
}
$("projectName").addEventListener("input",updateTitle);
document.addEventListener("python-collab-room-change",()=>{
 if(currentRoom())openEditor();
 else if(state.open)updateTitle();
 render();
});
document.addEventListener("visibilitychange",()=>{if(!document.hidden)render()});
const params=new URLSearchParams(location.search);
if(params.has("room"))openEditor();
else showHome();
render();
})();