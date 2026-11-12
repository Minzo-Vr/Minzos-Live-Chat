/* Shared PIN gate for Community Hub's admin interfaces.
 * UI privacy barrier only: authorization must still be enforced by Firebase
 * security rules / server-side Worker checks, not by this public browser file.
 */
(()=>{
 "use strict";
 const DIGEST="115609c5335582ade0da8f19a7e778797a2247532c386aae158d5eb7197dacae";
 const CONTEXT="community-hub-maintenance-unlock:v1:";
 const grants=new Map();
 let active=null,modal=null,input=null,status=null,heading=null,submit=null,lastFocus=null;

 const make=(tag,text)=>{
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  return node;
 };
 function createDialog(){
  if(modal)return;
  modal=make("div");
  modal.id="hubGlobalAdminPin";
  modal.hidden=true;
  modal.setAttribute("role","dialog");
  modal.setAttribute("aria-modal","true");
  modal.setAttribute("aria-labelledby","hubGlobalAdminPinTitle");
  const card=make("section");
  card.className="hub-global-admin-pin-card";
  heading=make("h2","🔐 Admin PIN required");heading.id="hubGlobalAdminPinTitle";
  const expl=make("p","Enter the 4-digit PIN to open this admin area. You must also have a verified Admin account.");
  const form=make("form");form.autocomplete="off";
  const label=make("label","Admin PIN");
  input=make("input");input.id="hubGlobalAdminPinInput";
  input.type="password";input.inputMode="numeric";input.pattern="[0-9]{4}";
  input.maxLength=4;input.minLength=4;input.required=true;input.autocomplete="off";
  label.append(input);
  status=make("p");status.id="hubGlobalAdminPinStatus";
  status.setAttribute("role","status");status.setAttribute("aria-live","polite");
  const actions=make("div");actions.className="hub-global-admin-pin-actions";
  const cancel=make("button","Cancel");cancel.type="button";
  submit=make("button","Unlock admin area");submit.type="submit";
  actions.append(cancel,submit);form.append(label,status,actions);
  card.append(heading,expl,form);modal.append(card);
  document.body.append(modal);
  cancel.addEventListener("click",()=>finish(false));
  modal.addEventListener("click",e=>{if(e.target===modal)finish(false)});
  modal.addEventListener("keydown",e=>{
   if(e.key==="Escape"){e.preventDefault();e.stopPropagation();finish(false);return;}
   if(e.key==="Tab"){
    const focusable=[input,cancel,submit],index=focusable.indexOf(document.activeElement);
    if(e.shiftKey&&index===0){e.preventDefault();submit.focus();}
    else if(!e.shiftKey&&index===2){e.preventDefault();input.focus();}
   }
  });
  form.addEventListener("submit",async e=>{
   e.preventDefault();
   if(!active)return;
   const request=active,entered=input.value;
   submit.disabled=true;status.textContent="Checking PIN…";
   try{
    if(!crypto?.subtle)throw Error("Secure browser context required.");
    const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(CONTEXT+entered));
    const actual=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,"0")).join("");
    if(active!==request)return;
    if(actual===DIGEST){
     grants.set(request.scope,request.uid);
     finish(true);
    }else{
     input.value="";status.textContent="Incorrect PIN. Try again.";input.focus();
    }
   }catch(error){
    if(active===request)status.textContent="Unable to verify PIN in this browser.";
    console.warn("Admin PIN check failed:",error?.message||error);
   }finally{submit.disabled=false;}
  });
 }
 function finish(accepted){
  const pending=active;active=null;
  if(modal)modal.hidden=true;
  if(input)input.value="";
  if(status)status.textContent="";
  if(lastFocus?.isConnected)lastFocus.focus();
  lastFocus=null;
  pending?.resolve(accepted);
 }
 function request({scope="admin",uid="",label="Admin controls"}={}){
  if(active)return Promise.resolve(false);
  if(typeof scope!=="string"||!scope||!document.body)return Promise.resolve(false);
  createDialog();
  lastFocus=document.activeElement;
  heading.textContent="🔐 "+String(label).slice(0,80);
  status.textContent="";
  input.value="";
  submit.disabled=false;
  modal.hidden=false;
  input.focus();
  return new Promise(resolve=>{active={scope,uid:String(uid||""),resolve};});
 }
 const isUnlocked=(uid,scope)=>grants.has(scope)&&grants.get(scope)===String(uid||"");
 const lock=scope=>{grants.delete(scope);if(active?.scope===scope)finish(false);};
 const lockAll=()=>{grants.clear();if(active)finish(false);};
 window.HubAdminPin=Object.freeze({request,isUnlocked,lock,lockAll});
})();
