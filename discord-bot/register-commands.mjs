// Run locally: DISCORD_BOT_TOKEN=... DISCORD_APPLICATION_ID=... DISCORD_GUILD_ID=... node discord-bot/register-commands.mjs
const {DISCORD_BOT_TOKEN:token,DISCORD_APPLICATION_ID:app,DISCORD_GUILD_ID:guild}=process.env;
if(!token||!app||!guild)throw Error("Set DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID and DISCORD_GUILD_ID");
const commands=[
{name:"ping",description:"Check Community Chat bot"},
{name:"help",description:"List Community Chat bot commands"},
{name:"latest",description:"Show the latest published Community Chat update"},
{name:"updates",description:"Show recent Community Chat updates"},
{name:"status",description:"Get the Community Chat website"},
{name:"announce",description:"Post an admin announcement to Discord",default_member_permissions:"8",options:[{type:3,name:"message",description:"Announcement text",required:true,max_length:1500}]}
];
const res=await fetch(`https://discord.com/api/v10/applications/${app}/guilds/${guild}/commands`,{method:"PUT",headers:{authorization:"Bot "+token,"content-type":"application/json"},body:JSON.stringify(commands)});
if(!res.ok)throw Error("Discord command registration failed: HTTP "+res.status);
console.log("Registered "+(await res.json()).length+" guild slash commands");
