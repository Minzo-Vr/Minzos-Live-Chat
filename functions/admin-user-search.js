"use strict";

// Read-only Community Hub admin account lookup. Never return credentials,
// Firebase tokens, private DMs or private user bio/avatar values.
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {getApps,initializeApp}=require("firebase-admin/app");
const {getAuth}=require("firebase-admin/auth");
const {getDatabase}=require("firebase-admin/database");
const {logger}=require("firebase-functions");
if(!getApps().length){
  initializeApp({databaseURL:"https://website-chat-80038-default-rtdb.firebaseio.com/"});
}
const REGION="us-central1";
const MAX_RESULTS=25;
const MAX_QUERY_LENGTH=80;
const MAX_PAGE_TOKEN_LENGTH=2048;

function rolesFromRaw(raw){
  if(typeof raw==="string")return raw==="member"?[]:[raw];
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return [];
  return Object.keys(raw).filter(key=>raw[key]===true&&/^[a-z0-9_-]{1,32}$/i.test(key)).slice(0,20);
}
function cleanDisplayName(value,fallback="Community member"){
  return typeof value==="string"&&value.trim()?value.trim().slice(0,80):fallback;
}
async function verifyCurrentAdmin(request){
  const uid=request.auth?.uid;
  if(!uid||typeof uid!=="string")throw new HttpsError("unauthenticated","Sign in first.");
  const caller=await getAuth().getUser(uid);
  if(caller.disabled)throw new HttpsError("permission-denied","Disabled account.");
  const roleSnap=await getDatabase().ref("chatRoles/"+uid).get();
  const role=roleSnap.val();
  // Evaluate admin privileges on the server. Client-controlled UI is not trusted.
  const roleAdmin=role==="admin"||(role&&typeof role==="object"&&role.admin===true);
  const claimAdmin=request.auth.token?.admin===true;
  if(!roleAdmin&&!claimAdmin)throw new HttpsError("permission-denied","Verified Community Hub administrator required.");
  return caller;
}
exports.searchCommunityUsers=onCall({
  region:REGION,
  cors:["https://minzo-vr.github.io"],
  maxInstances:3,
  timeoutSeconds:30,
  memory:"256MiB"
},async request=>{
  const admin=await verifyCurrentAdmin(request);
  const input=request.data||{};
  const text=typeof input.query==="string"?input.query.trim():"";
  if(text.length<2||text.length>MAX_QUERY_LENGTH){
    throw new HttpsError("invalid-argument","Search using at least 2 characters (maximum 80).");
  }
  let pageToken;
  if(input.pageToken!==undefined&&input.pageToken!==null&&input.pageToken!==""){
    if(typeof input.pageToken!=="string"||input.pageToken.length>MAX_PAGE_TOKEN_LENGTH){
      throw new HttpsError("invalid-argument","Invalid search page.");
    }
    pageToken=input.pageToken;
  }
  const needle=text.toLocaleLowerCase("en");
  try{
    const [page,profilesSnap,rolesSnap,directorySnap]=await Promise.all([
      getAuth().listUsers(1000,pageToken),
      getDatabase().ref("chatProfiles").get(),
      getDatabase().ref("chatRoles").get(),
      getDatabase().ref("chatMemberDirectory").get()
    ]);
    const profiles=profilesSnap.val()||{};
    const roles=rolesSnap.val()||{};
    const directory=directorySnap.val()||{};
    const found=[];
    for(const person of page.users){
      const uid=person.uid;
      const profile=profiles[uid]&&typeof profiles[uid]==="object"?profiles[uid]:{};
      const directoryName=directory[uid]?.name;
      const name=cleanDisplayName(profile.name,
        cleanDisplayName(directoryName,cleanDisplayName(person.displayName, "Community member")));
      const searchText=[name,person.email||"",person.uid,person.displayName||"",directoryName||""]
        .join(" ").toLocaleLowerCase("en");
      if(!searchText.includes(needle))continue;
      const privacy=["everyone","friends","none"].includes(profile.privacy)?profile.privacy:"everyone";
      const publiclyVisible=privacy==="everyone";
      found.push({
        uid,
        name,
        roles:rolesFromRaw(roles[uid]),
        privacy,
        // Respect the user's profile visibility setting, including for admin inspection.
        avatar:publiclyVisible&&typeof profile.avatar==="string"&&
          /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\//.test(profile.avatar)?
          profile.avatar.slice(0,450):"",
        bio:publiclyVisible&&typeof profile.bio==="string"?profile.bio.slice(0,160):"",
        providers:[...new Set((person.providerData||[]).map(x=>x.providerId).filter(x=>
          ["google.com","password","facebook.com","apple.com","github.com","twitter.com"].includes(x)))].slice(0,6),
        createdAt:person.metadata?.creationTime||null,
        lastSignInAt:person.metadata?.lastSignInTime||null,
        disabled:person.disabled===true
      });
      if(found.length>=MAX_RESULTS)break;
    }
    found.sort((a,b)=>a.name.localeCompare(b.name));
    // No search text, email address or token is stored in logs.
    void getDatabase().ref("chatActivityLog").push({
      uid:admin.uid,
      actorName:cleanDisplayName(admin.displayName,"Admin").slice(0,60),
      action:"admin_user_search",
      detail:"matches="+found.length,
      at:Date.now()
    }).catch(error=>logger.warn("Could not audit admin user search",{code:error?.code||"unknown"}));
    return {
      users:found,
      nextPageToken:page.pageToken||null,
      limit:MAX_RESULTS,
      scanned:page.users.length
    };
  }catch(error){
    if(error instanceof HttpsError)throw error;
    logger.error("Admin user search unavailable",{code:error?.code||"unknown"});
    throw new HttpsError("unavailable","Account search could not be completed. Please try again.");
  }
});
