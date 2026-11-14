/* Simple Python + MIP Advanced Python modes.
 * Existing Firebase role key "plus" remains stable: MIP is its display name.
 * Advanced-only buttons are a user-interface entitlement, not data security.
 */
import {initializeApp,getApps} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {getDatabase,ref,onValue} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

(()=>{
"use strict";
const $=id=>document.getElementById(id);
const config={
 apiKey:"AIzaSyB4wOgGUTR-fgweHtsJiK9XyykU_PND0GE",
 authDomain:"website-chat-80038.firebaseapp.com",
 databaseURL:"https://website-chat-80038-default-rtdb.firebaseio.com/",
 projectId:"website-chat-80038",
 appId:"1:42470201717:web:890e9ebf1f0865c8ea9b3c"
};
const app=getApps().find(a=>a.name==="[DEFAULT]")||initializeApp(config);
const auth=getAuth(app),db=getDatabase(app);
const simple=$("pythonSimpleMode"),advanced=$("pythonAdvancedMode"),status=$("pythonModeStatus"),editor=$("pythonCode");
let user=null,roles=null,claimAdmin=false,billing=null,offRoles=null,offBilling=null,authenticationVersion=0,sidebarSection=null;
const starter=['# Welcome to Simple Python!','print("Hello, world!")','','for number in range(1, 4):','    print("Number:", number)'].join("\n");
const snippets={
 function:['def greet(name):','    print("Hello,", name)','','greet("Minzo")'].join("\n"),
 class:['class Player:','    def __init__(self, name):','        self.name = name','','    def say_hello(self):','        print("Hello from", self.name)'].join("\n"),
 try:['try:','    number = int(input("Enter a number: "))','    print(number * 2)','except ValueError:','    print("Please enter a number.")'].join("\n"),
 json:['import json','','data = json.loads(\'{"game": "Minzo", "players": 4}\')','print(data["game"])'].join("\n")
};
const examples={
 hello:starter,
 loops:['# Repeat a message','for number in range(1, 6):','    print("Level", number)'].join("\n"),
 calculator:['# A simple calculator','first = 12','second = 4','print("Add:", first + second)','print("Multiply:", first * second)'].join("\n"),
 guess:['# Guess a number!','secret = 7','guess = int(input("Choose a number from 1 to 10: "))','if guess == secret:','    print("You win!")','else:','    print("Try again!")'].join("\n")
};
function rawRoles(value){
 if(typeof value==="string")return new Set([value]);
 if(!value||typeof value!=="object")return new Set();
 return new Set(Object.keys(value).filter(key=>value[key]===true));
}
function paidMIP(){
 const now=Date.now();
 return ["stripe","apple"].some(source=>billing?.[source]?.active===true&&
  Number(billing[source].expiresAt)>now);
}
function allowed(){
 return !!user&&(claimAdmin||rawRoles(roles).has("admin")||rawRoles(roles).has("plus")||paidMIP());
}
function mode(next){
 if(next==="advanced"&&!allowed()){
  setStatus("Advanced Python requires the MIP role. Ask a Community Hub admin about access.");
  return false;
 }
 const isAdvanced=next==="advanced";
 document.body.classList.toggle("python-advanced",isAdvanced);
 document.body.classList.remove("python-sidebar-open");sidebarSection=null;
 simple.classList.toggle("active",!isAdvanced);
 advanced.classList.toggle("active",isAdvanced);
 simple.setAttribute("aria-pressed",String(!isAdvanced));
 advanced.setAttribute("aria-pressed",String(isAdvanced));
 $("simpleProjects").setAttribute("aria-expanded","false");
 $("simpleCollaborate").setAttribute("aria-expanded","false");
 setStatus(isAdvanced?"MIP Advanced Python · More editor tools enabled":
  allowed()?"Simple Python · MIP Advanced mode available":"Simple Python · Advanced tools require MIP");
 return true;
}
function setStatus(message){status.textContent=message}
function renderEligibility(){
 const ok=allowed();
 advanced.disabled=!ok;
 advanced.title=ok?"Switch to MIP Advanced Python":"Requires MIP or Admin role";
 if(!ok&&document.body.classList.contains("python-advanced"))mode("simple");
 else setStatus(document.body.classList.contains("python-advanced")?
  "MIP Advanced Python · More editor tools enabled":
  ok?"Simple Python · MIP Advanced mode available":
  user?"Simple Python · Advanced tools require MIP":"Simple Python · Sign in to save; MIP unlocks Advanced");
}
function changeCode(next){
 if(next.length>20000)return;
 if(window.PythonCollab?.active?.()){
  if(!confirm("Replace the code in this shared room for all collaborators?"))return;
 }else if(editor.value!==next&&!confirm("Replace your current Python code? Unsaved edits will be lost."))return;
 editor.value=next;
 editor.dispatchEvent(new Event("input",{bubbles:true}));
 editor.focus();
 editor.setSelectionRange(0,0);
}
function reveal(section){
 const opened=!document.body.classList.contains("python-sidebar-open")||sidebarSection!==section;
 sidebarSection=opened?section:null;
 document.body.classList.toggle("python-sidebar-open",opened);
 $("simpleProjects").setAttribute("aria-expanded",String(opened&&section==="projects"));
 $("simpleCollaborate").setAttribute("aria-expanded",String(opened&&section==="collab"));
 if(opened){
  const where=$(section==="collab"?"pythonSidebar":"pythonPrivateProjects");
  where?.scrollIntoView({block:"start",behavior:"smooth"});
 }
}
simple.addEventListener("click",()=>mode("simple"));
advanced.addEventListener("click",()=>mode("advanced"));
$("simpleReset").addEventListener("click",()=>changeCode(starter));
$("simpleSave").addEventListener("click",()=>$("saveProject").click());
$("simpleProjects").addEventListener("click",()=>reveal("projects"));
$("simpleCollaborate").addEventListener("click",()=>reveal("collab"));
$("pythonExamples").addEventListener("change",event=>{
 const key=event.target.value;
 event.target.value="";
 if(examples[key])changeCode(examples[key]);
});
for(const button of document.querySelectorAll("[data-python-snippet]")){
 button.addEventListener("click",()=>{
  if(!document.body.classList.contains("python-advanced")||!allowed())return;
  const value=snippets[button.dataset.pythonSnippet];
  if(!value)return;
  const start=editor.selectionStart,end=editor.selectionEnd;
  const before=editor.value.slice(0,start),after=editor.value.slice(end);
  const prefix=before&&!before.endsWith("\n")?"\n":"";
  const suffix=after&&!after.startsWith("\n")?"\n":"";
  const insertion=prefix+value+suffix;
  if((before+insertion+after).length>20000)return setStatus("Python code is at its 20,000-character limit.");
  editor.setRangeText(insertion,start,end,"end");
  editor.dispatchEvent(new Event("input",{bubbles:true}));
  editor.focus();
 });
}
onAuthStateChanged(auth,async next=>{
 const version=++authenticationVersion;
 if(offRoles){offRoles();offRoles=null}
 if(offBilling){offBilling();offBilling=null}
 user=next||null;roles=null;billing=null;claimAdmin=false;
 mode("simple");
 renderEligibility();
 if(!next)return;
 try{
  const token=await next.getIdTokenResult();
  if(version!==authenticationVersion)return;
  claimAdmin=token.claims?.admin===true;
 }catch{}
 if(version!==authenticationVersion)return;
 renderEligibility();
 offRoles=onValue(ref(db,"chatRoles/"+next.uid),snapshot=>{
  if(version!==authenticationVersion)return;
  roles=snapshot.val();
  renderEligibility();
 },()=>{if(version===authenticationVersion)renderEligibility()});
 // Paid access is also considered when the corresponding database read rules
 // have been deployed. Lack of billing rules must not block manual MIP roles.
 offBilling=onValue(ref(db,"chatBillingEntitlements/"+next.uid),snapshot=>{
  if(version!==authenticationVersion)return;
  billing=snapshot.val();
  renderEligibility();
 },()=>{});
});
window.PythonEditorModes={isAdvanced:()=>document.body.classList.contains("python-advanced"),isMIP:allowed};
renderEligibility();
})();