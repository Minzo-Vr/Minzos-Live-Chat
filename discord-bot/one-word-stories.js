import {ONE_WORD_STORIES_CHANNEL_NAME,isStoryMessageValid,storyInstructions} from "./one-word-rules.mjs";

// Discord's Gateway-based listener enforces rules immediately when running.
// This Cloudflare cron moderator provides a one-minute safety net even when
// that separate listener is offline. It only touches the dedicated channel.
const BASE="https://discord.com/api/v10",SNOWFLAKE=/^\d{15,22}$/;
const CHANNEL_KEY="oneword:channel:v1",STATE_KEY="oneword:state:v1";

const REJECT_PREFIX="oneword:rejected:v1:";
const REJECT_DISPLAY_MS=5000;
async function reactToStory(env,channelId,messageId,emoji){
 try{
  await api(env,"PUT","/channels/"+channelId+"/messages/"+messageId+
   "/reactions/"+encodeURIComponent(emoji)+"/@me");
 }catch(error){
  // A missing Add Reactions permission should not interrupt turn enforcement.
  console.warn("Could not add story reaction",emoji,String(error));
 }
}
async function removeStoryReaction(env,channelId,messageId,emoji){
 try{
  await api(env,"DELETE","/channels/"+channelId+"/messages/"+messageId+
   "/reactions/"+encodeURIComponent(emoji)+"/@me");
 }catch(error){
  if(!/Discord HTTP 404/.test(String(error)))
   console.warn("Could not remove prior story reaction",emoji,String(error));
 }
}
async function markRejectedStory(env,channelId,messageId){
 const key=REJECT_PREFIX+messageId;
 if(await env.SAD_MESSAGES.get(key))return;
 // Persist rejection before adding the ❌ so future cron invocations can
 // remove it even if the Worker stops before finishing this run.
 await env.SAD_MESSAGES.put(key,JSON.stringify({
  channelId,deleteAfter:Date.now()+REJECT_DISPLAY_MS
 }),{expirationTtl:86400});
 await removeStoryReaction(env,channelId,messageId,"✅");
 await reactToStory(env,channelId,messageId,"❌");
}
/** Keep ❌ visible until at least the next scheduled moderation check. */
async function cleanupRejectedStories(env,channelId){
 const pending=new Set();
 let cursor;
 do{
  const page=await env.SAD_MESSAGES.list({prefix:REJECT_PREFIX,limit:1000,...(cursor?{cursor}:{})});
  for(const item of page.keys||[]){
   const messageId=item.name.slice(REJECT_PREFIX.length);
   const record=await env.SAD_MESSAGES.get(item.name,"json");
   if(!record){continue;}
   if(record.channelId!==channelId||!SNOWFLAKE.test(messageId))continue;
   if(Number(record.deleteAfter)>Date.now()){
    pending.add(messageId);
    continue;
   }
   try{
    await api(env,"DELETE","/channels/"+channelId+"/messages/"+messageId);
    await env.SAD_MESSAGES.delete(item.name);
   }catch(error){
    if(/Discord HTTP 404/.test(String(error)))await env.SAD_MESSAGES.delete(item.name);
    else{pending.add(messageId);console.error("Could not delete rejected story",String(error));}
   }
  }
  cursor=page.list_complete?null:page.cursor;
 }while(cursor);
 return pending;
}

async function api(env,method,path,body){
 if(!env.DISCORD_BOT_TOKEN)throw Error("Discord bot token is missing.");
 const response=await fetch(BASE+path,{
  method,headers:{"authorization":"Bot "+env.DISCORD_BOT_TOKEN,...(body!==undefined?{"content-type":"application/json"}:{})},
  ...(body!==undefined?{body:JSON.stringify(body)}:{})
 });
 const text=await response.text();
 let result=null;
 try{result=text?JSON.parse(text):null}catch{}
 if(!response.ok)throw Error("Discord HTTP "+response.status+": "+String(result?.message||text).slice(0,180));
 return result;
}
function requireConfig(env){
 if(!env.SAD_MESSAGES)throw Error("SAD_MESSAGES KV binding is required for one-word stories.");
 if(!SNOWFLAKE.test(String(env.DISCORD_GUILD_ID||"")))throw Error("Configure DISCORD_GUILD_ID.");
}
async function getChannel(env,id){
 const channel=await api(env,"GET","/channels/"+id);
 if(channel?.type!==0||String(channel.guild_id)!==String(env.DISCORD_GUILD_ID))
  throw Error("One-word stories must use a text channel in this Discord server.");
 return channel;
}
/** Finds or creates ONE #1-word-stories text channel, then posts the rules. */
export async function ensureOneWordStories(env){
 requireConfig(env);
 let record=await env.SAD_MESSAGES.get(CHANNEL_KEY,"json");
 let channel=null,created=false;
 if(record?.id&&SNOWFLAKE.test(record.id)){
  try{channel=await getChannel(env,record.id);}
  catch(error){
   if(!/Discord HTTP 404/.test(String(error)))throw error;
   record=null;
  }
 }
 if(!channel){
  const guildChannels=await api(env,"GET","/guilds/"+env.DISCORD_GUILD_ID+"/channels");
  if(!Array.isArray(guildChannels))throw Error("Could not read Discord server channels.");
  const matching=guildChannels.filter(x=>x.name===ONE_WORD_STORIES_CHANNEL_NAME&&x.type===0);
  if(matching.length>1)throw Error("Multiple #1-word-stories channels exist; resolve duplicates before setup.");
  channel=matching[0]||null;
  if(!channel){
   channel=await api(env,"POST","/guilds/"+env.DISCORD_GUILD_ID+"/channels",{
    name:ONE_WORD_STORIES_CHANNEL_NAME,type:0,
    topic:"One word per message. No consecutive turns by the same user. Hyphens, underscores, links and attachments are not allowed.",
    rate_limit_per_user:0
   });
   created=true;
  }
  await getChannel(env,channel.id);
 }
 if(!record||record.id!==channel.id||!record.welcomeId){
  const messages=await api(env,"GET","/channels/"+channel.id+"/messages?limit=100");
  const original=Array.isArray(messages)?messages.find(m=>m.author?.bot&&typeof m.content==="string"&&m.content.includes("📖 **1 WORD STORIES**")):null;
  let welcome=original;
  if(!welcome){
   welcome=await api(env,"POST","/channels/"+channel.id+"/messages",{
    content:storyInstructions(),allowed_mentions:{parse:[]}
   });
  }
  if(!welcome?.id||!SNOWFLAKE.test(welcome.id))throw Error("Discord did not confirm the game rules message.");
  record={id:channel.id,welcomeId:welcome.id,createdAt:new Date().toISOString()};
  await env.SAD_MESSAGES.put(CHANNEL_KEY,JSON.stringify(record));
  // Do not retroactively delete old messages if an existing channel was reused.
  if(!await env.SAD_MESSAGES.get(STATE_KEY)){
   await env.SAD_MESSAGES.put(STATE_KEY,JSON.stringify({channelId:channel.id,cursor:welcome.id,lastAuthorId:null,checkedAt:Date.now()}));
  }
 }
 return {channelId:channel.id,created,welcomeId:record.welcomeId};
}
/** Checks all new messages in order; reacts ✅ to successes, ❌ before deletion on failures. */
export async function moderateOneWordStories(env){
 requireConfig(env);
 const config=await env.SAD_MESSAGES.get(CHANNEL_KEY,"json");
 if(!config||!SNOWFLAKE.test(String(config.id)))return {active:false};
 const pendingIds=await cleanupRejectedStories(env,config.id);
 const state=(await env.SAD_MESSAGES.get(STATE_KEY,"json"))||{
  channelId:config.id,cursor:config.welcomeId,lastAuthorId:null
 };
 if(state.channelId!==config.id||!SNOWFLAKE.test(String(state.cursor||"")))
  throw Error("Story moderation cursor is unconfigured; rerun /setup_one_word_stories.");
 const cursor=BigInt(state.cursor);
 const collected=[];
 let before=null,reachedCursor=false;
 // 10 pages is far more than the usual minute of new messages, but prevents
 // silent omission if the Gateway moderator was disconnected.
 for(let page=0;page<10;page++){
  const suffix=before?"&before="+before:"";
  const batch=await api(env,"GET","/channels/"+config.id+"/messages?limit=100"+suffix);
  if(!Array.isArray(batch))throw Error("Discord message history was unavailable.");
  if(!batch.length){reachedCursor=true;break;}
  for(const msg of batch){
   if(!SNOWFLAKE.test(String(msg.id)))continue;
   if(BigInt(msg.id)<=cursor){reachedCursor=true;break;}
   collected.push(msg);
  }
  if(reachedCursor||batch.length<100){reachedCursor=true;break;}
  before=batch.at(-1)?.id;
  if(!SNOWFLAKE.test(String(before)))throw Error("Invalid history pagination cursor.");
 }
 if(!reachedCursor)throw Error("Too many new story messages to moderate in one pass; refusing to skip history.");
 const chronological=collected.sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:BigInt(a.id)>BigInt(b.id)?1:0);
 let lastAuthor=state.lastAuthorId||null,deleted=0,accepted=0,lastScanned=state.cursor;
 for(const message of chronological){
  // Bot posts don't take a turn.
  if(message.author?.bot||(message.type!==undefined&&message.type!==0&&message.type!==19)){
   lastScanned=message.id;continue;
  }
  // Discord strips content when Message Content Intent is disabled. Avoid
  // wiping every message because we cannot read its text.
  if(message.content===""&&!(message.attachments?.length||message.embeds?.length||message.sticker_items?.length))
   throw Error("Cannot inspect story messages: enable Message Content Intent in Discord Developer Portal.");
  const valid=isStoryMessageValid(message)&&message.author?.id!==lastAuthor;
  if(!valid){
   await markRejectedStory(env,config.id,message.id);
   pendingIds.add(message.id);
   deleted++;
  }else{
   lastAuthor=message.author.id;accepted++;
   await reactToStory(env,config.id,message.id,"✅");
  }
  lastScanned=message.id;
 }
 // Revisit recent messages so an offline Gateway listener cannot be bypassed
 // by editing a previously accepted word into a sentence or hyphenated phrase.
 const recent=await api(env,"GET","/channels/"+config.id+"/messages?limit=100");
 let editedRemoved=0,latestAcceptedAuthor=null;
 if(Array.isArray(recent)){
  for(const message of recent){
   if(message.author?.bot||(message.type!==undefined&&message.type!==0&&message.type!==19))continue;
   if(pendingIds.has(message.id))continue; // ❌ is already showing before deletion.
   if(message.content===""&&!(message.attachments?.length||message.embeds?.length||message.sticker_items?.length))
    throw Error("Cannot check story edits: enable Message Content Intent in Discord Developer Portal.");
   if(!isStoryMessageValid(message)){
    await markRejectedStory(env,config.id,message.id);
    pendingIds.add(message.id);
    editedRemoved++;
   }else if(!latestAcceptedAuthor)latestAcceptedAuthor=message.author?.id||null;
  }
 }
 if(latestAcceptedAuthor)lastAuthor=latestAcceptedAuthor;
 else if(editedRemoved)lastAuthor=null;
 if(chronological.length||editedRemoved){
  await env.SAD_MESSAGES.put(STATE_KEY,JSON.stringify({
   channelId:config.id,cursor:lastScanned,lastAuthorId:lastAuthor,checkedAt:Date.now()
  }));
 }
 return {active:true,channelId:config.id,scanned:chronological.length,accepted,deleted:deleted+editedRemoved,editedRemoved};
}
async function reportToOriginal(data,env,message){
 const response=await fetch(BASE+"/webhooks/"+encodeURIComponent(env.DISCORD_APPLICATION_ID)+"/"+
  encodeURIComponent(data.token)+"/messages/@original",{
   method:"PATCH",headers:{"content-type":"application/json"},
   body:JSON.stringify({content:String(message).slice(0,1900),allowed_mentions:{parse:[]}})
  });
 if(!response.ok)console.error("Could not update /setup_one_word_stories response",response.status);
}
export async function finishOneWordSetup(data,env){
 try{
  const r=await ensureOneWordStories(env);
  await reportToOriginal(data,env,(r.created?"✅ Created":"✅ Found")+" <#"+r.channelId+
   "> with the one-word story rules.\nThe bot deletes multiword/hyphen tricks and consecutive turns. The Gateway listener enforces them immediately; Cloudflare checks every minute as backup.");
 }catch(e){
  console.error("One-word stories setup failed",String(e));
  await reportToOriginal(data,env,"❌ Could not set up 1 Word Stories: "+String(e.message||e).slice(0,450)+
   "\nCheck Manage Channels, Send Messages, Read Message History, and Manage Messages.");
 }
}
