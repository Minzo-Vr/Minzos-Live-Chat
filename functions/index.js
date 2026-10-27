"use strict";
const {onValueCreated}=require("firebase-functions/v2/database");
const {defineSecret}=require("firebase-functions/params");
const {logger}=require("firebase-functions");
const DISCORD_ANNOUNCEMENTS_WEBHOOK=defineSecret("DISCORD_ANNOUNCEMENTS_WEBHOOK");

exports.postCommunityAnnouncement=onValueCreated({
  ref:"/chatAnnouncementPublished/{releaseId}",
  instance:"website-chat-80038-default-rtdb",
  region:"us-central1",
  secrets:[DISCORD_ANNOUNCEMENTS_WEBHOOK],
  retry:false
},async event=>{
  const release=event.data.val();
  if(!release||!Array.isArray(release.features))return;
  const version=String(release.version||event.params.releaseId).slice(0,80);
  const features=release.features.filter(x=>typeof x==="string").slice(0,35);
  const description=features.join("\n").slice(0,3900)||"A new update has been published.";
  const payload={
    username:"Community Chat Announcements",
    allowed_mentions:{parse:[]},
    embeds:[{
      title:"📢 Community Chat — Update "+version,
      description,
      color:5793266,
      footer:{text:"Official Community Chat announcement"},
      timestamp:new Date(Number(release.publishedAt)||Date.now()).toISOString()
    }]
  };
  const response=await fetch(DISCORD_ANNOUNCEMENTS_WEBHOOK.value(),{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify(payload)
  });
  if(!response.ok){
    logger.error("Discord announcement failed",{status:response.status,releaseId:event.params.releaseId});
    throw Error("Discord returned "+response.status);
  }
  logger.info("Discord announcement posted",{releaseId:event.params.releaseId});
});
