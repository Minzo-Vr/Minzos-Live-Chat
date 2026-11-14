// Static and simulated policy checks for Community Hub Realtime Database rules.
// This is not the Firebase Emulator; run the emulator for full rules-engine validation.
import fs from "node:fs";
import assert from "node:assert/strict";
import vm from "node:vm";

const rules=JSON.parse(fs.readFileSync(new URL("../database.rules.json",import.meta.url),"utf8")).rules;
assert.equal(Object.keys(rules).length,36,"Expected prior rules, Python collaboration, and role-based Hub access controls");
assert.equal(rules.chatPublicConfig[".read"],true);
assert.equal(rules.hubSiteAvailability[".read"],true);
assert.equal(rules.hubSiteRoleLocks[".read"],true,"Everyone must be able to read the role policy");
assert.ok(!(".write" in rules.hubSiteRoleLocks),"No public root-level role-policy writes allowed");
for(const key of ["member","plus","moderator","testsubject","admin"]){
 assert.equal(rules.hubSiteRoleLocks.$key[key][".validate"],"newData.val() === true",key+" role lock must be boolean true");
}
assert.equal(rules.hubSiteRoleLocks.$key.$other[".validate"],false,"Unknown roles are not allowed");
assert.equal(rules.chatPushSubscriptions[".read"],false);
assert.equal(rules.chatPushSubscriptions[".write"],false);
assert.ok(!(".read" in rules),"Root database must not be globally readable");
assert.ok(!(".write" in rules),"Root database must not be globally writable");

const eligible=[
 "chatSettings", "chatMessages", "chatRoles", "chatPresence"
];
for(const p of eligible){
 assert.ok(rules[p][".read"]?.includes("hubBlockedUsers"),p+" must exclude banned accounts");
 assert.ok(rules[p][".read"]?.includes("'custom'"),p+" must support verified Discord custom tokens");
}
for(const p of ["chatAdminUserDirectory","chatMemberDirectory"]){
 assert.ok(rules[p][".read"]?.includes("hubBlockedUsers"),p+" must exclude banned accounts");
}
assert.ok(rules.chatProfiles.$uid.name[".read"].includes("'custom'"),"Profile restoration must support Discord tokens");
assert.ok(rules.chatProfiles.$uid.name[".write"].includes("'custom'"),"Profile name saves must support Discord tokens");
assert.ok(rules.chatMessages[".write"].includes("chatRoles"),"Only admins may purge all messages");
assert.ok(rules.chatRoles.$uid[".write"].includes("auth.token.admin"),"Admin role changes must be verified");
assert.ok(rules.hubSiteAvailability.$key[".write"].includes("game-python-editor"),"Admin availability switches cover Python Editor");
assert.ok(rules.hubSiteAvailability.$key[".write"].includes("app-installer"),"Admin availability switches cover App Installer");
assert.ok(rules.hubSiteAvailability.$key[".write"].includes("music-maker"),"Admin availability switches cover Music Maker");
assert.ok(rules.hubSiteRoleLocks.$key[".write"].includes("music-maker"),"Role-lock policy covers Music Maker");
assert.ok(rules.hubSiteRoleLocks.$key[".write"].includes("app-installer"),"Role locks cover App Installer");
assert.ok(!(".read" in rules.hubPythonProjects),"Python projects cannot be publicly readable");
assert.ok(!(".write" in rules.hubPythonProjects),"Python projects cannot be publicly writable");
assert.ok(rules.hubPythonProjects.$uid.$projectId[".write"].includes("auth.uid === $uid"),"Private code writes must be UID-owned");
assert.ok(rules.hubPythonProjects.$uid.$projectId.code[".validate"].includes("20000"),"Code size is limited");

function rootOf(data){
 return {
  child(path){
   const parts=String(path).split("/").filter(Boolean);
   let value=data;
   for(const part of parts)value=value==null?null:value[part];
   return {val:()=>value===undefined?null:value,exists:()=>value!==null&&value!==undefined};
  }
 };
}
function account(uid,provider,claim=false){
 return uid?{uid,token:{admin:claim,firebase:{sign_in_provider:provider}}}:null;
}
function evaluate(expr,{user,roles={},blocks={},rooms={},anonymousEnabled=false,targetUid="",roomId="",key="chats"}={}){
 assert.equal(typeof expr,"string");
 const root=rootOf({
  chatRoles:roles,hubBlockedUsers:blocks,hubPythonRooms:rooms,
  chatPublicConfig:{anonymousEnabled},
 });
 return Boolean(vm.runInNewContext("("+expr+")",{
  auth:user??null,root,$uid:targetUid,$roomId:roomId,$key:{matches:regex=>regex.test(key)},now:Date.now()
 },{timeout:1500}));
}
const member=account("member1","google.com");
const discord=account("discord1","custom");
const adminRole=account("admin1","password");
const adminClaim=account("claim1","password",true);
const moderator=account("mod1","password");
const roles={
 admin1:{admin:true}, mod1:{moderator:true},
 claim1:{plus:true}, regular1:{plus:true}
};
const blocks={discord1:{blocked:true},admin1:{blocked:true}};
const readMessages=rules.chatMessages[".read"];
const clearAll=rules.chatMessages[".write"];
const changeSettings=rules.chatSettings.lockdown[".write"];
const readRoles=rules.chatRoles[".read"];
const readDir=rules.chatAdminUserDirectory[".read"];
assert.equal(evaluate(readMessages,{user:member,roles}),true,"Google member may read chat");
assert.equal(evaluate(readMessages,{user:discord,roles}),true,"Discord member may read chat");
assert.equal(evaluate(readRoles,{user:discord,roles}),true,"Discord member may read roles");
assert.equal(evaluate(readMessages,{user:discord,roles,blocks}),false,"Blocked Discord member cannot read chat");
assert.equal(evaluate(readMessages,{user:member,roles,blocks}),true,"Unblocked member remains allowed");
assert.equal(evaluate(readMessages,{user:null,roles}),false,"Unauthenticated chat read denied");
assert.equal(evaluate(clearAll,{user:member,roles}),false,"Member cannot clear chat");
assert.equal(evaluate(clearAll,{user:moderator,roles}),false,"Moderator cannot clear chat");
assert.equal(evaluate(clearAll,{user:adminRole,roles}),true,"DB-admin role can clear chat");
assert.equal(evaluate(clearAll,{user:adminClaim,roles}),true,"Admin claim can clear chat");
assert.equal(evaluate(clearAll,{user:adminRole,roles,blocks}),false,"Blocked admin role cannot clear chat");
assert.equal(evaluate(changeSettings,{user:adminRole,roles}),true,"DB admin can edit site settings");
assert.equal(evaluate(changeSettings,{user:moderator,roles}),false,"Moderator cannot edit admin settings");
const editRoleLocks=rules.hubSiteRoleLocks.$key[".write"];
assert.equal(evaluate(editRoleLocks,{user:adminRole,roles,key:"game-python-editor"}),true,"Verified admin can set Python Editor role lock");
assert.equal(evaluate(editRoleLocks,{user:adminRole,roles,key:"app-installer"}),true,"Verified admin can set App Installer role lock");
assert.equal(evaluate(editRoleLocks,{user:adminClaim,roles,key:"game-hub"}),true,"Admin custom claim can set Game Hub role lock");
assert.equal(evaluate(editRoleLocks,{user:member,roles,key:"game-python-editor"}),false,"Members cannot change role locks");
assert.equal(evaluate(editRoleLocks,{user:moderator,roles,key:"game-python-editor"}),false,"Moderators cannot change role locks");
assert.equal(evaluate(editRoleLocks,{user:adminRole,roles,blocks,key:"game-python-editor"}),false,"Blocked admins cannot edit role locks");
assert.equal(evaluate(editRoleLocks,{user:adminRole,roles,key:"unknown-app"}),false,"Unknown apps cannot be added to role lock policy");
assert.equal(evaluate(readDir,{user:member,roles}),false,"Member cannot see private admin directory");
assert.equal(evaluate(readDir,{user:adminRole,roles}),true,"DB admin can use private admin directory");
const blockSelf=rules.hubBlockedUsers.$uid[".read"];
assert.equal(evaluate(blockSelf,{user:member,targetUid:"member1"}),true,"Member may read own block status");
assert.equal(evaluate(blockSelf,{user:member,targetUid:"another"}),false,"Member cannot read another block record");
const readOwnPython=rules.hubPythonProjects.$uid[".read"];
assert.equal(evaluate(readOwnPython,{user:member,targetUid:"member1"}),true,"A signed-in member may read their own code");
assert.equal(evaluate(readOwnPython,{user:member,targetUid:"another"}),false,"Another account cannot read this code");
assert.equal(evaluate(readOwnPython,{user:null,targetUid:"member1"}),false,"Anonymous visitor cannot read this code");
assert.equal(evaluate(readOwnPython,{user:adminClaim,targetUid:"member1"}),false,"Even admins cannot read another user's code");
assert.equal(evaluate(readOwnPython,{user:discord,targetUid:"discord1"}),true,"Signed-in Discord user can read their own code");
assert.equal(evaluate(readOwnPython,{user:adminRole,targetUid:"admin1",blocks}),false,"Blocked account cannot read private code");
const exampleRoomId="room1234567890";
const rooms={ [exampleRoomId]:{ownerUid:"member1",members:{member1:true,discord1:true}} };
const roomRead=rules.hubPythonRooms.$roomId[".read"];
assert.equal(evaluate(roomRead,{user:member,rooms,roomId:exampleRoomId}),true,"Room owner can read code");
assert.equal(evaluate(roomRead,{user:discord,rooms,roomId:exampleRoomId}),true,"Invited member can read room");
assert.equal(evaluate(roomRead,{user:moderator,rooms,roomId:exampleRoomId}),false,"Uninvited member cannot read room");
assert.equal(evaluate(roomRead,{user:adminClaim,rooms,roomId:exampleRoomId}),false,"Uninvited Firebase Admin cannot read room code");
assert.equal(evaluate(roomRead,{user:discord,rooms,roomId:exampleRoomId,blocks:{discord1:{blocked:true}}}),false,"Blocked member cannot read shared code");
const roomWrite=rules.hubPythonRooms.$roomId.document[".write"];
assert.equal(evaluate(roomWrite,{user:discord,rooms,roomId:exampleRoomId}),true,"Invited member may collaboratively edit");
assert.equal(evaluate(roomWrite,{user:moderator,rooms,roomId:exampleRoomId}),false,"Uninvited member cannot edit");
const inviteWrite=rules.hubPythonRooms.$roomId.members.$memberUid[".write"];
assert.ok(inviteWrite.includes("ownerUid"),"Only the owner may approve collaborators");
const roomIndexRead=rules.hubPythonRoomIndex.$uid[".read"];
assert.equal(evaluate(roomIndexRead,{user:member,targetUid:"member1"}),true,"Member can see their own room list");
assert.equal(evaluate(roomIndexRead,{user:discord,targetUid:"member1"}),false,"Another member cannot read a room list");
const requestWrite=rules.hubPythonRoomRequests.$roomId.$uid[".write"];
assert.equal(evaluate(requestWrite,{user:moderator,rooms,roomId:exampleRoomId,targetUid:"mod1"}),true,"Visitor can request their own room access");
assert.equal(evaluate(requestWrite,{user:moderator,rooms,roomId:exampleRoomId,targetUid:"member1"}),false,"Visitor cannot forge room owner's access request");
assert.equal(evaluate(requestWrite,{user:discord,rooms,roomId:exampleRoomId,targetUid:"discord1"}),false,"Current member cannot request again");


console.log("PASS: 36 rules sections; login, collaboration privacy, and role-lock admin permissions verified.");
