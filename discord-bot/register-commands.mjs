// Register guild-only commands. Public commands are registered globally instead.
import {commands,PUBLIC_COMMAND_NAMES} from "./command-definitions.mjs";
const {DISCORD_BOT_TOKEN:token,DISCORD_APPLICATION_ID:app,DISCORD_GUILD_ID:guild}=process.env;
if(!token||!app||!guild)throw Error("Set DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID and DISCORD_GUILD_ID");
const publicNames=new Set(PUBLIC_COMMAND_NAMES);
const guildCommands=commands.filter(command=>!publicNames.has(command.name));
if(!guildCommands.length||guildCommands.some(command=>command.default_member_permissions!=="8"))
 throw Error("Expected only admin-only guild commands; refusing to overwrite.");
const res=await fetch(`https://discord.com/api/v10/applications/${app}/guilds/${guild}/commands`,{method:"PUT",headers:{authorization:"Bot "+token,"content-type":"application/json"},body:JSON.stringify(guildCommands)});
if(!res.ok)throw Error("Discord command registration failed: HTTP "+res.status);
console.log("Registered "+(await res.json()).length+" guild-only commands; duplicates of "+PUBLIC_COMMAND_NAMES.length+" global commands were removed.");
