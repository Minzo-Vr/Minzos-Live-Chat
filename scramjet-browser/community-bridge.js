// Community Chat <-> Scramjet bridge. Only accept the configured GitHub Pages origin.
const COMMUNITY_ORIGIN="https://minzo-vr.github.io";
function activePage(){
  const frame=document.getElementById("sj-frame");
  if(!frame||!frame.contentDocument)throw Error("Open a website in Scramjet first.");
  try{const doc=frame.contentDocument;if(!doc?.documentElement)throw Error("Page not loaded.");return doc}
  catch{throw Error("Scramjet does not expose this page's HTML for inspection.")}
}
function treeFor(doc){
  const root=doc.documentElement,rows=[],nodes=new Map();let id=0;
  function walk(el,depth){
    if(rows.length>=1500||depth>22)return;
    const key=String(++id);nodes.set(key,el);
    const attrs=Array.from(el.attributes).slice(0,8).map(a=>" "+a.name+'="'+String(a.value??"").slice(0,90)+'"').join("");
    const directText=Array.from(el.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent??"").join(" ").trim().slice(0,110);
    rows.push({id:key,depth,tag:String(el.tagName??"unknown").toLowerCase(),attrs,text:directText,children:el.children.length});
    for(const child of el.children)walk(child,depth+1);
  }
  walk(root,0);window.__communityInspectedNodes=nodes;return rows;
}
window.addEventListener("message",async event=>{
  if(event.origin!==COMMUNITY_ORIGIN||event.source!==window.parent)return;
  const msg=event.data;if(!msg||typeof msg!=="object")return;
  if(msg.type==="community-browser-navigate"){
    const query=msg.query;if(typeof query!=="string"||!query.trim()||query.length>2000)return;
    const input=document.getElementById("sj-address"),form=document.getElementById("sj-form");
    if(input&&form){input.value=query.trim();form.requestSubmit()}return;
  }
  if(!["community-elements-tree","community-elements-edit"].includes(msg.type))return;
  const reply=(payload)=>event.source.postMessage({type:"community-elements-response",requestId:msg.requestId,...payload},event.origin);
  try{
    const doc=activePage();
    if(msg.type==="community-elements-tree"){reply({rows:treeFor(doc),pageTitle:doc.title});return}
    const el=window.__communityInspectedNodes?.get(String(msg.id));
    if(!el||!el.isConnected||el.ownerDocument!==doc)throw Error("Element changed. Refresh the Elements tree.");
    if(typeof msg.html!=="string"||msg.html.length>30000)throw Error("HTML edit is too large.");
    const template=doc.createElement("template");template.innerHTML=msg.html;
    if(template.content.childNodes.length!==1||template.content.firstChild.nodeType!==1)throw Error("Provide one HTML element.");
    const replacement=template.content.firstElementChild;
    if(replacement.querySelector("script,iframe,object,embed")||replacement.matches("script,iframe,object,embed"))throw Error("Executable or embedded content is not supported.");
    for(const node of [replacement,...replacement.querySelectorAll("*")]){
      for(const attr of [...node.attributes])if(/^on/i.test(attr.name)||["srcdoc","javascript:"].some(x=>attr.name==="srcdoc"||String(attr.value??"").trim().toLowerCase().startsWith(x)))node.removeAttribute(attr.name);
    }
    el.replaceWith(replacement);reply({success:true,rows:treeFor(doc)});
  }catch(error){reply({error:String(error.message||error)})}
});
