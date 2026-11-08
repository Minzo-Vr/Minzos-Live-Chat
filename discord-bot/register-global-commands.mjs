import {commands as existing,PUBLIC_COMMAND_NAMES as names} from "./command-definitions.mjs";
// Register public commands for both Discord User Install and Guild Install.
// Existing guild-only admin commands are left untouched.
// Run: DISCORD_BOT_TOKEN=... DISCORD_APPLICATION_ID=... DISCORD_GUILD_ID=... node discord-bot/register-global-commands.mjs
const {DISCORD_BOT_TOKEN:token,DISCORD_APPLICATION_ID:app}=process.env;
if(!token||!app)throw Error("Set DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID");
const headers={Authorization:"Bot "+token,"Content-Type":"application/json"};
const base="https://discord.com/api/v10/applications/"+app;
async function api(url,init={}){
  for(let attempt=0;attempt<8;attempt++){
    const response=await fetch(url,{headers,...init});
    if(response.ok)return response.status===204?null:response.json();
    const body=(await response.text()).slice(0,500);
    if(response.status===429&&attempt<7){
      let seconds=3;
      try{seconds=Number(JSON.parse(body).retry_after)||seconds;}catch{}
      const delay=Math.min(30000,Math.max(1500,Math.ceil(seconds*1000)+500));
      console.warn("Discord rate limit, retry in "+delay+" ms");
      await new Promise(resolve=>setTimeout(resolve,delay));
      continue;
    }
    throw Error("Discord API HTTP "+response.status+" "+body);
  }
  throw Error("Discord command registration retries exhausted");
}
// Use the same canonical definitions as the guild registrar, not the guild API.
const retired=await api(base+"/commands");
for(const command of retired.filter(x=>["openpack","collection"].includes(x.name)&&x.type===1)){
  await api(base+"/commands/"+command.id,{method:"DELETE"});
  console.log("Removed old Community Chat global /"+command.name);
}

for(const name of names){
  const source=existing.find(command=>command.name===name);
  if(!source)throw Error("Missing command definition for /"+name+".");
  const command={
    type:1,name:source.name,description:source.description,
    ...(source.options?.length?{options:source.options}:{}),
    integration_types:[0,1],
    contexts:[0,1,2]
  };
  if(name==="ask"){
    command.description="Ask Community Hub AI about any app or general topic";
    command.options=[
      {type:3,name:"question",description:"What would you like to ask?",required:true,max_length:1200},
      {type:3,name:"category",description:"Choose the app or topic",required:true,choices:[
        {name:"Chats",value:"chats"},
        {name:"User",value:"user"},
        {name:"Login",value:"login"},
        {name:"Shapes and Colors",value:"shapes_and_colors"},
        {name:"Update Centre",value:"update_centre"},
        {name:"Ai (Admin Only)",value:"ai_admin"},
        {name:"All",value:"all"},
        {name:"Generic Question",value:"generic_question"}
      ]},
      {type:3,name:"visibility",description:"Who can see the question and answer?",required:false,choices:[{name:"Everyone",value:"everyone"},{name:"Only Me",value:"only_me"}]}
    ];
    // /ask only works in the configured guild support channel, not DMs.
    command.integration_types=[0];command.contexts=[0];
  }
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
