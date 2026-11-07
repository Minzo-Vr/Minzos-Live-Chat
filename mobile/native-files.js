/* Community Hub native file bridge (bundled only into Capacitor IPA/APK).
 * Public web pages continue using their existing browser file inputs.
 * Files saved in the app's Documents directory survive ordinary app updates.
 */
(()=>{
 "use strict";
 const native=!!window.Capacitor?.isNativePlatform?.();
 if(!native)return;
 const plugins=()=>window.Capacitor?.Plugins||{};
 const folder="CommunityHubImports",directory="DOCUMENTS";
 const allowed={
  model:new Set(["glb","gltf","obj","fbx","stl","ply","dae"]),
  scene:new Set(["json"]),
  yeeps:new Set(["zip"]),
  avatar:new Set(["glb"])
 };
 const maxImportBytes=200*1024*1024,base64FallbackMax=20*1024*1024;
 let panel=null,busy=false;
 const fileName=name=>String(name||"file").split(/[/\\]/).pop().replace(/[^a-zA-Z0-9._() -]/g,"_").slice(0,100)||"file";
 const ext=name=>(name.split(".").pop()||"").toLowerCase();
 const status=text=>{const el=document.getElementById("status");if(el)el.textContent=text};
 function fsPlugin(){const fs=plugins().Filesystem;if(!fs)throw Error("Native Filesystem plugin unavailable. Rebuild the mobile app.");return fs;}
 function pickerPlugin(){const p=plugins().FilePicker;if(!p?.pickFiles)throw Error("Native File Picker unavailable. Rebuild the mobile app.");return p;}
 const normalizeData=data=>typeof data==="string"?data:null;
 function uint8ToBase64(data){
  const u8=new Uint8Array(data),chunkSize=16384;let str="";
  for(let i=0;i<u8.length;i+=chunkSize)str+=String.fromCharCode(...u8.subarray(i,i+chunkSize));
  return btoa(str);
 }
 function base64ToBlob(base64,type){
  const raw=atob(base64),chunks=[];
  for(let i=0;i<raw.length;i+=16384){
   const slice=raw.slice(i,i+16384),bytes=new Uint8Array(slice.length);
   for(let j=0;j<slice.length;j++)bytes[j]=slice.charCodeAt(j);
   chunks.push(bytes);
  }
  return new Blob(chunks,{type:type||"application/octet-stream"});
 }
 function accepted(kind,name){
  return !!allowed[kind]?.has(ext(name));
 }
 function classify(name){
  const suffix=ext(name);
  if(suffix==="json")return "scene";
  if(suffix==="zip")return "yeeps";
  if(allowed.model.has(suffix))return "model";
  return null;
 }
 function labelError(error){
  return String(error?.message||error||"File operation failed").slice(0,240);
 }
 async function blobAtUri(uri,mime){
  const urls=[];
  if(uri)urls.push(uri);
  try{if(uri&&window.Capacitor?.convertFileSrc)urls.unshift(window.Capacitor.convertFileSrc(uri))}catch{}
  for(const url of [...new Set(urls)]){
   try{const response=await fetch(url);if(response.ok)return await response.blob()}catch{}
  }
  throw Error("Unable to read the selected file from the system picker.");
 }
 async function pickedBlob(picked){
  if(picked.blob)return picked.blob;
  for(const uri of [picked.webPath,picked.path]){
   if(!uri)continue;
   try{return await blobAtUri(uri,picked.mimeType)}catch{}
  }
  // Native Filesystem can also read content:// URIs on supported Android versions.
  if(picked.path){
   try{
    const result=await fsPlugin().readFile({path:picked.path});
    const data=normalizeData(result.data);
    if(data)return base64ToBlob(data,picked.mimeType);
   }catch{}
  }
  if(picked.data)return base64ToBlob(picked.data,picked.mimeType);
  throw Error("Could not read this file. Try copying it to On My iPad or Downloads first.");
 }
 async function makeDirectory(){
  await fsPlugin().mkdir({path:folder,directory,recursive:true}).catch(error=>{
   if(!/exist/i.test(String(error?.message||"")))throw error;
  });
 }
 async function storeBlob(blob,originalName,sourceUri,options={}){
  const filesystem=fsPlugin();
  await makeDirectory();
  const name=Date.now()+"-"+fileName(originalName);
  const path=folder+"/"+name;
  const target=await filesystem.getUri({path,directory});
  // Copy the native file directly when possible to avoid base64 and large-memory copies.
  if(sourceUri&&plugins().FilePicker?.copyFile){
   try{
    await plugins().FilePicker.copyFile({from:sourceUri,to:target.uri,overwrite:true});
    return {path,name};
   }catch(error){console.warn("Direct native file copy unavailable",error);}
  }
  if(blob.size>base64FallbackMax){
   if(options.required)throw Error("Files larger than 20 MB need native file copying, which was unavailable.");
   return null; // Can still import once; do not pretend it was saved.
  }
  const data=uint8ToBase64(await blob.arrayBuffer());
  await filesystem.writeFile({path,directory,data,recursive:true});
  return {path,name};
 }
 function restoreName(name){return name.replace(/^\d{13}-/,"");}
 async function storedEntries(){
  const fs=fsPlugin();
  await makeDirectory();
  const result=await fs.readdir({path:folder,directory});
  return (result.files||[]).map(item=>typeof item==="string"?item:item.name)
   .filter(name=>typeof name==="string"&&accepted("model",restoreName(name))||typeof name==="string"&&["json","zip"].includes(ext(name)))
   .sort((a,b)=>b.localeCompare(a));
 }
 async function fromStored(name){
  const path=folder+"/"+name,filesystem=fsPlugin(),uri=await filesystem.getUri({path,directory});
  try{return await blobAtUri(uri.uri,"application/octet-stream")}catch{}
  const result=await filesystem.readFile({path,directory});
  if(typeof result.data!=="string")throw Error("Unable to read saved file.");
  return base64ToBlob(result.data);
 }
 function sendFile(inputId,blob,name){
  const input=document.getElementById(inputId);
  if(!input)throw Error("This editor has no matching import input.");
  const transfer=new DataTransfer();
  transfer.items.add(new File([blob],fileName(name),{type:blob.type||"application/octet-stream",lastModified:Date.now()}));
  input.files=transfer.files;
  input.dispatchEvent(new Event("change",{bubbles:true}));
 }
 async function processPicked(kind,inputId){
  if(busy)return;
  busy=true;
  try{
   status("Opening "+(window.Capacitor?.getPlatform?.()==="ios"?"iPad Files":"device files")+"…");
   const result=await pickerPlugin().pickFiles({limit:1,readData:false});
   const picked=result?.files?.[0];
   if(!picked){status("File selection cancelled");return;}
   const name=fileName(picked.name);
   if(!accepted(kind,name))throw Error("Unsupported "+kind+" file: "+name);
   if(picked.size>maxImportBytes)throw Error("File is too large (maximum 200 MB).");
   status("Reading "+name+"…");
   const blob=await pickedBlob(picked);
   if(blob.size>maxImportBytes)throw Error("File is too large.");
   try{
    const stored=await storeBlob(blob,name,picked.path);
    if(!stored)status(name+" imported · too large to save to My Imports");
   }catch(error){console.warn("Could not preserve native import",error);status(name+" imported · not saved: "+labelError(error));}
   sendFile(inputId,blob,name);
   if(panel&&!panel.hidden)void refreshPanel();
  }catch(error){
   const message=labelError(error);
   if(!/cancel|dismiss/i.test(message)){status("Import failed: "+message);console.error("Native import",error);}
  }finally{busy=false;}
 }
 function makeButton(label,click){
  const button=document.createElement("button");button.type="button";button.textContent=label;
  button.style.cssText="background:#31588d;color:#fff;border:1px solid #7198d3;border-radius:8px;padding:8px 11px;cursor:pointer";
  button.addEventListener("click",click);return button;
 }
 async function refreshPanel(){
  if(!panel)return;
  const list=panel.querySelector(".community-native-list");
  list.replaceChildren();
  try{
   const entries=await storedEntries();
   if(!entries.length){
    const empty=document.createElement("p");empty.textContent="No imported files yet. Choose Import 3D, Load JSON, or a Yeeps ZIP.";list.append(empty);return;
   }
   for(const entry of entries){
    const kind=classify(restoreName(entry));
    if(!kind)continue;
    const line=document.createElement("div");
    line.style.cssText="display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin:7px 0;padding:8px;border:1px solid #566887;border-radius:9px";
    const name=document.createElement("span");name.textContent=restoreName(entry);name.style.cssText="flex:1;min-width:120px;overflow-wrap:anywhere";
    line.append(name);
    const targetId=kind==="model"?"modelFile":kind==="scene"?"file":"yeepsZip";
    line.append(makeButton("Use",async()=>{
      if(busy)return;
      busy=true;
      try{status("Opening "+restoreName(entry)+"…");const blob=await fromStored(entry);sendFile(targetId,blob,restoreName(entry));panel.hidden=true;}
      catch(error){alert("Cannot open stored file: "+labelError(error));}
      finally{busy=false;}
    }));
    if(plugins().Share){
      line.append(makeButton("Share",async()=>{
       try{const uri=await fsPlugin().getUri({path:folder+"/"+entry,directory});await plugins().Share.share({title:restoreName(entry),url:uri.uri,dialogTitle:"Export "+restoreName(entry)});}
       catch(error){alert("Cannot share file: "+labelError(error));}
      }));
    }
    line.append(makeButton("Delete",async()=>{
      if(!confirm("Delete saved copy of "+restoreName(entry)+"?"))return;
      try{await fsPlugin().deleteFile({path:folder+"/"+entry,directory});await refreshPanel();}
      catch(error){alert("Cannot delete saved file: "+labelError(error));}
    }));
    list.append(line);
   }
  }catch(error){
   const errorMessage=document.createElement("p");errorMessage.textContent="Cannot read stored imports: "+labelError(error);list.append(errorMessage);
  }
 }
 function buildPanel(){
  if(panel)return;
  panel=document.createElement("section");
  panel.id="communityNativeImports";panel.hidden=true;
  panel.style.cssText="position:fixed;z-index:30000;inset:0;background:#080b14db;padding:12px;display:flex;align-items:center;justify-content:center;color:#fff;font:14px system-ui";
  panel.innerHTML='<div role="dialog" aria-modal="true" aria-label="My Imports" style="width:min(520px,96vw);max-height:88dvh;overflow:auto;padding:18px;border:1px solid #6b89b5;border-radius:14px;background:#18243a;box-shadow:0 12px 38px #0009"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><strong style="font-size:20px">📂 My Imports</strong><button type="button" class="native-close">✕ Close</button></div><p>Files kept on this device for use in Shapes & Colours. They remain available after an ordinary app update.</p><p style="color:#bacde8">For large files, import works but saving a reusable copy may be unavailable. Deleting the app can delete its files.</p><div class="community-native-list"></div></div>';
  panel.querySelector(".native-close").addEventListener("click",()=>panel.hidden=true);
  panel.addEventListener("click",e=>{if(e.target===panel)panel.hidden=true;});
  document.body.append(panel);
  const css=document.createElement("style");css.textContent="#communityNativeImports[hidden]{display:none!important}#communityNativeImports button{font:inherit;color:#fff;background:#31588d;border:1px solid #7198d3;border-radius:8px;padding:8px 11px;cursor:pointer}";document.head.append(css);
 }
 async function saveScene(json){
  if(typeof json!=="string")throw Error("Scene export must be JSON.");
  if(new Blob([json]).size>maxImportBytes)throw Error("Scene JSON is too large.");
  const name="shapes-and-colours-"+new Date().toISOString().replace(/[:.]/g,"-")+".json";
  const blob=new Blob([json],{type:"application/json"});
  const saved=await storeBlob(blob,name,null,{required:true});
  if(!saved)throw Error("Could not save scene.");
  return saved;
 }
 // Accessible from the editor's existing Save button; only injected in mobile builds.
 window.CommunityNativeFiles={saveScene,openImports:async()=>{buildPanel();panel.hidden=false;await refreshPanel();}};
 function installEditor(){
  const importer=document.getElementById("importModel");
  if(!importer)return;
  buildPanel();
  const library=makeButton("📂 My Imports",async()=>{panel.hidden=false;await refreshPanel();});
  library.id="nativeImportsButton";
  importer.insertAdjacentElement("afterend",library);
  const buttons=[["importModel","model","modelFile"],["load","scene","file"],["fpAvatar","avatar","fpAvatarFile"]];
  for(const [id,kind,input] of buttons){
   document.getElementById(id)?.addEventListener("click",event=>{
    event.preventDefault();event.stopImmediatePropagation();void processPicked(kind,input);
   },true);
  }
  document.getElementById("yeepsZip")?.addEventListener("click",event=>{
   event.preventDefault();event.stopImmediatePropagation();void processPicked("yeeps","yeepsZip");
  },true);
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installEditor,{once:true});
 else installEditor();
})();
