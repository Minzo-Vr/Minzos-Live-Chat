(() => {
  const root=document.createElement("div");
  root.id="communitySideloadTool";
  root.innerHTML=`<style>
  #communitySideloadTool{position:fixed;right:14px;bottom:14px;z-index:2147481500;font:14px system-ui,sans-serif;color:#182039}
  #communitySideloadTool *{box-sizing:border-box}
  #communitySideloadTool button,#communitySideloadTool input{font:inherit}
  #communitySideloadTool .sl-launch{border:0;background:#5865f2;color:white;border-radius:999px;padding:12px 16px;box-shadow:0 4px 18px #0005;cursor:pointer}
  #communitySideloadTool .sl-panel{position:absolute;right:0;bottom:55px;width:min(370px,calc(100vw - 28px));max-height:75vh;overflow:auto;background:white;border:1px solid #dce1ec;border-radius:16px;box-shadow:0 12px 40px #0005;padding:16px}
  #communitySideloadTool .sl-panel[hidden]{display:none!important}
  #communitySideloadTool label{display:block;font-weight:650;margin:12px 0 5px}
  #communitySideloadTool input{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:10px;color:#182039;background:white}
  #communitySideloadTool .sl-actions{display:flex;gap:8px;margin-top:12px}
  #communitySideloadTool .sl-actions button{border:0;border-radius:8px;background:#5865f2;color:white;padding:10px;cursor:pointer}
  #communitySideloadTool .sl-actions button:disabled{opacity:.55;cursor:wait}
  #communitySideloadTool p{font-size:12px;line-height:1.5;color:#4b5563}
  #communitySideloadTool .sl-status{white-space:pre-wrap;overflow-wrap:anywhere}
  </style>
  <section class="sl-panel" hidden role="dialog" aria-label="IPA and APK downloader">
    <div style="display:flex;align-items:center;justify-content:space-between"><strong>📦 App downloader</strong><button type="button" class="sl-close" aria-label="Close" style="border:0;background:transparent;font-size:22px;cursor:pointer">×</button></div>
    <p>Download an HTTPS .ipa or .apk from a source you trust. Only install apps you have permission to use.</p>
    <label for="sl-url">Direct IPA / APK download URL</label><input id="sl-url" type="url" placeholder="https://example.com/app.ipa" autocomplete="off" spellcheck="false">
    <div class="sl-actions"><button type="button" class="sl-download">Download &amp; share</button></div>
    <p class="sl-status" role="status" aria-live="polite"></p>
    <p class="sl-guide"></p>
  </section>
  <button type="button" class="sl-launch">📦 Downloads</button>`;
  document.body.append(root);
  const panel=root.querySelector(".sl-panel"), launch=root.querySelector(".sl-launch"),close=root.querySelector(".sl-close");
  const input=root.querySelector("#sl-url"),download=root.querySelector(".sl-download"),status=root.querySelector(".sl-status"),guide=root.querySelector(".sl-guide");
  const native=!!window.Capacitor?.isNativePlatform?.();
  const platform=window.Capacitor?.getPlatform?.() || "web";
  guide.textContent=platform==="ios"?"iOS: Share the IPA to Files or your compatible signing app. This tool cannot sign or install IPAs itself.":platform==="android"?"Android: Save/share the APK, open it from Files/Downloads and approve installation in Android's system installer.": "Web: Downloads open in your browser. Native handoff requires the installed Community Chat app.";
  launch.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)input.focus()};
  close.onclick=()=>{panel.hidden=true};
  const say=t=>{status.textContent=t};
  download.onclick=async()=>{
    let url;
    try{url=new URL(input.value.trim());if(url.protocol!=="https:")throw Error("HTTPS required");}
    catch{say("Enter a valid HTTPS download URL.");return;}
    const name=decodeURIComponent(url.pathname.split("/").pop()||"").replace(/[^a-zA-Z0-9._-]/g,"_");
    if(!/\.(ipa|apk)$/i.test(name)){say("The URL must end in .ipa or .apk.");return;}
    download.disabled=true;
    try{
      if(!native){say("Opening your browser download…");window.open(url.href,"_blank","noopener,noreferrer");return;}
      const plugins=window.Capacitor?.Plugins||{};
      if(!plugins.Filesystem||!plugins.FileTransfer||!plugins.Share)throw Error("Native download plugins are unavailable. Rebuild the app.");
      const path="sideload/"+Date.now()+"-"+name;
      const dir="CACHE";
      await plugins.Filesystem.mkdir({path:"sideload",directory:dir,recursive:true});
      const uri=await plugins.Filesystem.getUri({path,directory:dir});
      say("Downloading "+name+"…");
      await plugins.FileTransfer.downloadFile({url:url.href,path:uri.uri,progress:false});
      say("Downloaded. Opening the system share sheet…");
      await plugins.Share.share({title:name,url:uri.uri,dialogTitle:"Save or open "+name});
      say("Download complete. If you saved the file, use your platform's installer/signing app to continue.");
    }catch(e){say("Download/handoff failed: "+(e?.message||String(e)).slice(0,220));}
    finally{download.disabled=false;}
  };
})();
