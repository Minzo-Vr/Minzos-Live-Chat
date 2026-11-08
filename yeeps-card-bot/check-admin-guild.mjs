// Read-only diagnostic. Does not print or change Discord credentials.
const token=process.env.YEEPS_DISCORD_BOT_TOKEN;
if(!token)throw Error("YEEPS_DISCORD_BOT_TOKEN is not configured");
const response=await fetch("https://discord.com/api/v10/users/@me/guilds?limit=100",{headers:{authorization:"Bot "+token}});
if(!response.ok){
  console.log("Discord bot guild listing is unavailable: HTTP "+response.status);
  process.exit(0);
}
const guilds=await response.json();
if(!Array.isArray(guilds))throw Error("Unexpected guild response");
console.log("Yeeps bot guilds:",guilds.map(x=>({id:x.id,name:x.name})));
console.log("Configured admin guild:", "1564239312613015585");
