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
export default {async fetch(request,env){
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