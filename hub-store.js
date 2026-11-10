/* App Store-style launcher and descriptive preview panel for Community Hub.
 * Adds presentation only; existing click targets and auth checks remain intact.
 */
(()=>{
 "use strict";
 const $=id=>document.getElementById(id);
 const APPS={
  gatewayOpenChat:{name:"Community Chat",short:"Chat, friends & rooms",category:"Social",icon:"💬",theme:"chat",
   detail:"Stay in touch with your community through messages, mentions, rooms, friends, profiles and group chats.",
   features:["Public chat and rooms","Friends & direct messages","Mentions and profiles"]},
  gatewayOpenAI:{name:"Admin AI",short:"An AI workspace for admins",category:"Admin only",icon:"🤖",theme:"ai",
   detail:"Ask questions, review project ideas, and work with the admin-only Community Hub AI tools. Verified administrator access is required.",
   features:["Verified admin access","Chat and project memory","Review suggested edits"]},
  gatewayOpenShapes:{name:"Shapes & Colours",short:"Build your own 3D scenes",category:"Creative",icon:"🎨",theme:"shapes",
   detail:"Make colourful 3D scenes, place and transform objects, experiment with building tools and explore shared building features.",
   features:["3D shapes and colours","Move, rotate and scale","MultiBuilder tools"]},
  gatewayOpenMinzify:{name:"Minzify",short:"Discover music",category:"Music",icon:"🎧",theme:"music",
   detail:"Explore music, search tracks, build playlists and discover supported music services inside Minzify.",
   features:["Search and discover","Music playlists","Multiple music sources"]},
  gatewayOpenMinzSign:{name:"Minz Apps",short:"Explore app downloads",category:"Apps",icon:"📱",theme:"apps",
   detail:"Browse Community Hub tools and downloadable app builds. Available formats and signing depend on each release.",
   features:["Browse apps","Available downloads","Build information"]},
  gatewayOpenUpdates:{name:"Update Centre",short:"Updates and releases",category:"Tools",icon:"📦",theme:"updates",
   detail:"Find Community Hub release notes, check changes, and explore update downloads and publishing tools.",
   features:["Release notes","Downloads","Update history"]},
  gatewayOpenGames:{name:"Game Hub",short:"Play browser games",category:"Games",icon:"🎮",theme:"games",
   detail:"Explore a searchable collection of browser games. Preview a title, play in the Game Hub player, or open it on its source website.",
   features:["Searchable game library","Full-screen player","Game previews"]}
 };
 const GAMES={
  "2048":{icon:"🔢",detail:"Slide number tiles together to combine matching values and try to reach 2048.",features:["Number puzzle","Strategy","Tile merging"]},
  "Cookie Clicker":{icon:"🍪",detail:"Click cookies to collect more and build up your cookie production.",features:["Idle game","Click to collect","Upgrades"]},
  "Google Dino":{icon:"🦖",detail:"An endless runner where you jump over obstacles with a pixel-style dinosaur.",features:["Runner","Timing","High scores"]},
  "Google Snake":{icon:"🐍",detail:"Collect food, grow longer and avoid running into your own tail.",features:["Arcade","Quick rounds","Classic snake"]},
  "Retro Bowl":{icon:"🏈",detail:"Build a football team and play retro-styled matches.",features:["Sports","Football","Team management"]},
  "Slope":{icon:"⚡",detail:"Control a rolling ball on a fast-moving downhill course.",features:["Arcade","Reflexes","3D obstacle course"]},
  "Run 3":{icon:"🚀",detail:"Run and jump through twisting space tunnels without falling.",features:["Platformer","Space tunnels","Timing"]},
  "Minesweeper":{icon:"💣",detail:"Reveal safe squares and use number clues to avoid mines.",features:["Puzzle","Logic","Classic"]},
  "Blackjack":{icon:"🃏",detail:"Try to reach a card total closer to 21 than the dealer without going over. Virtual game only.",features:["Cards","Strategy","Virtual play"]},
  "Moto X3M":{icon:"🏍️",detail:"Ride a motorcycle through stunt-filled obstacle courses.",features:["Racing","Stunts","Timing"]},
  "Block Blast":{icon:"🧩",detail:"Place blocks and clear lines in this quick puzzle challenge.",features:["Puzzle","Blocks","High scores"]},
  "Gorilla Tag":{icon:"🦍",detail:"Open a browser-hosted Gorilla Tag-inspired game experience.",features:["Movement","Browser game","External source"]},
  "Twerk Race 3D":{icon:"🏃",detail:"Race through a colourful 3D obstacle course.",features:["Racing","Obstacles","Casual game"]}
 };
 let dialog=null,activeLaunch=null,previousFocus=null,currentPreviewMeta=null;
 function node(tag,cls,text){
  const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;
 }
 function createArt(meta,button=true){
  const art=node(button?"button":"div","store-app-art store-theme-"+(meta.theme||"games"));
  if(button){art.type="button";art.setAttribute("aria-label","Preview "+meta.name);}
  const icon=node("span","store-art-symbol",meta.icon||"🎮");
  if(meta.iconImage){const img=document.createElement("img");img.src=meta.iconImage;img.alt="";art.append(img)}
  else art.append(icon);
  if(button)art.append(node("span","store-preview-hint","Preview"));
  return art;
 }
 function closePreview(restoreFocus=true){
  if(!dialog||dialog.hidden)return;
  dialog.hidden=true;activeLaunch=null;currentPreviewMeta=null;
  if(restoreFocus&&previousFocus?.isConnected)previousFocus.focus();
  previousFocus=null;
 }
 function makeDialog(){
  if(dialog)return dialog;
  dialog=node("div");dialog.id="hubStorePreview";dialog.hidden=true;
  dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");
  dialog.setAttribute("aria-labelledby","hubStorePreviewTitle");
  const panel=node("section","store-dialog");panel.setAttribute("aria-describedby","hubStorePreviewDescription");
  const head=node("div","store-dialog-head");
  const icon=node("div","store-dialog-icon store-theme-games");icon.id="hubStorePreviewIcon";
  const caption=node("div");caption.style.flex="1";
  const type=node("span","store-dialog-type","App preview");type.id="hubStorePreviewType";
  const title=node("h2",null,"App name");title.id="hubStorePreviewTitle";
  const desc=node("p","store-dialog-description","");desc.id="hubStorePreviewDescription";
  caption.append(type,title,desc);
  const close=node("button","store-dialog-close","×");close.type="button";close.id="hubStorePreviewClose";close.setAttribute("aria-label","Close preview");
  head.append(icon,caption,close);
  const visual=node("div","store-preview-visual");
  const visualArt=node("div","store-preview-visual-art");visualArt.id="hubStorePreviewArt";
  const info=node("div","store-preview-visual-info");
  const bigTitle=node("strong");bigTitle.id="hubStorePreviewBigTitle";
  const note=node("small",null,"Feature overview · Illustration, not a live screenshot");
  const pitch=node("small");pitch.id="hubStorePreviewPitch";
  info.append(bigTitle,note,pitch);visual.append(visualArt,info);
  const featureHeading=node("strong",null,"What you'll find");
  const tags=node("div","store-preview-list");tags.id="hubStorePreviewTags";
  const foot=node("div","store-preview-foot");
  const cancel=node("button",null,"Close");cancel.type="button";cancel.addEventListener("click",()=>closePreview());
  const launch=node("button",null,"Open app");launch.type="button";launch.id="hubStoreLaunch";
  launch.addEventListener("click",()=>{
   const open=activeLaunch;closePreview(false);
   if(typeof open==="function")open();
  });
  foot.append(cancel,launch);
  panel.append(head,visual,featureHeading,tags,foot);dialog.append(panel);
  dialog.addEventListener("click",event=>{if(event.target===dialog)closePreview()});
  close.addEventListener("click",()=>closePreview());
  dialog.addEventListener("keydown",event=>{
   if(event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();closePreview();return}
   if(event.key==="Tab"){
    const all=[...panel.querySelectorAll("button:not([disabled])")];
    if(!all.length)return;
    if(event.shiftKey&&document.activeElement===all[0]){event.preventDefault();all.at(-1).focus()}
    else if(!event.shiftKey&&document.activeElement===all.at(-1)){event.preventDefault();all[0].focus()}
   }
  },true);
  document.addEventListener("keydown",event=>{
   if(event.key==="Escape"&&!dialog.hidden){
    event.preventDefault();event.stopImmediatePropagation();closePreview();
   }
  },true);
  document.body.append(dialog);
  return dialog;
 }
 function openPreview(meta,launch){
  if(!meta)return;
  makeDialog();previousFocus=document.activeElement;activeLaunch=launch;currentPreviewMeta=meta;
  $("hubStorePreviewType").textContent=(meta.category||"Game")+" · Preview";
  $("hubStorePreviewTitle").textContent=meta.name||"Preview";
  $("hubStorePreviewDescription").textContent=meta.detail||meta.short||"Explore this app.";
  $("hubStorePreviewBigTitle").textContent=meta.name||"Preview";
  $("hubStorePreviewPitch").textContent=meta.short||"Explore the available features.";
  const icon=$("hubStorePreviewIcon");
  icon.className="store-dialog-icon store-theme-"+(meta.theme||"games");icon.replaceChildren(createArt(meta,false).firstChild);
  const art=$("hubStorePreviewArt");
  art.replaceChildren(createArt(meta,false).firstChild);
  const tags=$("hubStorePreviewTags");tags.replaceChildren();
  for(const item of (meta.features||[]).slice(0,6))tags.append(node("span",null,item));
  const launchButton=$("hubStoreLaunch");launchButton.textContent=meta.launchLabel||"Open app";
  launchButton.hidden=typeof launch!=="function";
  const availability=window.HubSiteControls;
  const key=meta.hubKey;
  const blocked=!!availability&&!!key&&(!availability.canUse(key)||(meta.category==="Browser game"&&!availability.canUse("game-hub")));
  launchButton.disabled=blocked;
  if(blocked)launchButton.textContent="Disabled by admin";
  dialog.hidden=false;$("hubStorePreviewClose").focus();
 }
 function addAppCard(option,meta){
  const card=node("article","store-card");
  meta.hubKey={
   gatewayOpenChat:"chats",gatewayOpenAI:"admin-ai",gatewayOpenShapes:"shapes-colours",
   gatewayOpenMinzify:"minzify",gatewayOpenMinzSign:"minz-apps",gatewayOpenUpdates:"update-centre",
   gatewayOpenGames:"game-hub"
  }[option.id]||"";
  card.dataset.search=[meta.name,meta.short,meta.category,meta.detail].join(" ").toLowerCase();
  const art=createArt(meta);
  art.addEventListener("click",()=>openPreview(meta,()=>option.click()));
  const type=node("div","store-card-type",meta.category);
  const copy=node("div","store-card-copy");
  copy.append(type,node("strong",null,meta.name),node("small",null,meta.short));
  const actions=node("div","store-card-actions");
  const preview=node("button","store-preview-button","Preview");preview.type="button";
  preview.setAttribute("aria-label","Preview "+meta.name);
  preview.addEventListener("click",()=>openPreview(meta,()=>option.click()));
  option.replaceChildren(document.createTextNode("Open"));
  option.classList.add("store-launch");
  if(option.tagName==="BUTTON")option.type="button";
  actions.append(preview,option);
  card.append(art,copy,actions);
  return card;
 }
 function prepareGateway(){
  const list=document.querySelector("#gatewaySelection .gateway-options");
  if(!list||list.dataset.storeReady)return;list.dataset.storeReady="true";
  const original=[...list.children];
  const gameButton=node("button","gateway-option","Open");gameButton.id="gatewayOpenGames";gameButton.type="button";
  gameButton.addEventListener("click",()=>{
   const chat=$("gatewayOpenChat"),games=$("gameHubToggle");
   if(!chat||!games)return;
   chat.click();games.click();
  });
  const cards=[];
  for(const option of original){
   const meta=APPS[option.id];
   if(!meta){
    const soon={name:"Coming Soon",short:"More experiences on the way",category:"Future app",icon:"✨",theme:"soon"};
    const card=node("article","store-card store-disabled");
    card.dataset.search="coming soon future";
    const art=createArt(soon,false);
    const copy=node("div","store-card-copy");copy.append(node("div","store-card-type",soon.category),node("strong",null,soon.name),node("small",null,soon.short));
    card.append(art,copy,node("span","store-disabled-label","Not available yet"));cards.push(card);
    continue;
   }
   cards.push(addAppCard(option,meta));
  }
  cards.splice(1,0,addAppCard(gameButton,APPS.gatewayOpenGames));
  list.replaceChildren(...cards);
  const main=$("gatewaySelection")?.querySelector(".gateway-main");
  if(!main)return;
  const brand=main.querySelector(".gateway-brand");
  const kicker=node("div","gateway-store-kicker","Community Hub · Discover");
  brand.before(kicker);brand.textContent="Explore Apps & Games";
  const sub=main.querySelector(".gateway-subtitle");if(sub)sub.textContent="Your apps, creative tools and games—all in one place. Preview before you open.";
  const filter=$("gatewayRoleFilter");
  const toolbar=node("div","gateway-store-toolbar");
  const input=node("input");input.type="search";input.id="gatewayAppSearch";input.placeholder="Search apps and games…";input.setAttribute("aria-label","Search Community Hub apps");
  const count=node("span");count.id="gatewayStoreCount";
  toolbar.append(input,count);
  filter?.after(toolbar);
  const empty=node("p",null,"No matching apps found.");empty.id="gatewayStoreEmpty";empty.hidden=true;
  list.after(empty);
  function update(){
   const text=input.value.trim().toLowerCase();let n=0;
   for(const card of cards){
    card.hidden=!!text&&!card.dataset.search.includes(text);
    if(!card.hidden)n++;
   }
   count.textContent=n+" experience"+(n===1?"":"s");
   empty.hidden=n>0;
  }
  input.addEventListener("input",update);update();
 }
 function gameDetails(name){
  const details=GAMES[name]||{icon:"🎮",detail:"Preview this browser game before launching it.",features:["Browser game"]};
  return {name,short:details.detail,category:"Browser game",icon:details.icon,theme:"games",detail:details.detail,
   hubKey:window.HubSiteControls?.keyForGame(name)||"game-"+name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""),
   features:details.features,launchLabel:"Play game"};
 }
 window.addEventListener("community-hub-availability-change",()=>{
  if(!dialog||dialog.hidden||!currentPreviewMeta)return;
  const key=currentPreviewMeta.hubKey;
  const gate=window.HubSiteControls;
  const blocked=!!gate&&!!key&&(!gate.canUse(key)||
    (currentPreviewMeta.category==="Browser game"&&!gate.canUse("game-hub")));
  const action=$("hubStoreLaunch");
  if(action){action.disabled=blocked;action.textContent=blocked?"Disabled by admin":(currentPreviewMeta.launchLabel||"Open app");}
 });
 window.CommunityHubStore={openPreview,gameDetails};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",prepareGateway,{once:true});
 else prepareGateway();
})();
