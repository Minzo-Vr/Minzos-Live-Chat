// Fan-made Yeeps-inspired Discord pack simulator. No connection to real Yeeps inventory.
const PREFIX = "yeeps-sim:";
const EXPIRES_SECONDS = 900;
const RARITIES = [
  {name:"Common",weight:55,emoji:"⚪",color:0x9099a6},
  {name:"Uncommon",weight:25,emoji:"🟢",color:0x39b873},
  {name:"Rare",weight:13,emoji:"🔵",color:0x3498db},
  {name:"Epic",weight:6,emoji:"🟣",color:0x9b59b6},
  {name:"Legendary",weight:1,emoji:"🟡",color:0xf1c40f}
];
const CARDS = Object.freeze([
  {id:"builders-block",name:"Builder's Block",rarity:"Common"},
  {id:"pillow-plant",name:"Pillow Plant",rarity:"Common"},
  {id:"belly-bubbles",name:"Belly Bubbles",rarity:"Common"},
  {id:"umbrella",name:"Umbrella",rarity:"Common"},
  {id:"gnome-friend",name:"Gnome Friend",rarity:"Common"},
  {id:"sticky-bomb",name:"Sticky Bomb",rarity:"Common"},
  {id:"grappling-hook",name:"Grappling Hook",rarity:"Uncommon"},
  {id:"potion-brewer",name:"Potion Brewer",rarity:"Uncommon"},
  {id:"harpoon",name:"Harpoon",rarity:"Uncommon"},
  {id:"web-shooter",name:"Wrist Web Shooter",rarity:"Uncommon"},
  {id:"portal-gun",name:"Portal Gun",rarity:"Rare"},
  {id:"plasma-disc",name:"Plasma Disc",rarity:"Rare"},
  {id:"octopus-grabber",name:"Octopus Air Grabber",rarity:"Rare"},
  {id:"horror-shark",name:"Horror Shark",rarity:"Epic"},
  {id:"golden-fireburst",name:"Golden Fireburst",rarity:"Epic"},
  {id:"anniversary-yeep",name:"Anniversary Yeep",rarity:"Legendary"},
  {id:"monster-bear",name:"Monster Bear",rarity:"Legendary"}
]);
const RARITY_RANK = Object.fromEntries(RARITIES.map((r,i)=>[r.name,i]));
RARITY_RANK.Custom=5;
const CUSTOM_PREFIX=PREFIX+"customcard:";
const GLOBAL_RESET=PREFIX+"wipe:global";
const USER_RESET=PREFIX+"wipe:user:";
export function getBaseCards(){return CARDS.map(c=>({...c}));}
export async function getCustomCards(env){
 const page=await env.PACKS.list({prefix:CUSTOM_PREFIX,limit:1000});
 if(!page.list_complete)throw Error("Too many custom cards configured");
 return page.keys.map(k=>k.metadata).filter(x=>x&&x.id&&x.name&&Number.isFinite(x.chance));
}
export async function getCollectionGeneration(owner,env){
 const [global,user]=await Promise.all([env.PACKS.get(GLOBAL_RESET),env.PACKS.get(USER_RESET+owner)]);
 return {global:global||"legacy",user:user||"legacy"};
}
export function getCollectionPrefix(owner,generation){
 if(generation.global==="legacy"&&generation.user==="legacy")return PREFIX+"collection:"+owner+":";
 return PREFIX+"collection2:"+generation.global+":"+generation.user+":"+owner+":";
}
export async function awardCard(owner,card,env){
 const generation=await getCollectionGeneration(owner,env);
 await env.PACKS.put(getCollectionPrefix(owner,generation)+crypto.randomUUID(),JSON.stringify({cards:[card],openedAt:Date.now(),source:"admin"}));
}
export async function clearCollection(owner,env){
 const generation=await getCollectionGeneration(owner,env);
 const oldPrefix=getCollectionPrefix(owner,generation);
 await env.PACKS.put(USER_RESET+owner,crypto.randomUUID());
 await env.PACKS.put(PREFIX+"cleanup:"+crypto.randomUUID(),JSON.stringify({prefix:oldPrefix}));
}
export async function clearEveryone(env){
 const old=await env.PACKS.get(GLOBAL_RESET)||"legacy";
 const oldPrefix=old==="legacy"?PREFIX+"collection:":PREFIX+"collection2:"+old+":";
 await env.PACKS.put(GLOBAL_RESET,crypto.randomUUID());
 await env.PACKS.put(PREFIX+"cleanup:"+crypto.randomUUID(),JSON.stringify({prefix:oldPrefix}));
}
export async function cleanupOldCollections(env){
 const jobs=await env.PACKS.list({prefix:PREFIX+"cleanup:",limit:10});
 for(const job of jobs.keys){
  try{
   const record=await env.PACKS.get(job.name,"json");
   if(!record||typeof record.prefix!=="string"){await env.PACKS.delete(job.name);continue;}
   const keys=await env.PACKS.list({prefix:record.prefix,limit:100});
   await Promise.all(keys.keys.map(k=>env.PACKS.delete(k.name)));
   if(keys.list_complete)await env.PACKS.delete(job.name);
  }catch(error){console.error("Yeeps collection cleanup failed",error);}
 }
}

function randomFraction(){
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}
function selectWeighted(items){
  const sum=items.reduce((n,x)=>n+x.weight,0);
  let roll=randomFraction()*sum;
  for(const item of items){roll-=item.weight;if(roll<0)return item;}
  return items[items.length-1];
}
export function drawYeepsPack(customCards=[]){
  const drawn=[];
  // Four ordinary slots plus one guaranteed Rare-or-higher slot.
  for(let slot=0;slot<5;slot++){
    const rarities=(slot===4?RARITIES.slice(2):RARITIES).filter(r=>
      CARDS.some(c=>c.rarity===r.name&&!drawn.some(d=>d.id===c.id)));
    const rarity=selectWeighted(rarities).name;
    const options=CARDS.filter(c=>c.rarity===rarity&&!drawn.some(d=>d.id===c.id));
    drawn.push({...options[Math.floor(randomFraction()*options.length)]});
  }
  const triggered=customCards.filter(c=>Number.isFinite(c.chance)&&c.chance>=0&&c.chance<=100&&randomFraction()*100<c.chance);
  // At most four custom cards; the fifth slot remains Rare-or-higher.
  for(let i=triggered.length-1;i>0;i--){const j=Math.floor(randomFraction()*(i+1));[triggered[i],triggered[j]]=[triggered[j],triggered[i]];}
  for(let i=0;i<Math.min(4,triggered.length);i++)drawn[i]={...triggered[i]};
  return drawn;
}
function userId(data){
  const value=String(data.member?.user?.id||data.user?.id||"");
  return /^\d{15,22}$/.test(value)?value:null;
}
function response(payload){
  return new Response(JSON.stringify(payload),{headers:{"content-type":"application/json"}});
}
function privateReply(message){
  return response({type:4,data:{content:message,flags:64,allowed_mentions:{parse:[]}}});
}
function enabledKV(env){
  return env.PACKS&&typeof env.PACKS.get==="function"&&typeof env.PACKS.put==="function";
}
function grade(name){return name==="Custom"?{emoji:"✨",color:0xf4a261}:RARITIES.find(r=>r.name===name)||RARITIES[0];}
function revealData(pack){
  const top=pack.cards.reduce((best,c)=>RARITY_RANK[c.rarity]>RARITY_RANK[best.rarity]?c:best,pack.cards[0]);
  return {
    content:"🎉 <@"+pack.userId+"> opened a fan-made Yeeps-inspired pack!",
    embeds:[{
      title:"🎴 Pack Revealed! • 5 Cards",
      color:grade(top.rarity).color,
      description:pack.cards.map((c,i)=>(i+1)+". "+grade(c.rarity).emoji+" **"+c.name+"** — "+(c.rarity==="Custom"?"Custom • "+c.difficulty:c.rarity)).join("\n"),
      footer:{text:"Unofficial Discord simulation • Not real Yeeps cards or in-game rewards"}
    }],
    components:[],
    allowed_mentions:{parse:[]}
  };
}
export async function handleYeepsOpenPack(data,env){
  const owner=userId(data);
  if(!owner)return privateReply("I couldn't identify your Discord account.");
  if(!enabledKV(env))return privateReply("Pack opening is not configured. The bot owner must bind PACKS KV.");
  try{
    const id=crypto.randomUUID();
    const [generation,customCards]=await Promise.all([getCollectionGeneration(owner,env),getCustomCards(env)]);
    const pack={userId:owner,generation,cards:drawYeepsPack(customCards),opened:false,createdAt:Date.now()};
    await env.PACKS.put(PREFIX+"pending:"+id,JSON.stringify(pack),{expirationTtl:EXPIRES_SECONDS});
    return response({type:4,data:{
      content:"🎁 <@"+owner+"> found a sealed **Yeeps-inspired Card Pack**!\nPress **Reveal Cards** to see your five cards.",
      embeds:[{title:"✨ Mystery Pack",description:"Contains 5 random cards, including at least one Rare or higher.\n**Fan-made simulator:** no real Yeeps items, card packs or account rewards.",color:0x5865f2}],
      components:[{type:1,components:[{type:2,style:1,label:"Reveal Cards",emoji:{name:"🎴"},custom_id:"yeeps:reveal:"+id}]}],
      allowed_mentions:{parse:[]}
    }});
  }catch(error){
    console.error("Yeeps pack creation failed",error);
    return privateReply("Couldn't create a pack right now. Try again shortly.");
  }
}
export async function handleYeepsReveal(data,env){
  const match=/^yeeps:reveal:([0-9a-f-]{36})$/.exec(String(data.data?.custom_id||""));
  if(!match)return privateReply("Unknown pack button.");
  if(!enabledKV(env))return privateReply("The pack storage is not configured.");
  const owner=userId(data);
  if(!owner)return privateReply("I couldn't identify your Discord account.");
  try{
    const id=match[1];
    const key=PREFIX+"pending:"+id;
    const pack=await env.PACKS.get(key,"json");
    if(!pack||!Array.isArray(pack.cards)||pack.cards.length!==5)return privateReply("This pack expired. Use /openpack to start again.");
    if(pack.userId!==owner)return privateReply("This is someone else's pack! Use /openpack to open your own.");
    const generation=await getCollectionGeneration(owner,env);
    const original=pack.generation||{global:"legacy",user:"legacy"};
    if(original.global!==generation.global||original.user!==generation.user)return privateReply("This pack predates a collection reset. Use /openpack for a new pack.");
    if(!pack.opened){
      // A record for each opening avoids overwriting another opening's collection.
      // Repeated clicks write the same key and cannot duplicate the displayed cards.
      await env.PACKS.put(getCollectionPrefix(owner,generation)+id,JSON.stringify({cards:pack.cards,openedAt:Date.now()}));
      await env.PACKS.put(key,JSON.stringify({...pack,opened:true}),{expirationTtl:EXPIRES_SECONDS});
    }
    return response({type:7,data:revealData(pack)});
  }catch(error){
    console.error("Yeeps reveal failed",error);
    return privateReply("Couldn't reveal this pack right now. Press the button again.");
  }
}
export async function getYeepsCollectionText(owner,env){
  const generation=await getCollectionGeneration(owner,env);
  const prefix=getCollectionPrefix(owner,generation);
  const page=await env.PACKS.list({prefix,limit:50});
  if(!page.keys.length)return "📚 **Your Yeeps-inspired Collection**\nYou have no cards yet. Use /openpack to start collecting!";
  const records=(await Promise.all(page.keys.map(k=>env.PACKS.get(k.name,"json"))))
    .filter(p=>p&&Array.isArray(p.cards));
  const totals=new Map();
  for(const record of records)for(const card of record.cards){
    if(!card||typeof card.id!=="string")continue;
    const old=totals.get(card.id);
    totals.set(card.id,{...card,count:(old?.count||0)+1});
  }
  const cards=[...totals.values()].sort((a,b)=>(RARITY_RANK[b.rarity]||0)-(RARITY_RANK[a.rarity]||0)||a.name.localeCompare(b.name));
  const count=[...totals.values()].reduce((sum,c)=>sum+c.count,0);
  const partial=!page.list_complete;
  const display=cards.slice(0,18).map(c=>grade(c.rarity).emoji+" "+c.name+" ×"+c.count+" ("+(c.rarity==="Custom"?"Custom • "+c.difficulty:c.rarity)+")").join("\n");
  return ("📚 **Your Yeeps-inspired Collection**\n"+
    "**"+count+" cards** • **"+cards.length+" unique** • **"+records.length+" packs**"+(partial?" (showing up to 50 openings)":"")+
    "\n\n"+display+(cards.length>18?"\n…and "+(cards.length-18)+" more card types.":"")+
    "\n\n*Unofficial simulator; no real Yeeps inventory or rewards.*").slice(0,1950);
}
export function handleYeepsCollection(data,env,ctx){
  const owner=userId(data);
  if(!owner)return privateReply("I couldn't identify your Discord account.");
  if(!enabledKV(env)||typeof env.PACKS.list!=="function")return privateReply("Collection storage is not configured.");
  if(!env.DISCORD_APPLICATION_ID)return privateReply("The bot's Discord application ID is missing.");
  ctx.waitUntil((async()=>{
    let content;
    try{content=await getYeepsCollectionText(owner,env);}
    catch(error){console.error("Yeeps collection failed",error);content="Couldn't load your collection right now. Try again shortly.";}
    const url="https://discord.com/api/v10/webhooks/"+encodeURIComponent(env.DISCORD_APPLICATION_ID)+"/"+encodeURIComponent(data.token)+"/messages/@original";
    const result=await fetch(url,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({content,allowed_mentions:{parse:[]}})});
    if(!result.ok)console.error("Discord couldn't update /collection:",result.status);
  })());
  return response({type:5,data:{flags:64}});
}
