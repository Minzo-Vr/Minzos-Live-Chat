/* Minzify's OPTIONAL Spotify catalog finder.
 * Spotify's client ID is public. Never embed Client Secrets.
 * Use PKCE, not implicit OAuth grant. Tokens stay in this browser tab.
 * Spotify metadata is NOT used as a source for raw audio playback.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const AUTH_URL="https://accounts.spotify.com/authorize";
const TOKEN_URL="https://accounts.spotify.com/api/token";
const SEARCH_URL="https://api.spotify.com/v1/search";
const CLIENT_KEY="minzify:spotify:clientid";
const TOKEN_KEY="minzify:spotify:tokens";
const PENDING_KEY="minzify:spotify:pending";
const redirectUri=new URL("./minzify-spotify.html",window.location.href).href.split("?")[0].split("#")[0];
const fixedClientId=String(window.MINZIFY_SPOTIFY_CLIENT_ID||"").trim();
const input=$("clientId"),connect=$("connect"),disconnect=$("disconnect");
const form=$("spotifySearch"),query=$("query"),searchButton=$("searchButton");
let tokens=null,inFlight=false;
const validClientId=id=>/^[A-Za-z0-9]{32}$/.test(String(id||""));
const clientId=()=>fixedClientId||input.value.trim();
function getLocal(key){try{return localStorage.getItem(key)||""}catch{return ""}}
function setLocal(key,value){try{localStorage.setItem(key,value);return true}catch{return false}}
function getSession(key){try{return sessionStorage.getItem(key)||""}catch{return ""}}
function setSession(key,value){try{sessionStorage.setItem(key,value);return true}catch{return false}}
function removeSession(key){try{sessionStorage.removeItem(key)}catch{}}
function readSessionJSON(key){try{const value=JSON.parse(getSession(key));return value&&typeof value==="object"?value:null}catch{return null}}
function showStatus(id,msg,error=false){const node=$(id);node.textContent=msg;node.className="status "+(error?"error":"info")}
function setBusy(value){inFlight=value;refreshUI()}
function refreshUI(){
 const goodId=validClientId(clientId()),connected=!!(tokens&&tokens.refresh_token||tokens&&tokens.access_token&&tokens.expires_at>Date.now());
 connect.disabled=inFlight||!goodId;
 disconnect.hidden=!tokens;
 disconnect.disabled=inFlight;
 $("saveClient").disabled=!!fixedClientId||inFlight;
 input.readOnly=!!fixedClientId;
 searchButton.disabled=inFlight||!connected;
 $("copyRedirect").disabled=inFlight;
}
function storeTokens(received,old){
 if(!received||typeof received.access_token!=="string"||!received.access_token)throw Error("Spotify did not provide an access token.");
 const duration=Number(received.expires_in);
 tokens={access_token:received.access_token,refresh_token:received.refresh_token||old?.refresh_token||"",
        expires_at:Date.now()+Math.max(30,Number.isFinite(duration)?duration:3600)*1000-30000,
        client_id:clientId()};
 // If session storage is blocked, avoid leaving an apparently persistent connection.
 if(!setSession(TOKEN_KEY,JSON.stringify(tokens)))throw Error("Session storage is unavailable. Spotify cannot keep this session connected.");
 refreshUI();
}
function randomString(bytes=48){
 const array=new Uint8Array(bytes);crypto.getRandomValues(array);
 return Array.from(array,x=>"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[x%66]).join("");
}
function urlSafeBase64(bytes){
 let binary="";for(const b of bytes)binary+=String.fromCharCode(b);
 return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function startConnect(){
 const id=clientId();
 if(!validClientId(id)){showStatus("connectStatus","Enter a valid Spotify Client ID (32 letters/numbers).",true);return}
 if(!window.isSecureContext||!crypto?.subtle){showStatus("connectStatus","Spotify PKCE login requires an HTTPS secure page.",true);return}
 if(!fixedClientId&&!setLocal(CLIENT_KEY,id)){showStatus("connectStatus","Browser storage is blocked, so OAuth cannot remember the Spotify Client ID.",true);return}
 const verifier=randomString(64);
 const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier)));
 const state=randomString(30);
 const record={verifier,state,client_id:id,created_at:Date.now()};
 if(!setSession(PENDING_KEY,JSON.stringify(record))){showStatus("connectStatus","Session storage is blocked; cannot securely complete Spotify login.",true);return}
 const params=new URLSearchParams({
  client_id:id,response_type:"code",redirect_uri:redirectUri,
  code_challenge_method:"S256",code_challenge:urlSafeBase64(hash),state
 });
 // No scope needed for public catalog search; no playlist permissions are requested.
 window.location.assign(AUTH_URL+"?"+params);
}
async function tokenRequest(body){
 const response=await fetch(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(body)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error("Spotify authorization failed ("+response.status+"): "+String(data.error_description||data.error||"Check app settings and account access.").slice(0,180));
 return data;
}
async function finishCallback(){
 const url=new URL(window.location.href);
 const code=url.searchParams.get("code"),error=url.searchParams.get("error");
 if(!code&&!error)return;
 const state=url.searchParams.get("state");
 // Do not retain single-use authorization codes in browser history.
 url.searchParams.delete("code");url.searchParams.delete("state");url.searchParams.delete("error");
 window.history.replaceState(null,"",url.pathname+url.search+url.hash);
 const pending=readSessionJSON(PENDING_KEY);
 removeSession(PENDING_KEY);
 if(error){showStatus("connectStatus","Spotify sign-in was cancelled or denied: "+error,true);return}
 if(!pending||pending.state!==state||!pending.verifier||Date.now()-pending.created_at>10*60*1000){
  showStatus("connectStatus","Spotify sign-in expired or could not be verified. Please connect again.",true);return;
 }
 if(!validClientId(pending.client_id)||pending.client_id!==clientId()){
  showStatus("connectStatus","Your Spotify Client ID changed during sign-in. Connect again.",true);return;
 }
 setBusy(true);
 showStatus("connectStatus","Completing Spotify sign-in…");
 try{
  const received=await tokenRequest({client_id:pending.client_id,grant_type:"authorization_code",code,redirect_uri:redirectUri,code_verifier:pending.verifier});
  storeTokens(received);
  showStatus("connectStatus","✓ Connected to Spotify. You can search the Spotify catalog below.");
  showStatus("searchStatus","Search for a song or artist to get started.");
 }catch(e){tokens=null;removeSession(TOKEN_KEY);showStatus("connectStatus",e.message,true)}
 finally{setBusy(false)}
}
async function getAccessToken(){
 if(!tokens||tokens.client_id!==clientId())throw Error("Connect your Spotify account first.");
 if(tokens.access_token&&tokens.expires_at>Date.now()+5000)return tokens.access_token;
 if(!tokens.refresh_token)throw Error("Spotify login expired. Please reconnect.");
 try{
  const received=await tokenRequest({grant_type:"refresh_token",refresh_token:tokens.refresh_token,client_id:clientId()});
  storeTokens(received,tokens);return tokens.access_token;
 }catch(e){
  removeSession(TOKEN_KEY);tokens=null;refreshUI();
  throw Error("Spotify session expired. Connect again. "+e.message);
 }
}
function imageUrl(images){
 const raw=Array.isArray(images)?images[0]?.url:"";
 try{
  const parsed=new URL(raw);
  if(parsed.protocol==="https:"&&
     (parsed.hostname==="i.scdn.co"||parsed.hostname==="mosaic.scdn.co"||parsed.hostname.endsWith(".spotifycdn.com")))
   return parsed.href;
 }catch{}
 return "";
}
function renderTracks(tracks){
 const box=$("trackResults");
 box.replaceChildren();
 let shown=0;
 for(const track of tracks||[]){
  if(!track||typeof track.id!=="string"||!/^[A-Za-z0-9]{1,80}$/.test(track.id))continue;
  shown++;
  const card=document.createElement("article");card.className="track";
  const art=document.createElement("div");art.className="art";
  const src=imageUrl(track.album?.images);
  if(src){const img=document.createElement("img");img.src=src;img.alt="";img.loading="lazy";art.append(img)}
  else art.textContent="♫";
  const meta=document.createElement("div");meta.className="meta";
  const title=document.createElement("strong");title.textContent=String(track.name||"Untitled track").slice(0,150);
  const artist=document.createElement("small");artist.textContent=(Array.isArray(track.artists)?track.artists.map(a=>a.name).join(", "):"Unknown artist").slice(0,180);
  const album=document.createElement("small");album.textContent=String(track.album?.name||"").slice(0,150);
  meta.append(title,artist,album);
  const open=document.createElement("a");open.className="open";open.href="https://open.spotify.com/track/"+track.id;
  open.target="_blank";open.rel="noopener noreferrer";open.textContent="Open in Spotify ↗";
  card.append(art,meta,open);box.append(card);
 }
 return shown;
}
async function doSearch(text){
 const term=text.trim().slice(0,90);
 if(term.length<2){showStatus("searchStatus","Enter at least two characters.",true);return}
 setBusy(true);
 showStatus("searchStatus",'Searching Spotify for "'+term+'"…');
 try{
  const accessToken=await getAccessToken();
  const args=new URLSearchParams({q:term,type:"track",limit:"10"});
  const response=await fetch(SEARCH_URL+"?"+args,{headers:{Authorization:"Bearer "+accessToken,Accept:"application/json"},cache:"no-store"});
  if(!response.ok){
   let reason="";
   try{const data=await response.json();reason=data.error?.message||data.reason||""}catch{}
   if(response.status===403)throw Error("Spotify denied this API search (403). The owner of this Spotify Developer app must have Premium, and development-mode users must be on its allowlist (Settings → Users Management). To search without developer access, use the Search on Spotify link.");
   if(response.status===429)throw Error("Spotify rate/quota limit reached. Try again later.");
   if(response.status===401){tokens=null;removeSession(TOKEN_KEY);refreshUI();throw Error("Spotify sign-in expired. Reconnect and try again.")}
   throw Error("Spotify search failed ("+response.status+"). "+String(reason).slice(0,120));
  }
  const data=await response.json();
  const count=renderTracks(data.tracks?.items||[]);
  showStatus("searchStatus",count?count+" Spotify tracks found. Tap a result to open it in Spotify.":"No matching Spotify tracks found.");
 }catch(e){$("trackResults").replaceChildren();showStatus("searchStatus",String(e.message||e).slice(0,300),true)}
 finally{setBusy(false)}
}
$("redirectUri").textContent=redirectUri;
input.value=fixedClientId||getLocal(CLIENT_KEY);
tokens=readSessionJSON(TOKEN_KEY);
if(tokens&&(!tokens.access_token||tokens.client_id!==clientId())){tokens=null;removeSession(TOKEN_KEY)}
if(fixedClientId){$("saveClient").title="Client ID is configured by the site owner";}
input.addEventListener("input",refreshUI);
$("saveClient").addEventListener("click",()=>{
 const id=input.value.trim();
 if(!validClientId(id)){showStatus("connectStatus","Please enter a valid 32-character Spotify Client ID, not your Client Secret.",true);return}
 if(!setLocal(CLIENT_KEY,id)){showStatus("connectStatus","Your browser blocked local storage. Client ID was not saved.",true);return}
 if(tokens&&tokens.client_id!==id){tokens=null;removeSession(TOKEN_KEY)}
 showStatus("connectStatus","Client ID saved on this device. Add the Redirect URI to Spotify Developer Dashboard, then tap Connect.");
 refreshUI();
});
$("copyRedirect").addEventListener("click",async()=>{
 try{await navigator.clipboard.writeText(redirectUri);showStatus("connectStatus","Redirect URI copied. Add it to your Spotify Developer Dashboard.")}
 catch{showStatus("connectStatus","Copy the Redirect URI shown above into the Spotify Developer Dashboard.",true)}
});
connect.addEventListener("click",()=>{startConnect().catch(e=>showStatus("connectStatus",e.message,true))});
disconnect.addEventListener("click",()=>{
 tokens=null;removeSession(TOKEN_KEY);removeSession(PENDING_KEY);
 $("trackResults").replaceChildren();showStatus("connectStatus","Disconnected on this device. Spotify's login on other websites is unchanged.");
 showStatus("searchStatus","Connect Spotify to search its catalog.");refreshUI();
});
const spotifyWebSearch=$("spotifyWebSearch");
function updateSpotifyWebSearch(){
 const text=query.value.trim();
 spotifyWebSearch.href="https://open.spotify.com/search/"+encodeURIComponent(text);
}
query.addEventListener("input",updateSpotifyWebSearch);
updateSpotifyWebSearch();
form.addEventListener("submit",event=>{event.preventDefault();if(!inFlight)void doSearch(query.value)});
refreshUI();
if(tokens){showStatus("connectStatus","✓ Spotify session found. Ready to search.");showStatus("searchStatus","Search for a Spotify track.");}
else if(validClientId(clientId()))showStatus("connectStatus","Client ID ready. Connect Spotify to authorize song search.");
else showStatus("connectStatus","Enter your Spotify Client ID to begin. No Client Secret is needed.");
void finishCallback();
})();
