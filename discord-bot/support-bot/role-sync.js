import {Events, GatewayIntentBits} from "discord.js";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const admin=require("firebase-admin");

// Opt-in, exact role-ID mapping. Never infer a role from its display name.
// Do not map Admin or other privileged roles without a deliberate security review.
const SUPPORTED=new Set(["plus","testsubject","moderator"]);
const INTERVAL_MS=60000;
const syncInProgress=new Set();
const lastApplied=new Map();

function config(){
 const guildId=process.env.DISCORD_GUILD_ID;
 const raw=process.env.ROLE_SYNC_MAP;
 if(!guildId||!raw)return null;
 const parsed=JSON.parse(raw);
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("ROLE_SYNC_MAP must be a JSON object");
 const entries=Object.entries(parsed);
 if(!entries.length)throw Error("ROLE_SYNC_MAP must include at least one role");
 const ids=new Set();
 for(const [role,id] of entries){
  if(!SUPPORTED.has(role))throw Error("Unsupported or privileged role mapping: "+role);
  if(typeof id!=="string"||!/^\d{15,22}$/.test(id)||ids.has(id))throw Error("Invalid or duplicate Discord role ID for "+role);
  ids.add(id);
 }
 return {guildId,map:parsed};
}
function initFirebase(){
 if(admin.apps.length)return admin.database();
 const json=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
 const databaseURL=process.env.FIREBASE_DATABASE_URL;
 if(!json||!databaseURL)throw Error("Role sync requires FIREBASE_SERVICE_ACCOUNT_JSON and FIREBASE_DATABASE_URL");
 const credential=JSON.parse(json);
 admin.initializeApp({credential:admin.credential.cert(credential),databaseURL});
 return admin.database();
}
function hasRole(raw,key){
 return typeof raw==="string"?raw===key:!!raw&&typeof raw==="object"&&raw[key]===true;
}
function normalized(raw){
 if(typeof raw==="string")return {[raw]:true};
 if(raw&&typeof raw==="object"&&!Array.isArray(raw))return {...raw};
 return {};
}
async function updateChatRole(db,uid,role,enabled){
 const ref=db.ref("chatRoles/"+uid);
 await ref.transaction(current=>{
  const roles=normalized(current);
  if(enabled)roles[role]=true;
  else delete roles[role];
  return Object.keys(roles).length?roles:null;
 },undefined,false);
}
export function setupRoleSync(client){
 const settings=config();
 if(!settings){console.log("Role sync disabled: set DISCORD_GUILD_ID and ROLE_SYNC_MAP to enable");return;}
 const db=initFirebase();
 const {guildId,map}=settings;
 const roleIds=new Set(Object.values(map));
 const knownLinks=new Map();
 const knownRoles=new Map();
 let busy=false;
 async function syncUser(discordId,uid,member,chatRoles,force=false){
  if(syncInProgress.has(discordId))return;
  syncInProgress.add(discordId);
  try{
   const previous=knownRoles.get(discordId);
   const discordRoles=new Set(member.roles.cache.keys());
   const chatEnabled=new Set(Object.keys(map).filter(key=>hasRole(chatRoles,key)));
   // On first observation, Community Chat is authoritative. Subsequent changes
   // in Discord are handled by guildMemberUpdate; Chat changes by polling.
   for(const [role,roleId] of Object.entries(map)){
    const inChat=chatEnabled.has(role),inDiscord=discordRoles.has(roleId);
    if(inChat===inDiscord)continue;
    const prev=previous?.[role];
    if(!force&&prev&&prev.chat===inChat&&prev.discord!==inDiscord){
     await updateChatRole(db,uid,role,inDiscord);
     if(inDiscord)chatEnabled.add(role);else chatEnabled.delete(role);
    }else{
     if(inChat)await member.roles.add(roleId,"Community Chat role sync");
     else await member.roles.remove(roleId,"Community Chat role sync");
     if(inChat)discordRoles.add(roleId);else discordRoles.delete(roleId);
    }
   }
   knownRoles.set(discordId,Object.fromEntries(Object.entries(map).map(([role,id])=>[role,{chat:chatEnabled.has(role),discord:discordRoles.has(id)}])));
  }finally{syncInProgress.delete(discordId);}
 }
 async function refresh(){
  if(busy)return;
  busy=true;
  try{
   const guild=await client.guilds.fetch(guildId);
   await guild.roles.fetch();
   for(const [role,id] of Object.entries(map)){
    const discordRole=guild.roles.cache.get(id);
    if(!discordRole)throw Error("Discord role not found: "+role);
    if(discordRole.permissions.has("Administrator"))throw Error("Refusing to sync a Discord role with Administrator permission: "+role);
    if(!discordRole.editable)throw Error("Bot cannot manage mapped role: "+role+" (move bot role above it)");
   }
   const links=(await db.ref("discordAuthLinks").get()).val()||{};
   for(const [discordId,record] of Object.entries(links)){
    if(!/^\d{15,22}$/.test(discordId)||typeof record?.uid!=="string"||!record.uid||record.uid.includes("/"))continue;
    knownLinks.set(discordId,record.uid);
    let member;
    try{member=await guild.members.fetch(discordId);}catch{continue;}
    const roles=(await db.ref("chatRoles/"+record.uid).get()).val();
    try{await syncUser(discordId,record.uid,member,roles);}catch(e){console.error("Role sync user failed",discordId,e.message);}
   }
   for(const id of [...knownLinks.keys()])if(!links[id]){knownLinks.delete(id);knownRoles.delete(id);}
  }catch(e){console.error("Role sync refresh failed:",e);}
  finally{busy=false;}
 }
 client.on(Events.GuildMemberUpdate,async(oldMember,newMember)=>{
  if(newMember.guild.id!==guildId||syncInProgress.has(newMember.id))return;
  const changed=Object.entries(map).filter(([,id])=>oldMember.roles.cache.has(id)!==newMember.roles.cache.has(id));
  if(!changed.length)return;
  const uid=knownLinks.get(newMember.id);
  if(!uid){await refresh();return;}
  syncInProgress.add(newMember.id);
  try{
   for(const [role,id] of changed)await updateChatRole(db,uid,role,newMember.roles.cache.has(id));
   const roles=(await db.ref("chatRoles/"+uid).get()).val();
   knownRoles.set(newMember.id,Object.fromEntries(Object.entries(map).map(([role,id])=>[role,{chat:hasRole(roles,role),discord:newMember.roles.cache.has(id)}])));
  }catch(e){console.error("Discord-to-chat sync failed:",e);}
  finally{syncInProgress.delete(newMember.id);}
 });
 client.once(Events.ClientReady,()=>{void refresh();setInterval(()=>void refresh(),INTERVAL_MS);});
 console.log("Two-way role sync configured for:",Object.keys(map).join(", "));
}
