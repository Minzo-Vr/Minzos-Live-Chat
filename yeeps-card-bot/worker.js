// Standalone Discord interactions endpoint for the unofficial Yeeps-inspired card bot.
// Separate Discord application, Worker and KV from Community Chat.
import {handleYeepsOpenPack,handleYeepsReveal,handleYeepsCollection} from "./packs.js";

const enc=new TextEncoder();
function json(value,status=200){
  return new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
}
function reply(content,ephemeral=true){
  return json({type:4,data:{content,flags:ephemeral?64:0,allowed_mentions:{parse:[]}}});
}
function hexBytes(value){
  if(typeof value!=="string"||value.length%2||!/^[a-f\d]+$/i.test(value))return null;
  return Uint8Array.from(value.match(/../g),h=>parseInt(h,16));
}
async function validSignature(request,raw,key){
  const timestamp=request.headers.get("X-Signature-Timestamp")||"";
  const signature=hexBytes(request.headers.get("X-Signature-Ed25519")||"");
  const publicKey=hexBytes(key||"");
  if(!signature||signature.length!==64||!publicKey||publicKey.length!==32||!/^[0-9]+$/.test(timestamp))return false;
  if(Math.abs(Date.now()/1000-Number(timestamp))>300)return false;
  try{
    const cryptoKey=await crypto.subtle.importKey("raw",publicKey,{name:"Ed25519"},false,["verify"]);
    return await crypto.subtle.verify("Ed25519",cryptoKey,signature,enc.encode(timestamp+raw));
  }catch{return false;}
}
export default {
  async fetch(request,env,ctx){
    if(request.method!=="POST")return new Response("Yeeps Card Pack Opener (unofficial Discord simulator)",{headers:{"content-type":"text/plain; charset=utf-8"}});
    const raw=await request.text();
    if(!await validSignature(request,raw,env.DISCORD_PUBLIC_KEY))
      return new Response("Invalid signature",{status:401});
    let interaction;
    try{interaction=JSON.parse(raw);}catch{return new Response("Invalid JSON",{status:400});}
    if(interaction.type===1)return json({type:1});
    try{
      if(interaction.type===2){
        switch(interaction.data?.name){
          case "openpack":return await handleYeepsOpenPack(interaction,env);
          case "collection":return handleYeepsCollection(interaction,env,ctx);
          case "packhelp":return reply("🎴 **Yeeps-inspired Pack Opener**\nUse /openpack to get a five-card mystery pack, then press **Reveal Cards**.\nUse /collection to see your saved virtual cards.\n\n*Unofficial simulator: no real Yeeps cards or game rewards.*");
          default:return reply("Unknown command. Try /packhelp.");
        }
      }
      if(interaction.type===3&&String(interaction.data?.custom_id||"").startsWith("yeeps:reveal:"))
        return await handleYeepsReveal(interaction,env);
      return reply("Unsupported interaction.");
    }catch(error){
      console.error("Yeeps card bot interaction failed",error);
      return reply("Something went wrong. Try again.");
    }
  }
};
