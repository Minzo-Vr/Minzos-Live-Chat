// Register ONLY this standalone bot's guild slash commands.
// Run with the NEW Yeeps Discord application credentials (not Community Chat's).
const {YEEPS_DISCORD_BOT_TOKEN:token,YEEPS_DISCORD_APPLICATION_ID:app,YEEPS_DISCORD_GUILD_ID:guild}=process.env;
if(!token||!app||!guild)throw Error("Set YEEPS_DISCORD_BOT_TOKEN, YEEPS_DISCORD_APPLICATION_ID and YEEPS_DISCORD_GUILD_ID.");
const commands=[
  {type:1,name:"openpack",description:"Open five virtual Yeeps-inspired cards with a Reveal Cards button"},
  {type:1,name:"collection",description:"See your personal virtual Yeeps-inspired card collection"},
  {type:1,name:"packhelp",description:"How to use the Yeeps-inspired card pack opener"}
];
const url=`https://discord.com/api/v10/applications/${encodeURIComponent(app)}/guilds/${encodeURIComponent(guild)}/commands`;
for(let attempt=0;attempt<8;attempt++){
  const response=await fetch(url,{method:"PUT",headers:{authorization:"Bot "+token,"content-type":"application/json"},body:JSON.stringify(commands)});
  if(response.ok){
    console.log("Registered "+(await response.json()).length+" commands for the separate Yeeps bot.");
    process.exit(0);
  }
  const text=await response.text();
  if(response.status===429&&attempt<7){
    let delay=3500;try{delay=Math.max(1000,Math.ceil(Number(JSON.parse(text).retry_after)*1000)+500);}catch{}
    await new Promise(resolve=>setTimeout(resolve,Math.min(delay,30000)));
    continue;
  }
  throw Error("Discord command registration failed: HTTP "+response.status+" "+text.slice(0,500));
}
