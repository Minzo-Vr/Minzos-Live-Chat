// Opt-in custom status sharing. Never log online/offline or hidden/absent statuses.
const API="https://discord.com/api/v10", KEY="status-log:settings", ID=/^\d{15,22}$/;
const VIEW=1024n, DAY=86400000;
const response=(obj,status=200)=>Response.json(obj,{status,headers:{"Cache-Control":"no-store"}});
const privateReply=content=>response({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
const consentKey=(user)=>"status-log:consent:"+user;
const optedIn=async(env,user)=>!!(await env.SAD_MESSAGES.get(consentKey(user)));
const settings=async env=>await env.SAD_MESSAGES.get(KEY,"json")||{enabled:false};
function discord(env,path,options={}){
 return fetch(API+path,{...options,headers:{authorization:"Bot "+env.DISCORD_BOT_TOKEN,"content-type":"application/json"}});
}
async function privateChannel(env,id){
 if(!ID.test(id||""))return {ok:false,reason:"Select a server text channel."};
 const [channelResponse,meResponse]=await Promise.all([discord(env,"/channels/"+id),discord(env,"/users/@me")]);
 if(!channelResponse.ok||!meResponse.ok)return {ok:false,reason:"Live Chatter cannot inspect this channel. Check its View Channel permission."};
 const [channel,me]=await Promise.all([channelResponse.json(),meResponse.json()]);
 if(channel.type!==0||channel.guild_id!==env.DISCORD_GUILD_ID)return {ok:false,reason:"Choose a text channel in this server."};
 const overwrites=channel.permission_overwrites||[];
 const everyone=overwrites.find(o=>o.type===0&&o.id===env.DISCORD_GUILD_ID);
 if(!everyone||(BigInt(everyone.deny||"0")&VIEW)===0n||(BigInt(everyone.allow||"0")&VIEW)!==0n)
  return {ok:false,reason:"Set View Channel for @everyone to the red X (Deny), not the neutral setting. Unsync category permissions if necessary."};
 const allowed=overwrites.filter(o=>(BigInt(o.allow||"0")&VIEW)!==0n&&!(o.type===1&&o.id===me.id));
 if(!allowed.length)return {ok:true};
 // A bot's managed role and true administrators already authorized to see
 // private channels are safe even when they have explicit View Channel allows.
 const rolesResponse=await discord(env,"/guilds/"+env.DISCORD_GUILD_ID+"/roles");
 if(!rolesResponse.ok)return {ok:false,reason:"Could not verify role permissions safely."};
 const roles=await rolesResponse.json();
 for(const o of allowed){
  if(o.type===0){
   const role=roles.find(r=>r.id===o.id);
   if(role&&role.id!==env.DISCORD_GUILD_ID&&((BigInt(role.permissions||"0")&8n)!==0n||(role.managed&&role.tags?.bot_id===me.id)))continue;
   return {ok:false,reason:"A non-administrator role has View Channel allowed: "+(role?.name||o.id)+". Remove that allowance."};
  }
  return {ok:false,reason:"An individual member other than Live Chatter has View Channel allowed. Remove that allowance; administrators already have access."};
 }
 return {ok:true};
}
async function createPrivateChannel(env){
 const meResponse=await discord(env,"/users/@me");
 if(!meResponse.ok)throw Error("Could not identify Live Chatter");
 const me=await meResponse.json();
 const created=await discord(env,"/guilds/"+env.DISCORD_GUILD_ID+"/channels",{method:"POST",body:JSON.stringify({
  name:"status-logs",type:0,topic:"Private administrator logs of opt-in custom status sharing; messages expire after 24 hours.",
  permission_overwrites:[
   {id:env.DISCORD_GUILD_ID,type:0,allow:"0",deny:String(VIEW)},
   {id:me.id,type:1,allow:String(VIEW|2048n|16384n|65536n),deny:"0"}
  ]
 })});
 if(!created.ok)return {ok:false,reason:"Could not create a private channel (Discord HTTP "+created.status+"). Give Live Chatter Manage Channels and the required channel permissions."};
 const channel=await created.json();
 return {ok:true,id:channel.id};
}
export async function statusLogCommand(data,env,name){
 const user=data.member?.user?.id;
 if(!env.DISCORD_GUILD_ID||data.guild_id!==env.DISCORD_GUILD_ID||!ID.test(user||""))
  return privateReply("This command is only available in the configured server.");
 if(!env.SAD_MESSAGES)return privateReply("Status sharing storage is not configured.");
 const opts=Object.fromEntries((data.data?.options||[]).map(o=>[o.name,o.value]));
 if(name==="status-sharing"){
  if(opts.action==="off"){
   await env.SAD_MESSAGES.delete(consentKey(user));
   return privateReply("Status sharing is off. Previously shared entries expire after 24 hours; no further changes will be logged once the setting propagates.");
  }
  if(opts.action==="on"){
   await env.SAD_MESSAGES.put(consentKey(user),String(Date.now()));
   return privateReply("Status sharing is on. When logging is enabled, visible changes to your custom status may be posted to a private administrator channel for up to 24 hours. Use /status-sharing action:off to stop.");
  }
  return privateReply("Your status sharing is "+(await optedIn(env,user)?"on":"off")+". Only visible custom status changes are shared with server administrators, for up to 24 hours.");
 }
 if((BigInt(data.member?.permissions||"0")&8n)===0n)return privateReply("Only server administrators can use /loggings.");
 if(opts.action==="disable"){
  await env.SAD_MESSAGES.put(KEY,JSON.stringify({enabled:false}));
  return privateReply("Status logging disabled. Existing logs expire after 24 hours.");
 }
 if(opts.action==="enable"){
  if(!env.STATUS_LOG_SECRET)return privateReply("The Gateway bridge secret (STATUS_LOG_SECRET) is not configured.");
  let channel=opts.channel;
  if(!channel){
   const cfg=await settings(env);
   if(cfg.channel&&(await privateChannel(env,cfg.channel)).ok)channel=cfg.channel;
   else{
    const created=await createPrivateChannel(env);
    if(!created.ok)return privateReply(created.reason);
    channel=created.id;
   }
  }
  const check=await privateChannel(env,channel);
  if(!check.ok)return privateReply(check.reason);
  await env.SAD_MESSAGES.put(KEY,JSON.stringify({enabled:true,channel}));
  return privateReply("Status logging enabled in <#"+channel+"> for members who choose /status-sharing action:on. Announce this optional feature in your server. Logs expire after 24 hours.");
 }
 const cfg=await settings(env);
 return privateReply("**Live Chatter Logging**\nCustom status logging: "+(cfg.enabled?"Enabled in <#"+cfg.channel+">":"Disabled")+"\nOpt-in members only • 24-hour retention • hidden statuses excluded\nUse /loggings action:enable channel:#channel, omit channel to create a private one, or use action:disable.");
}
function equal(a,b){
 if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
export async function statusLogBridge(request,env){
 if(request.method!=="POST")return response({ok:false},405);
 if(!env.STATUS_LOG_SECRET||!equal(request.headers.get("authorization"),"Bearer "+env.STATUS_LOG_SECRET))return response({ok:false},401);
 if(!env.SAD_MESSAGES||!env.DISCORD_GUILD_ID)return response({ok:false},503);
 let body;try{body=await request.json();}catch{return response({ok:false},400);}
 if(!body||body.guild!==env.DISCORD_GUILD_ID||!ID.test(body.user||""))return response({ok:false},400);
 const cfg=await settings(env);
 if(!cfg.enabled||!await optedIn(env,body.user))return response({ok:true,allowed:false});
 if(body.action==="check")return response({ok:true,allowed:true});
 if(body.action!=="publish"||typeof body.text!=="string"||!body.text.trim()||body.text.length>200)return response({ok:false},400);
 if(!(await privateChannel(env,cfg.channel)).ok)return response({ok:false},409);
 // Re-check the user's setting after the channel lookup.
 if(!await optedIn(env,body.user))return response({ok:true,allowed:false});
 const expiry=Date.now()+DAY;
 const sent=await discord(env,"/channels/"+cfg.channel+"/messages",{method:"POST",body:JSON.stringify({
  embeds:[{title:"Custom status updated",description:"Member: <@"+body.user+">\n\n**New status**\n"+body.text,color:5802426,timestamp:new Date().toISOString(),footer:{text:"Opt-in status sharing • expires after 24 hours"}}],
  allowed_mentions:{parse:[]}
 })});
 if(!sent.ok)return response({ok:false},502);
 const message=await sent.json();
 try{
  // Existing scheduled deletion processor will delete the message at expiry.
  await env.SAD_MESSAGES.put("sad:status-log:"+message.id,JSON.stringify({channelId:cfg.channel,messageId:message.id,expiresAt:expiry}));
 }catch{
  await discord(env,"/channels/"+cfg.channel+"/messages/"+message.id,{method:"DELETE"});
  return response({ok:false},503);
 }
 return response({ok:true,allowed:true});
}
