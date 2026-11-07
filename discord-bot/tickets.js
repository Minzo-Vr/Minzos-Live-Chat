/**
 * Community Hub Discord support tickets.
 * Only private (type 12) Discord threads are created; never fall back to public.
 * All interaction requests are verified by the main Worker before reaching here.
 * SAD_MESSAGES is the existing Worker KV binding; ticket keys use distinct prefixes.
 */
export const TICKET_TYPES=Object.freeze({
 app_reports:{channel:"1568434705865375744",label:"App Reports",icon:"📱",button:"Report an app issue",threadPrefix:"app-report"},
 direct_support:{channel:"1568434138531500092",label:"Direct Support",icon:"💬",button:"Contact support",threadPrefix:"support"},
 bug_support:{channel:"1568434009485348875",label:"Bug Support",icon:"🐛",button:"Report a bug",threadPrefix:"bug-report"}
});
const DISCORD="https://discord.com/api/v10";
const ID=/^\d{15,22}$/;
const panelKey=kind=>"ticket-panel:v1:"+kind;
const ticketKey=(kind,userId)=>"support-ticket:v1:"+kind+":"+userId;
const now=()=>Date.now();
const titleName=s=>String(s||"member").replace(/[^a-zA-Z0-9_-]/g,"-").replace(/-+/g,"-").slice(0,28)||"member";
const safeErr=e=>String(e?.message||e||"Unknown error").slice(0,500);
const threadUrl=(guild,id)=>"https://discord.com/channels/"+guild+"/"+id;
async function api(env,method,path,body){
 if(!env.DISCORD_BOT_TOKEN)throw Error("Discord bot token isn't configured");
 const res=await fetch(DISCORD+path,{
  method,headers:{authorization:"Bot "+env.DISCORD_BOT_TOKEN,...(body!==undefined?{"content-type":"application/json"}:{})},
  ...(body!==undefined?{body:JSON.stringify(body)}:{})
 });
 const text=await res.text();
 let result=null;try{result=text?JSON.parse(text):null}catch{}
 if(!res.ok){
  const description=typeof result?.message==="string"?result.message.slice(0,190):text.slice(0,190);
  throw Error("Discord HTTP "+res.status+(description?": "+description:""));
 }
 return result;
}
function ready(env){
 if(!env.DISCORD_GUILD_ID||!ID.test(String(env.DISCORD_GUILD_ID)))throw Error("Configure the Discord guild ID first.");
 if(!env.SAD_MESSAGES)throw Error("Ticket state needs the existing SAD_MESSAGES KV binding.");
 if(!env.DISCORD_BOT_TOKEN)throw Error("Bot token missing.");
}
function panel(kind){
 const type=TICKET_TYPES[kind];
 return {
  content:type.icon+" **"+type.label+"**\nNeed help? Press the button to open a **private ticket**. You can send messages and attachments inside your ticket; server staff with Manage Threads can reply. Other regular members won't see your conversation.\n\n🔒 Please don't share passwords, recovery codes or secret tokens.",
  components:[{type:1,components:[{type:2,style:1,custom_id:"ticket:open:"+kind,label:type.button,emoji:{name:type.icon}}]}],
  allowed_mentions:{parse:[]}
 };
}
/**
 * Idempotently install/restore panel messages in the 3 supplied TEXT channels.
 * Check the stored message via Discord; never post duplicates if it still exists.
 * Refuse forums and announcements because they can't host PRIVATE threads.
 */
export async function ensureTicketPanels(env){
 ready(env);
 const result={ready:[],failed:[]};
 for(const [kind,type] of Object.entries(TICKET_TYPES)){
  try{
   const channel=await api(env,"GET","/channels/"+type.channel);
   if(channel.type!==0||String(channel.guild_id)!==String(env.DISCORD_GUILD_ID))
    throw Error("This must be a text channel in the configured server (Discord channel type "+channel.type+").");
   let existing=await env.SAD_MESSAGES.get(panelKey(kind),"json");
   if(existing?.messageId&&ID.test(String(existing.messageId))){
    try{
     await api(env,"GET","/channels/"+type.channel+"/messages/"+existing.messageId);
     result.ready.push({kind,channel:type.channel,messageId:existing.messageId,existing:true});continue;
    }catch(e){
     if(!String(e.message).includes("HTTP 404"))throw e;
    }
   }
   // If KV storage was cleared, recover an existing bot-owned panel from recent history.
   // Avoid duplicating a panel after a successful post but failed KV write.
   const recent=await api(env,"GET","/channels/"+type.channel+"/messages?limit=75");
   const found=Array.isArray(recent)?recent.find(m=>
     m.author?.bot===true&&Array.isArray(m.components)&&
     m.components.some(row=>row.components?.some(button=>button.custom_id==="ticket:open:"+kind))
   ):null;
   if(found){
    await env.SAD_MESSAGES.put(panelKey(kind),JSON.stringify({messageId:found.id,channelId:type.channel}));
    result.ready.push({kind,channel:type.channel,messageId:found.id,existing:true});continue;
   }
   const posted=await api(env,"POST","/channels/"+type.channel+"/messages",panel(kind));
   if(!ID.test(String(posted?.id)))throw Error("Discord did not confirm the panel message.");
   await env.SAD_MESSAGES.put(panelKey(kind),JSON.stringify({messageId:posted.id,channelId:type.channel}));
   result.ready.push({kind,channel:type.channel,messageId:posted.id,existing:false});
  }catch(err){
   console.error("Ticket panel setup failed",kind,safeErr(err));
   result.failed.push({kind,channel:type.channel,error:safeErr(err)});
  }
 }
 return result;
}
export function ticketAction(customId){
 const match=/^ticket:(open|close):(app_reports|direct_support|bug_support)(?::(\d{15,22}))?$/.exec(String(customId||""));
 if(!match)return null;
 if(match[1]==="open"&&match[3])return null;
 if(match[1]==="close"&&!match[3])return null;
 return {action:match[1],kind:match[2],ownerId:match[3]||null};
}
function interactionUserId(data){return data.member?.user?.id||data.user?.id||"";}
function staffPermission(data){
 const bits=BigInt(data.member?.permissions||"0");
 return (bits&(8n|(1n<<34n)))!==0n;
}
async function privateResponse(data,env,message){
 const endpoint=DISCORD+"/webhooks/"+encodeURIComponent(env.DISCORD_APPLICATION_ID)+"/"+encodeURIComponent(data.token)+"/messages/@original";
 const resp=await fetch(endpoint,{method:"PATCH",headers:{"content-type":"application/json"},
  body:JSON.stringify({content:String(message).slice(0,1900),allowed_mentions:{parse:[]}})});
 if(!resp.ok)console.error("Unable to update private ticket interaction",resp.status);
}
async function staffInvite(threadId,env){
 const raw=String(env.TICKET_STAFF_USER_IDS||"");
 const ids=[...new Set(raw.split(",").map(x=>x.trim()).filter(x=>ID.test(x)))].slice(0,15);
 const added=[];
 for(const id of ids){
  try{await api(env,"PUT","/channels/"+threadId+"/thread-members/"+id);added.push(id)}
  catch(e){console.warn("Could not invite ticket staff member",id,safeErr(e))}
 }
 return added;
}
async function openTicket(data,env,kind){
 const type=TICKET_TYPES[kind],userId=interactionUserId(data);
 if(!ID.test(userId))throw Error("Could not verify the ticket creator.");
 if(String(data.channel_id)!==type.channel)throw Error("Use the ticket button in <#"+type.channel+">.");
 const key=ticketKey(kind,userId);
 const record=await env.SAD_MESSAGES.get(key,"json");
 if(record?.status==="open"&&ID.test(String(record.threadId))){
  try{
   const thread=await api(env,"GET","/channels/"+record.threadId);
   if(thread.type===12&&String(thread.parent_id)===type.channel&&
      !thread.thread_metadata?.locked){
    if(thread.thread_metadata?.archived)
     await api(env,"PATCH","/channels/"+thread.id,{archived:false});
    // A user may have left a thread; add them back if permitted.
    await api(env,"PUT","/channels/"+thread.id+"/thread-members/"+userId);
    return "📩 Your **"+type.label+"** ticket is already open: "+threadUrl(data.guild_id,thread.id);
   }
  }catch(err){
   // Do not create a duplicate if Discord is temporarily unavailable.
   if(!String(err.message).includes("HTTP 404"))throw err;
  }
 }
 // A brief cooldown limits repeated closed/open ticket spam per account.
 const cooldown=Number(await env.SAD_MESSAGES.get("support-ticket-cooldown:"+userId)||0);
 if(cooldown>now())return "Please wait "+Math.ceil((cooldown-now())/1000)+" seconds before opening another ticket.";
 // Confirm that a private thread is supported in the selected parent channel.
 const parent=await api(env,"GET","/channels/"+type.channel);
 if(parent.type!==0||String(parent.guild_id)!==String(data.guild_id))
  throw Error("This channel cannot hold private tickets. An administrator must use a normal text channel.");
 const author=titleName(data.member?.nick||data.member?.user?.global_name||data.member?.user?.username||userId);
 const thread=await api(env,"POST","/channels/"+type.channel+"/threads",{
  name:type.threadPrefix+"-"+author+"-"+userId.slice(-4),
  type:12,invitable:false,auto_archive_duration:1440
 });
 if(thread.type!==12||String(thread.parent_id)!==type.channel)
  throw Error("Discord did not create a PRIVATE thread. No public ticket was accepted.");
 try{
  await api(env,"PUT","/channels/"+thread.id+"/thread-members/"+userId);
 }catch(err){
  try{await api(env,"PATCH","/channels/"+thread.id,{archived:true,locked:true})}catch{}
  throw Error("The private ticket was created but could not add you. Check View Channel and thread permissions. "+safeErr(err));
 }
 const invited=await staffInvite(thread.id,env);
 const firstMessage={
  content:type.icon+" **"+type.label+" ticket**\n"+
   "Opened by <@"+userId+">. Please describe your issue below; you can send screenshots, files and normal Discord messages here.\n\n"+
   "🔒 This is a **private thread**. The creator, added staff, and server members with Manage Threads permissions can view it.\n"+
   "Don't share passwords, API keys or recovery codes.\n\n"+
   (invited.length?"Support staff: "+invited.map(id=>"<@"+id+">").join(" ")+"\n":"Staff: Admins with **Manage Threads** can access this ticket.\n")+
   "When everything is resolved, press **Close Ticket**.",
  components:[{type:1,components:[{type:2,style:4,custom_id:"ticket:close:"+kind+":"+userId,label:"Close Ticket",emoji:{name:"🔒"}}]}],
  allowed_mentions:{users:[userId,...invited],roles:[],parse:[]}
 };
 try{
  await api(env,"POST","/channels/"+thread.id+"/messages",firstMessage);
  await env.SAD_MESSAGES.put(key,JSON.stringify({status:"open",threadId:thread.id,parentId:type.channel,userId,kind,openedAt:now()}),{expirationTtl:2592000});
  await env.SAD_MESSAGES.put("support-ticket-cooldown:"+userId,String(now()+60000),{expirationTtl:120});
 }catch(err){
  // Tell the requester if the ticket was created but could not be finalized.
  console.error("Ticket initialization failed after private thread creation",safeErr(err));
  throw Error("Private thread created, but setup was incomplete. Contact staff here: "+threadUrl(data.guild_id,thread.id)+" ("+safeErr(err)+")");
 }
 return "✅ Your private **"+type.label+"** ticket is ready: "+threadUrl(data.guild_id,thread.id)+"\nYou and staff can reply directly in that thread.";
}
async function closeTicket(data,env,kind,ownerId){
 const userId=interactionUserId(data),key=ticketKey(kind,ownerId);
 if(userId!==ownerId&&!staffPermission(data))
  throw Error("Only the ticket creator or server staff with Manage Threads can close this ticket.");
 const record=await env.SAD_MESSAGES.get(key,"json");
 if(!record||record.status!=="open"||String(record.threadId)!==String(data.channel_id))
  throw Error("This ticket has already closed or isn't the active ticket.");
 const channel=await api(env,"GET","/channels/"+record.threadId);
 if(channel.type!==12||String(channel.parent_id)!==TICKET_TYPES[kind].channel)
  throw Error("This is not the original private ticket thread.");
 // Send closing note before archiving; preserve conversation history.
 await api(env,"POST","/channels/"+record.threadId+"/messages",{
  content:"🔒 **Ticket closed by <@"+userId+">.** This private thread is archived; existing messages remain available to staff with access.\nTo start another conversation, use the ticket button in <#"+TICKET_TYPES[kind].channel+">.",
  allowed_mentions:{parse:[]}
 });
 await api(env,"PATCH","/channels/"+record.threadId,{archived:true,locked:true});
 await env.SAD_MESSAGES.put(key,JSON.stringify({...record,status:"closed",closedAt:now()}),{expirationTtl:604800});
 return "✅ **"+TICKET_TYPES[kind].label+"** ticket closed and archived. You can open another from <#"+TICKET_TYPES[kind].channel+">.";
}
export async function completeTicketInteraction(data,env,action){
 const type=TICKET_TYPES[action.kind];
 try{
  ready(env);
  if(String(data.guild_id)!==String(env.DISCORD_GUILD_ID))
   throw Error("Tickets are only available in the configured server.");
  const message=action.action==="open"?await openTicket(data,env,action.kind):await closeTicket(data,env,action.kind,action.ownerId);
  await privateResponse(data,env,message);
 }catch(error){
  console.error("Ticket interaction failed",action.action,action.kind,safeErr(error));
  await privateResponse(data,env,"❌ **Ticket action failed:** "+safeErr(error)+"\nIf this is a permissions issue, ask an administrator to check private-thread access.");
 }
}
export async function completeTicketSetupInteraction(data,env){
 try{
  ready(env);
  if(String(data.guild_id)!==String(env.DISCORD_GUILD_ID)||!staffPermission(data))
   throw Error("Only server staff with Manage Threads may configure tickets.");
  const summary=await ensureTicketPanels(env);
  const lines=summary.ready.map(x=>"✅ <#"+x.channel+"> — "+(x.existing?"already installed":"ticket panel posted"));
  lines.push(...summary.failed.map(x=>"❌ <#"+x.channel+"> — "+x.error));
  await privateResponse(data,env,lines.length?lines.join("\n"):"No ticket channels configured.");
 }catch(error){
  await privateResponse(data,env,"❌ Ticket setup failed: "+safeErr(error));
 }
}
