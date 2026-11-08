/* Minzify optional YouTube music-video search using official YouTube Data API v3.
 * Music-category videos are not equivalent to the full YouTube Music catalog.
 * Do not scrape, extract audio, bypass ads, or use this player as background-only audio.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const configuredKey=String(window.MINZIFY_YOUTUBE_API_KEY||"").trim();
const STORAGE_KEY="minzify-youtube-api-key-v1";
const validApiKey=value=>{const v=String(value||"").trim();return v.length>0&&v.length<=256&&!/\s/.test(v)};
const storedKey=()=>{try{return localStorage.getItem(STORAGE_KEY)||""}catch{return ""}};
let apiKey=validApiKey(configuredKey)?configuredKey:(validApiKey(storedKey())?storedKey():"");
const hasKey=()=>validApiKey(apiKey);
const form=$("youtubeSearch"),input=$("query"),link=$("musicSearchLink"),status=$("status"),results=$("results");
const keyInput=$("apiKeyInput"),keySave=$("saveApiKey"),keyClear=$("clearApiKey"),keyMessage=$("apiKeyMessage");
let controller=null,run=0;
const configured=validApiKey(configuredKey);
function syncKeyUI(){
 const connected=hasKey();
 $("apiBadge").textContent=connected?(configured?"Site-wide API connected":"API connected in this browser"):"Setup needed";
 $("apiBadge").classList.toggle("connected",connected);
 $("apiHelp").textContent=connected?
  (configured?"Your hub's restricted YouTube API key is configured. You can search within Minzify.":"Your browser's API key is ready. Searches will stay inside Minzify.") :
  "To show search results here, connect a YouTube Data API v3 key. Restrict it to this website and the YouTube Data API.";
 keyInput.hidden=configured;
 keySave.hidden=configured;
 keyClear.hidden=configured||!validApiKey(storedKey());
 $("apiKeySetup").hidden=configured;
}

function googleError(data,http){
 const msg=String(data?.error?.message||"");
 const reason=String(data?.error?.errors?.[0]?.reason||"");
 const detail=(reason+" "+msg).toLowerCase();
 if(detail.includes("referer")||detail.includes("referrer"))return "Your Google API key is blocked by website restrictions. Add https://minzo-vr.github.io/Minzos-Live-Chat/* to allowed referrers.";
 if(detail.includes("not enabled")||detail.includes("accessnotconfigured")||detail.includes("service_disabled"))return "Enable YouTube Data API v3 for this key's Google Cloud project.";
 if(detail.includes("quota")||detail.includes("rate limit"))return "YouTube API quota reached; check usage in Google Cloud.";
 if(detail.includes("invalid")||detail.includes("expired"))return "Invalid API key. Use a YouTube Data API key, not your Spotify or Jamendo credential.";
 return "Google rejected the key (HTTP "+http+", reason "+reason.slice(0,55)+"). Check API and website restrictions.";
}
keySave.addEventListener("click",async()=>{
 const key=keyInput.value.trim();
 if(!validApiKey(key)){
  const msg="Enter a non-empty API key without spaces. Minzify will ask Google to verify it instead of guessing its format.";
  keyMessage.textContent=msg;showStatus(msg,true);return;
 }
 keySave.disabled=true;keySave.textContent="Checking…";
 keyMessage.textContent="Checking the key against YouTube's official API…";
 try{
  const params=new URLSearchParams({key,part:"snippet",regionCode:"AU"});
  const r=await fetch("https://www.googleapis.com/youtube/v3/videoCategories?"+params,{cache:"no-store"});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(googleError(data,r.status));
  if(!Array.isArray(data.items))throw Error("Unexpected API response. Check YouTube Data API configuration.");
  apiKey=key;
  let saved=true;
  try{localStorage.setItem(STORAGE_KEY,key)}catch{saved=false}
  keyInput.value="";syncKeyUI();
  keyMessage.textContent=saved?"✓ Key verified with Google and saved in this browser.":"✓ Key verified, but browser storage is blocked. It will reset when the page closes.";
  showStatus("✓ Key verified. Search YouTube music videos above.");
 }catch(e){
  const msg=e instanceof TypeError?"Couldn't reach Google. Check your network and any browser content blocker.":String(e.message||e);
  keyMessage.textContent=msg;showStatus("Key not connected: "+msg,true);
 }finally{keySave.disabled=false;keySave.textContent="Connect & test"}
});
keyClear.addEventListener("click",()=>{
 try{localStorage.removeItem(STORAGE_KEY)}catch{}
 apiKey=validApiKey(configuredKey)?configuredKey:"";
 keyInput.value="";results.replaceChildren();
 keyMessage.textContent="Browser key removed. Connect a key to search inside Minzify.";
 syncKeyUI();showStatus("In-site search is not configured. Add a restricted YouTube API key above.");
});
const videoId=id=>/^[A-Za-z0-9_-]{11}$/.test(String(id||""));
const showStatus=(message,isError=false)=>{
 status.textContent=message;status.className="status"+(isError?" error":"");
};
function syncLink(){
 const q=input.value.trim();
 link.href=q?"https://music.youtube.com/search?q="+encodeURIComponent(q):"https://music.youtube.com/";
}
function showPlayer(id,name){
 if(!videoId(id))return;
 const host=$("playerHost");
 // Do not autoplay: viewers must intentionally press the official video player's controls.
 const iframe=document.createElement("iframe");
 iframe.className="player";iframe.title="Official YouTube player: "+String(name||"Video").slice(0,140);
 iframe.src="https://www.youtube-nocookie.com/embed/"+encodeURIComponent(id)+"?rel=0";
 iframe.referrerPolicy="strict-origin-when-cross-origin";
 iframe.allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
 iframe.allowFullscreen=true;
 host.replaceChildren(iframe);host.hidden=false;$("playerPlaceholder").hidden=true;
 $("nowPlaying").textContent=String(name||"Video").slice(0,160);
 const watch="https://www.youtube.com/watch?v="+encodeURIComponent(id);
 const music="https://music.youtube.com/watch?v="+encodeURIComponent(id);
 $("watchYouTube").href=watch;$("watchYouTube").hidden=false;
 $("watchMusic").href=music;$("watchMusic").hidden=false;
 if(window.matchMedia("(max-width:800px)").matches)host.scrollIntoView({behavior:"smooth",block:"center"});
}
function resultCard(item){
 const id=item?.id?.videoId,snippet=item?.snippet||{};
 if(!videoId(id))return null;
 const card=document.createElement("article");card.className="result";
 const thumb=document.createElement("img");thumb.className="thumb";thumb.loading="lazy";thumb.referrerPolicy="no-referrer";
 thumb.alt="";thumb.src="https://i.ytimg.com/vi/"+id+"/mqdefault.jpg";
 const details=document.createElement("div");details.className="details";
 const name=document.createElement("strong");name.textContent=String(snippet.title||"Music video").slice(0,200);
 const artist=document.createElement("small");artist.textContent=String(snippet.channelTitle||"YouTube channel").slice(0,100);
 const actions=document.createElement("div");actions.className="actions";
 const watch=document.createElement("button");watch.type="button";watch.className="button primary";watch.textContent="▶ Watch here";
 watch.addEventListener("click",()=>showPlayer(id,snippet.title));
 const open=document.createElement("a");open.className="button";open.textContent="YouTube Music ↗";open.target="_blank";open.rel="noopener noreferrer";
 open.href="https://music.youtube.com/watch?v="+encodeURIComponent(id);
 actions.append(watch,open);details.append(name,artist,actions);card.append(thumb,details);
 return card;
}
async function search(q){
 const request=++run;
 if(controller)controller.abort();
 controller=new AbortController();
 results.replaceChildren();
 if(!hasKey()){showStatus("Add a restricted YouTube Data API key above to show results inside Minzify. YouTube Music is available as a separate link.",true);$("apiKeySetup").scrollIntoView({behavior:"smooth",block:"center"});return}
 showStatus("Searching YouTube's music-video category…");
 $("searchButton").disabled=true;
 try{
 const params=new URLSearchParams({
  key:apiKey,part:"snippet",type:"video",videoCategoryId:"10",
  videoEmbeddable:"true",maxResults:"20",q,safeSearch:"moderate"
 });
 const response=await fetch("https://www.googleapis.com/youtube/v3/search?"+params.toString(),{
  signal:controller.signal,headers:{Accept:"application/json"},cache:"no-store",referrerPolicy:"strict-origin-when-cross-origin"
 });
 const payload=await response.json().catch(()=>({}));
 if(!response.ok){
  const reason=String(payload.error?.errors?.[0]?.reason||"");
  if(response.status===403&&(reason==="quotaExceeded"||reason==="dailyLimitExceeded"))
    throw Error("YouTube's search quota has been reached for today. Use the YouTube Music link instead.");
  if(response.status===400||response.status===403)
    throw Error("YouTube search isn't configured correctly, or the API key's website restrictions blocked access. You can still search on YouTube Music.");
  throw Error("YouTube search is unavailable (HTTP "+response.status+"). Use the YouTube Music link.");
 }
 if(request!==run)return;
 const items=Array.isArray(payload.items)?payload.items:[];
 let count=0;
 for(const item of items){const card=resultCard(item);if(!card)continue;results.append(card);count++}
 showStatus(count?count+" matching music-category videos found. Watch using the official player or open YouTube Music.":"No music-category videos found. Try a different search or open YouTube Music.");
 }catch(err){
 if(request!==run||err?.name==="AbortError")return;
 showStatus(String(err?.message||"YouTube search failed."),true);
 }finally{if(request===run)$("searchButton").disabled=false}
}
input.addEventListener("input",syncLink);
form.addEventListener("submit",event=>{
 event.preventDefault();const q=input.value.trim().slice(0,100);
 if(!q)return;
 syncLink();
 if(!hasKey()){
   // Do not silently leave the website; user requested in-site search.
   showStatus("Search inside Minzify needs a YouTube Data API key. Paste one above, or tap the separate YouTube Music link.",true);
   $("apiKeySetup").scrollIntoView({behavior:"smooth",block:"center"});
   return;
 }
 void search(q);
});
const url=new URL(window.location.href),initial=url.searchParams.get("q");
if(initial)input.value=initial.slice(0,100);
syncLink();
syncKeyUI();
if(!hasKey())showStatus("In-site search needs a restricted YouTube Data API key. Connect one above to see results here.");
else showStatus("YouTube search is connected. Enter a song or artist and press Search to see results here.");
})();