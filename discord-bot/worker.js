// Cloudflare Worker: Discord slash-command endpoint for Community Chat.
// Set DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID,
// DISCORD_GUILD_ID, DISCORD_CHANNEL_ID, FIREBASE_WEB_API_KEY,
// FIREBASE_BOT_EMAIL, FIREBASE_BOT_PASSWORD, DATABASE_URL as Worker secrets/vars.
// Deploy with wrangler; never place secrets in this file.
const enc = new TextEncoder();
function json(data, status=200) { return new Response(JSON.stringify(data), {status, headers:{"content-type":"application/json"}}); }
function reply(content, ephemeral=false) {return json({type:4,data:{content,flags:ephemeral?64:0,allowed_mentions:{parse:[]}}});}
function hexToBytes(hex) {if (!/^[a-f0-9]+$/i.test(hex)||hex.length%2) return null; return Uint8Array.from(hex.match(/../g).map(x=>parseInt(x,16)));}
async function verify(request, raw, key) {
  const sig=hexToBytes(request.headers.get("X-Signature-Ed25519")||"");
  const timestamp=request.headers.get("X-Signature-Timestamp")||"";
  const pub=hexToBytes(key||"");
  if(!sig||sig.length!==64||!pub||pub.length!==32||!/^[0-9]+$/.test(timestamp))return false;
  if(Math.abs(Date.now()/1000-Number(timestamp))>300)return false;
  try {const cryptoKey=await crypto.subtle.importKey("raw",pub,{name:"Ed25519"},false,["verify"]);return await crypto.subtle.verify("Ed25519",cryptoKey,sig,enc.encode(timestamp+raw));}catch{return false;}
}
async function releases(env) {
 const auth=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key="+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:env.FIREBASE_BOT_EMAIL,password:env.FIREBASE_BOT_PASSWORD,returnSecureToken:true})});
 if(!auth.ok)throw Error("Firebase authentication failed");
 const token=(await auth.json()).idToken;
 const url=new URL(env.DATABASE_URL);
 url.searchParams.set("auth",token);
 const res=await fetch(url);
 if(!res.ok)throw Error("Firebase announcements read failed");
 return Object.values((await res.json())||{}).filter(x=>x&&typeof x==="object"&&typeof x.version==="string").sort((a,b)=>(b.publishedAt||0)-(a.publishedAt||0));
}
function format(r) {return "**Update "+String(r.version).slice(0,30)+"**\n"+(Array.isArray(r.features)?r.features.filter(x=>typeof x==="string").slice(0,8).map(x=>"• "+x).join("\n"):"No release notes").slice(0,1600);}

const SITE_ORIGIN="https://minzo-vr.github.io";
const WORKER_ORIGIN="https://community-chat-discord-bot.kobefalzon8.workers.dev";
const OAUTH_REDIRECT=WORKER_ORIGIN+"/auth/discord/callback";
const decoder=new TextDecoder();
function b64(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");}
function unb64(s){const t=s.replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(t+"=".repeat((4-t.length%4)%4)),c=>c.charCodeAt(0));}
async function signState(payload,env){const key=await crypto.subtle.importKey("raw",enc.encode(env.DISCORD_CLIENT_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const data=b64(enc.encode(JSON.stringify(payload)));return data+"."+b64(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(data))));}
async function readState(s,env){const parts=(s||"").split(".");if(parts.length!==2)return null;try{const key=await crypto.subtle.importKey("raw",enc.encode(env.DISCORD_CLIENT_SECRET),{name:"HMAC",hash:"SHA-256"},false,["verify"]);if(!await crypto.subtle.verify("HMAC",key,unb64(parts[1]),enc.encode(parts[0])))return null;const p=JSON.parse(decoder.decode(unb64(parts[0])));return p.exp>Date.now()&&p.exp<Date.now()+600000&&p.origin===SITE_ORIGIN&&/^[a-zA-Z0-9_-]{20,100}$/.test(p.nonce)?p:null;}catch{return null;}}
function cors(origin){return {"access-control-allow-origin":origin===SITE_ORIGIN?SITE_ORIGIN:"null","access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"authorization, content-type","vary":"Origin","cache-control":"no-store"};}
function oauthError(message,status=400){return json({error:message},status);}
async function googleAccess(env){
 const privateKey=env.FIREBASE_PRIVATE_KEY.replace(/\\n/g,"\n");
 const pem=privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
 const key=await crypto.subtle.importKey("pkcs8",Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const now=Math.floor(Date.now()/1000);
 const header=b64(enc.encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
 const body=b64(enc.encode(JSON.stringify({iss:env.FIREBASE_CLIENT_EMAIL,sub:env.FIREBASE_CLIENT_EMAIL,aud:"https://oauth2.googleapis.com/token",scope:"https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",iat:now,exp:now+3600})));
 const assertion=header+"."+body+"."+b64(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,enc.encode(header+"."+body))));
 const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
 if(!tokenResponse.ok)throw Error("Service account authorization failed");
 return (await tokenResponse.json()).access_token;
}
async function firebaseCustomToken(uid,env){
 const privateKey=env.FIREBASE_PRIVATE_KEY.replace(/\\n/g,"\n");
 const pem=privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
 const key=await crypto.subtle.importKey("pkcs8",Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const now=Math.floor(Date.now()/1000);
 const h=b64(enc.encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
 const p=b64(enc.encode(JSON.stringify({iss:env.FIREBASE_CLIENT_EMAIL,sub:env.FIREBASE_CLIENT_EMAIL,aud:"https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",iat:now,exp:now+3600,uid})));
 return h+"."+p+"."+b64(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,enc.encode(h+"."+p))));
}
function callbackPage(result,nonce){
 const payload=JSON.stringify({source:"community-chat-discord-oauth",nonce,...result}).replace(/</g,"\\u003c");
 return new Response('<!doctype html><meta charset="utf-8"><title>Discord sign-in</title><p id="msg">Finishing Discord sign-in…</p><script>const data='+payload+';if(window.opener){window.opener.postMessage(data,'+JSON.stringify(SITE_ORIGIN)+');document.getElementById("msg").textContent="You can close this window.";window.close();}else{document.getElementById("msg").textContent="Please close this window and start again from Community Chat.";}</script>',{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'none'; base-uri 'none'; frame-ancestors 'none'; referrer-policy: no-referrer"}});
}
async function handleOAuth(request,env){
 const url=new URL(request.url);
 if(!url.pathname.startsWith("/auth/discord/"))return null;
 if(url.pathname==="/auth/discord/start"){
   const origin=request.headers.get("origin");
   if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
   if(request.method!=="POST"||origin!==SITE_ORIGIN)return oauthError("Origin not allowed",403);
   try{
     const {nonce,mode}=await request.json();
     if(!/^[a-zA-Z0-9_-]{20,100}$/.test(nonce)||!["login","link"].includes(mode))return new Response(JSON.stringify({error:"Invalid request"}),{status:400,headers:{"content-type":"application/json",...cors(origin)}});
     let uid=null;
     if(mode==="link"){
       const bearer=request.headers.get("authorization")||"";
       if(!bearer.startsWith("Bearer "))return new Response(JSON.stringify({error:"Sign in first to link Discord"}),{status:401,headers:{"content-type":"application/json",...cors(origin)}});
       const lookup=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idToken:bearer.slice(7)})});
       if(!lookup.ok)return new Response(JSON.stringify({error:"Firebase session expired; sign in again"}),{status:401,headers:{"content-type":"application/json",...cors(origin)}});
       uid=(await lookup.json()).users?.[0]?.localId;
       if(!uid)throw Error("Missing Firebase user");
     }
     const state=await signState({nonce,mode,uid,origin:SITE_ORIGIN,exp:Date.now()+300000},env);
     const auth=new URL("https://discord.com/oauth2/authorize");
     auth.searchParams.set("client_id",env.DISCORD_CLIENT_ID);
     auth.searchParams.set("redirect_uri",OAUTH_REDIRECT);
     auth.searchParams.set("response_type","code");
     auth.searchParams.set("scope","identify");
     auth.searchParams.set("state",state);
     auth.searchParams.set("prompt","consent");
     return new Response(JSON.stringify({url:auth.toString()}),{headers:{"content-type":"application/json",...cors(origin)}});
   }catch(e){return new Response(JSON.stringify({error:"Could not start Discord authorization"}),{status:500,headers:{"content-type":"application/json",...cors(origin)}});}
 }
 if(url.pathname==="/auth/discord/callback"){
   if(request.method!=="GET")return oauthError("Method not allowed",405);
   const state=await readState(url.searchParams.get("state"),env);
   if(!state)return new Response("Invalid or expired Discord authorization. Return to Community Chat.",{status:400});
   if(url.searchParams.has("error"))return callbackPage({error:"Discord authorization was cancelled"},state.nonce);
   const code=url.searchParams.get("code");
   if(!code)return callbackPage({error:"Missing Discord authorization code"},state.nonce);
   try{
     const token=await fetch("https://discord.com/api/v10/oauth2/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:"authorization_code",code,redirect_uri:OAUTH_REDIRECT})});
     if(!token.ok)throw Error("Discord code exchange failed");
     const discordToken=(await token.json()).access_token;
     const who=await fetch("https://discord.com/api/v10/users/@me",{headers:{authorization:"Bearer "+discordToken}});
     if(!who.ok)throw Error("Discord identity lookup failed");
     const discord=await who.json();
     if(!/^\\d{15,22}$/.test(discord.id))throw Error("Invalid Discord identity");
     const access=await googleAccess(env);
     const dbBase="https://website-chat-80038-default-rtdb.firebaseio.com/discordAuthLinks/"+discord.id+".json";
     const current=await fetch(dbBase,{headers:{authorization:"Bearer "+access,"X-Firebase-ETag":"true"}});
     if(!current.ok)throw Error("Account link lookup failed");
     const existing=await current.json();
     let uid=existing?.uid;
     if(state.mode==="link"){
       if(uid&&uid!==state.uid)return callbackPage({error:"This Discord account is already linked to another Community Chat account."},state.nonce);
       uid=state.uid;
     }else if(!uid)uid="discord:"+discord.id;
     if(!existing){
       const saved=await fetch(dbBase,{method:"PUT",headers:{authorization:"Bearer "+access,"content-type":"application/json","if-match":"null_etag"},body:JSON.stringify({uid,linkedAt:Date.now()})});
       if(saved.status===412)return callbackPage({error:"Discord account link changed. Please retry."},state.nonce);
       if(!saved.ok)throw Error("Could not save Discord account link");
     }
     if(state.mode==="link")return callbackPage({linked:true},state.nonce);
     const customToken=await firebaseCustomToken(uid,env);
     return callbackPage({token:customToken},state.nonce);
   }catch(e){return callbackPage({error:"Discord login failed. Check Cloudflare logs and Firebase permissions."},state.nonce);}
 }
 return oauthError("Not found",404);
}

export default {async fetch(request,env){
 const oauth=await handleOAuth(request,env);if(oauth)return oauth;
 if(request.method!=="POST")return new Response("Community Chat bot endpoint", {status:200});
 const raw=await request.text();
 if(!await verify(request,raw,env.DISCORD_PUBLIC_KEY))return new Response("Invalid signature",{status:401});
 let data;try{data=JSON.parse(raw);}catch{return new Response("Bad request",{status:400});}
 if(data.type===1)return json({type:1});
 if(data.type!==2)return reply("Unsupported interaction.",true);
 const name=data.data?.name;
 if(name==="ping")return reply("🏓 Pong! Community Chat bot is online.");
 if(name==="help")return reply("**Community Chat commands**\n/ping — bot health\n/help — commands\n/latest — latest published update\n/updates — three recent updates\n/status — website link\n/announce — admin-only Discord announcement");
 if(name==="status")return reply("Community Chat: https://minzo-vr.github.io/Minzos-Live-Chat/ (open to check availability)");
 if(name==="announce"){
   const admin=(BigInt(data.member?.permissions||"0") & 8n)!==0n;
   if(!admin||data.guild_id!==env.DISCORD_GUILD_ID)return reply("Only server administrators can use this command.",true);
   const message=data.data?.options?.find(x=>x.name==="message")?.value;
   if(typeof message!=="string"||!message.trim()||message.length>1500)return reply("Please provide a message under 1500 characters.",true);
   const sent=await fetch("https://discord.com/api/v10/channels/"+env.DISCORD_CHANNEL_ID+"/messages",{method:"POST",headers:{"Authorization":"Bot "+env.DISCORD_BOT_TOKEN,"content-type":"application/json"},body:JSON.stringify({content:"📢 **Community Chat announcement**\n"+message,allowed_mentions:{parse:[]}})});
   return sent.ok?reply("Announcement posted!",true):reply("Discord could not post the announcement. Check bot permissions.",true);
 }
 if(name==="latest"||name==="updates"){
   try{const list=await releases(env);if(!list.length)return reply("No published updates found.",true);return reply(list.slice(0,name==="latest"?1:3).map(format).join("\n\n").slice(0,1950));}
   catch{return reply("Could not load updates from Firebase right now.",true);}
 }
 return reply("Unknown command. Try /help.",true);
}};