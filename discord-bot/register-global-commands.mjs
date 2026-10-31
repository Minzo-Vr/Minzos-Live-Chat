// Register public commands for both Discord User Install and Guild Install.
// Existing guild-only admin commands are left untouched.
// Run: DISCORD_BOT_TOKEN=... DISCORD_APPLICATION_ID=... DISCORD_GUILD_ID=... node discord-bot/register-global-commands.mjs
const {DISCORD_BOT_TOKEN:token,DISCORD_APPLICATION_ID:app,DISCORD_GUILD_ID:guild}=process.env;
if(!token||!app||!guild)throw Error("Set DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID and DISCORD_GUILD_ID");
const headers={Authorization:"Bot "+token,"Content-Type":"application/json"};
const base="https://discord.com/api/v10/applications/"+app;
async function api(url,init={}){
  const response=await fetch(url,{headers,...init});
  if(!response.ok)throw Error("Discord API HTTP "+response.status+" "+(await response.text()).slice(0,500));
  return response.json();
}
const existing=await api(base+"/guilds/"+guild+"/commands");
const names=["ping","sad","help","latest","updates","status"];
for(const name of names){
  const source=existing.find(command=>command.name===name&&command.type===1);
  if(!source)throw Error("Missing guild command /"+name+". Register existing guild commands first.");
  const command={
    type:1,name:source.name,description:source.description,
    ...(source.options?.length?{options:source.options}:{}),
    integration_types:[0,1],
    contexts:[0,1,2]
  };
  if(name==="sad"){
    command.description="Timed message (requires bot installed to send/delete)";
    const time=command.options?.find(option=>option.name==="time");
    if(time)time.description="Duration: 1s, 10s, 1m, 1h, 1d";
  }
  // POST is an upsert by command name; unlike PUT it does not erase unrelated global commands.
  await api(base+"/commands",{method:"POST",body:JSON.stringify(command)});
  console.log("Registered global /"+name+" for user and server installs");
}
console.log("Finished. Guild-only admin commands were not modified.");
