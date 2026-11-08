// Register global slash commands for the separate Yeeps Discord application.
// Never use the Community Chat application's bot token here.
const {YEEPS_DISCORD_BOT_TOKEN:token,YEEPS_DISCORD_APPLICATION_ID:app}=process.env;
if(!token||!/^[0-9]{15,22}$/.test(app||""))
 throw Error("Missing YEEPS_DISCORD_BOT_TOKEN or YEEPS_DISCORD_APPLICATION_ID.");
const commands=[
 {type:1,name:"openpack",description:"Open five virtual Yeeps-inspired cards with a Reveal Cards button",integration_types:[0],contexts:[0]},
 {type:1,name:"collection",description:"See your personal virtual Yeeps-inspired card collection",integration_types:[0],contexts:[0]},
 {type:1,name:"packhelp",description:"How to use the Yeeps-inspired card pack opener",integration_types:[0],contexts:[0]},
 {type:1,name:"cardadmin",description:"Open the admin-only Yeeps card management panel",integration_types:[0],contexts:[0],default_member_permissions:"8"}
];
const endpoint="https://discord.com/api/v10/applications/"+encodeURIComponent(app)+"/commands";
for(let attempt=0;attempt<8;attempt++){
 const r=await fetch(endpoint,{method:"PUT",headers:{authorization:"Bot "+token,"content-type":"application/json"},body:JSON.stringify(commands)});
 const body=await r.text();
 if(r.ok){
  const registered=JSON.parse(body);
  console.log("Registered "+registered.length+" commands for the separate Yeeps app.");
  break;
 }
 if(r.status===429&&attempt<7){
  let seconds=3;
  try{seconds=Number(JSON.parse(body).retry_after)||seconds;}catch{}
  await new Promise(resolve=>setTimeout(resolve,Math.min(30000,Math.max(1500,Math.ceil(seconds*1000)+500))));
  continue;
 }
 throw Error("Discord returned HTTP "+r.status+": "+body.slice(0,400));
}
