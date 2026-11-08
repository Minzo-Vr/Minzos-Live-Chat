// Ensure Discord actually delivers slash commands to the standalone HTTP Worker.
// Uses the separate bot's GitHub Actions secret. Never logs or exports the token.
const token=process.env.YEEPS_DISCORD_BOT_TOKEN;
const expectedApplication="1568889350995972238";
const expectedPublicKey="6e0eb9eabc1764457124a8429751ca62a9c15fce97c314d3d79f5e5f24830f83";
const target="https://yeeps-card-pack-opener.kobefalzon8.workers.dev";
if(!token)throw Error("Missing YEEPS_DISCORD_BOT_TOKEN GitHub Actions secret");
const url="https://discord.com/api/v10/applications/@me";
const headers={Authorization:"Bot "+token,"Content-Type":"application/json"};
async function request(method,body){
 for(let i=0;i<6;i++){
  const response=await fetch(url,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.text();
  if(response.ok)return JSON.parse(value);
  if(response.status===429&&i<5){
   let s=3;try{s=Number(JSON.parse(value).retry_after)||s;}catch{}
   await new Promise(resolve=>setTimeout(resolve,Math.min(30000,Math.max(1500,Math.ceil(s*1000)+400))));
   continue;
  }
  throw Error(method+" Discord application failed: HTTP "+response.status+" "+value.slice(0,400));
 }
 throw Error("Too many Discord rate limits");
}
const app=await request("GET");
console.log("Application:",app.name,"("+app.id+")");
if(app.id!==expectedApplication)throw Error("The stored bot token belongs to the WRONG Discord application. Fix YEEPS_DISCORD_BOT_TOKEN; do not use Community Chat's token.");
if(app.verify_key?.toLowerCase()!==expectedPublicKey)throw Error("New Discord application's Public Key doesn't match the Cloudflare Worker. Verify that the same Discord application is selected.");
console.log("Endpoint status:",app.interactions_endpoint_url===target?"correct":app.interactions_endpoint_url?"incorrect":"missing");
if(app.interactions_endpoint_url!==target){
 console.log("Connecting Discord HTTP interactions to the deployed Yeeps Worker...");
 const updated=await request("PATCH",{interactions_endpoint_url:target});
 if(updated.interactions_endpoint_url!==target)throw Error("Discord did not confirm the interactions endpoint URL.");
 console.log("Success: Discord verified and saved the interactions endpoint.");
}else{
 console.log("Success: Discord is already configured to use the correct HTTP Worker endpoint.");
}
