import {ActivityType,Events} from "discord.js";
export function setupStatusLogging(client){
 const guild=process.env.DISCORD_GUILD_ID;
 const secret=process.env.STATUS_LOG_SECRET;
 const base=process.env.STATUS_LOG_WORKER_URL;
 if(!guild||!secret||!base)return;
 let endpoint;try{endpoint=new URL("/status-log/bridge",base);if(endpoint.protocol!=="https:")return;}catch{return;}
 const activityText=p=>{
  const status=p?.activities?.find(a=>a.type===ActivityType.Custom);
  return status?[status.emoji?.name,status.state].filter(Boolean).join(" ").slice(0,200):"";
 };
 const busy=new Set(), last=new Map();
 async function bridge(body){
  const r=await fetch(endpoint,{method:"POST",headers:{authorization:"Bearer "+secret,"content-type":"application/json"},body:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(5000)});
  if(!r.ok)return null;
  return await r.json();
 }
 client.on(Events.PresenceUpdate,async(before,after)=>{
  if(after.guild?.id!==guild||!before||after.status==="offline"||after.user?.bot)return;
  const user=after.userId;
  if(!user||busy.has(user)||(last.get(user)||0)>Date.now()-10000)return;
  const current=activityText(after);
  if(!current||current===activityText(before))return;
  // Never publish absent/hidden status, online/offline changes, or initial presences.
  busy.add(user);
  try{
   const check=await bridge({action:"check",guild,user});
   if(!check?.allowed)return;
   await bridge({action:"publish",guild,user,text:current});
   last.set(user,Date.now());
   if(last.size>2000)for(const [id,time] of last)if(time<Date.now()-10000)last.delete(id);
  }catch{console.warn("Status sharing bridge unavailable");}
  finally{busy.delete(user);}
 });
}
