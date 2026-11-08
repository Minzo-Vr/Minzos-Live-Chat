// Admin-only controls for the standalone unofficial Yeeps-inspired Discord bot.
// Always require Discord Administrator permission inside the designated admin guild.
import {getBaseCards,getCustomCards,awardCard,clearCollection,clearEveryone,cleanupOldCollections} from "./packs.js";

const PREFIX="yeeps-sim:";
const ADMIN_PREFIX="cardadmin:";
const DIFFICULTIES=new Set(["easy","medium","hard","extreme"]);
const ID_PATTERN=/^\d{15,22}$/;

function response(payload){return new Response(JSON.stringify(payload),{headers:{"content-type":"application/json"}});}
function priv(content){return response({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});}
export function isCardAdmin(data,env){
 if(!env.YEEPS_ADMIN_GUILD_ID||String(data.guild_id)!==String(env.YEEPS_ADMIN_GUILD_ID))return false;
 try{return (BigInt(data.member?.permissions||"0")&8n)!==0n;}catch{return false;}
}
function guard(data,env){
 return isCardAdmin(data,env)?null:priv("🔒 The card admin panel requires Administrator permission in the bot owner's configured Discord server.");
}
function button(label,id,emoji,style=2){return {type:2,style,label,custom_id:ADMIN_PREFIX+id,emoji:{name:emoji}};}
export function handleAdminCommand(data,env){
 const denied=guard(data,env);if(denied)return denied;
 if(!env.PACKS)return priv("Card storage is not configured.");
 return response({type:4,data:{
  flags:64,
  content:"🛠️ **Yeeps Card Admin Panel**\n\n**Add Card:** Set its name, chance per pack (0–100%), and difficulty (Easy / Medium / Hard / Extreme).\n**Give User Card:** Give a built-in or custom card by name to a Discord member.\n**Delete Cards:** Clear a user's virtual collection, or enter \`@everyone\` to reset **every user's collection globally**.\n\n⚠️ All deletions require a typed confirmation. These are virtual cards, not real Yeeps inventory.",
  components:[{type:1,components:[
   button("Add Card","add","➕",1),
   button("Give User Card","give","🎁",1),
   button("Delete Cards","delete","🗑️",4)
  ]}],
  allowed_mentions:{parse:[]}
 }});
}
function modal(id,title,fields){
 return response({type:9,data:{custom_id:ADMIN_PREFIX+id,title,components:fields.map(f=>({
  type:1,components:[{type:4,custom_id:f.id,style:1,label:f.label,placeholder:f.placeholder||"",required:f.required!==false,max_length:f.max||100,min_length:f.min||1}]
 }))}});
}
function field(data,id){
 for(const row of data.data?.components||[]){
  for(const input of row.components||[])if(input.custom_id===id)return String(input.value||"").trim();
 }
 return "";
}
function parseUser(text){
 const cleaned=text.match(/^<@!?(\d{15,22})>$/)?.[1]||text;
 return ID_PATTERN.test(cleaned)?cleaned:null;
}
function normalize(v){return v.toLocaleLowerCase("en").trim();}
async function addCard(data,env){
 const name=field(data,"name");
 const chanceString=field(data,"chance");
 const difficultyInput=normalize(field(data,"difficulty"));
 if(name.length<2||name.length>60||/[@<>\r\n\x00-\x1f]/.test(name))
  return priv("Card names must be 2–60 characters, with no mentions or line breaks.");
 if(!/^\d{1,3}(?:\.\d{1,2})?$/.test(chanceString))
  return priv("Chance must be a number from 0 to 100, with up to two decimal places (for example, 2.5).");
 const chance=Number(chanceString);
 if(!Number.isFinite(chance)||chance<0||chance>100)return priv("Chance must be between 0% and 100%.");
 if(!DIFFICULTIES.has(difficultyInput))
  return priv("Difficulty must be **Easy**, **Medium**, **Hard**, or **Extreme**.");
 const existing=await getCustomCards(env);
 if(existing.length>=100)return priv("The bot already has 100 custom cards. Ask the developer to add card-management limits.");
 if([...getBaseCards(),...existing].some(c=>normalize(c.name)===normalize(name)))
  return priv("A card with this name already exists. Choose a different name.");
 const card={id:"custom-"+crypto.randomUUID(),name,rarity:"Custom",difficulty:difficultyInput[0].toUpperCase()+difficultyInput.slice(1),chance};
 await env.PACKS.put(PREFIX+"customcard:"+card.id,JSON.stringify(card),{metadata:card});
 return priv("✅ **Custom card created:** "+name+"\n🎲 **Drop chance:** "+chance+"% per pack\n🏅 **Difficulty:** "+card.difficulty+"\n\nCustom cards can appear in up to four slots per pack; if more than four custom cards trigger, four are selected at random. The fifth slot remains Rare or higher.");
}
async function giveCard(data,env){
 const owner=parseUser(field(data,"target"));
 if(!owner)return priv("Enter the person's Discord numeric User ID, or a complete mention like \`<@123456789012345678>\`. Turn on Developer Mode in Discord to copy a User ID.");
 const query=normalize(field(data,"card"));
 const countText=field(data,"quantity")||"1";
 if(!/^\d{1,2}$/.test(countText)||Number(countText)<1||Number(countText)>10)
  return priv("Quantity must be a whole number from 1 to 10.");
 const all=[...getBaseCards(),...await getCustomCards(env)];
 const card=all.find(c=>normalize(c.name)===query||normalize(c.id)===query);
 if(!card)return priv("Card not found. Enter the exact card name or ID. Custom cards are added through **Add Card**.");
 await awardCard(owner,card,env,Number(countText));
 return priv("🎁 Gave **"+countText+" × "+card.name+"** to <@"+owner+">.\nThis is a virtual Discord collection, not a real Yeeps in-game inventory.");
}
async function deleteCards(data,env,ctx){
 const raw=field(data,"target");
 const confirm=field(data,"confirm");
 if(raw.toLowerCase()==="@everyone"){
  if(confirm!=="DELETE ALL")
   return priv("⚠️ To delete every user's virtual cards globally, type **DELETE ALL** exactly in the confirmation field. No cards were changed.");
  await clearEveryone(env);
  if(ctx?.waitUntil)ctx.waitUntil(cleanupOldCollections(env));
  return priv("🗑️ **All users' virtual card collections were reset.**\nOlder unopened packs cannot restore cleared cards. Previous records have been queued for background cleanup. This does not affect real Yeeps accounts.");
 }
 const owner=parseUser(raw);
 if(!owner)return priv("Enter a Discord User ID, complete user mention, or the exact text \`@everyone\`.");
 if(confirm!=="DELETE USER")
  return priv("⚠️ To delete this user's virtual cards, type **DELETE USER** exactly in the confirmation field. No cards were changed.");
 await clearCollection(owner,env);
 if(ctx?.waitUntil)ctx.waitUntil(cleanupOldCollections(env));
 return priv("🗑️ Cleared the virtual card collection for <@"+owner+">. Older unopened packs for that user will no longer work. Historical records are queued for cleanup.");
}
export async function handleAdminInteraction(data,env,ctx){
 const denied=guard(data,env);if(denied)return denied;
 if(!env.PACKS)return priv("Card storage is not configured.");
 const id=String(data.data?.custom_id||"").slice(ADMIN_PREFIX.length);
 try{
  if(data.type===3){
   if(id==="add")return modal("submit-add","Add Custom Card",[
    {id:"name",label:"Card Name",placeholder:"e.g. Secret Golden Yeep",max:60},
    {id:"chance",label:"Chance per pack (%)",placeholder:"e.g. 1.5",max:6},
    {id:"difficulty",label:"Difficulty: Easy / Medium / Hard / Extreme",placeholder:"Hard",max:7}
   ]);
   if(id==="give")return modal("submit-give","Give Virtual Card",[
    {id:"target",label:"Discord User ID or <@mention>",placeholder:"123456789012345678",max:32},
    {id:"card",label:"Card name or ID",placeholder:"Secret Golden Yeep",max:80},
    {id:"quantity",label:"Quantity (1–10)",placeholder:"1",max:2,required:false}
   ]);
   if(id==="delete")return modal("submit-delete","Delete Card Collection",[
    {id:"target",label:"User ID, <@mention>, or @everyone",placeholder:"@everyone",max:32},
    {id:"confirm",label:"Type DELETE USER or DELETE ALL",placeholder:"DELETE ALL",max:11}
   ]);
  }
  if(data.type===5){
   if(id==="submit-add")return await addCard(data,env);
   if(id==="submit-give")return await giveCard(data,env);
   if(id==="submit-delete")return await deleteCards(data,env,ctx);
  }
  return priv("Unknown admin action. Open /cardadmin again.");
 }catch(error){
  console.error("Yeeps admin operation failed",error);
  return priv("Couldn't complete that admin action. Check Cloudflare Worker logs.");
 }
}
