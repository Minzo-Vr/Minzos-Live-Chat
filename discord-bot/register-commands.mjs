// Run locally: DISCORD_BOT_TOKEN=... DISCORD_APPLICATION_ID=... DISCORD_GUILD_ID=... node discord-bot/register-commands.mjs
const {DISCORD_BOT_TOKEN:token,DISCORD_APPLICATION_ID:app,DISCORD_GUILD_ID:guild}=process.env;
if(!token||!app||!guild)throw Error("Set DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID and DISCORD_GUILD_ID");
const commands=[
{name:"ping",description:"Check Community Chat bot"},
{name:"help",description:"List Community Chat bot commands"},
{name:"latest",description:"Show the latest published Community Chat update"},
{name:"updates",description:"Show recent Community Chat updates"},
{name:"status",description:"Get the Community Chat website"},
{name:"applications",description:"Post an application opening for moderators or test subjects",default_member_permissions:"8",options:[
 {type:3,name:"type",description:"Application category",required:true,choices:[{name:"Moderator",value:"moderator"},{name:"Test Subjects / Lab Rats",value:"test_subjects"}]},
 {type:3,name:"role",description:"Role to notify (choose a Discord role)",required:true},
 {type:3,name:"apply_url",description:"Application form HTTPS link",required:true},
 {type:3,name:"info_url",description:"Information channel or page HTTPS link",required:true},
 {type:3,name:"closes",description:"Closing date or deadline (optional)",required:false},
 {type:3,name:"starts",description:"When applications open (optional)",required:false},
 {type:3,name:"results",description:"When applicants hear back (optional)",required:false}
]},
{name:"announce",description:"Post an admin announcement to Discord",default_member_permissions:"8",options:[{type:3,name:"message",description:"Announcement text",required:true,max_length:1500}]}
];
const res=await fetch(`https://discord.com/api/v10/applications/${app}/guilds/${guild}/commands`,{method:"PUT",headers:{authorization:"Bot "+token,"content-type":"application/json"},body:JSON.stringify(commands)});
if(!res.ok)throw Error("Discord command registration failed: HTTP "+res.status);
console.log("Registered "+(await res.json()).length+" guild slash commands");
