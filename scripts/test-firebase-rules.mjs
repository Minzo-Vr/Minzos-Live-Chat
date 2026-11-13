// Static and simulated policy checks for Community Hub Realtime Database rules.
// This is not the Firebase Emulator; run the emulator for full rules-engine validation.
import fs from "node:fs";
import assert from "node:assert/strict";
import vm from "node:vm";

const rules=JSON.parse(fs.readFileSync(new URL("../database.rules.json",import.meta.url),"utf8")).rules;
assert.equal(Object.keys(rules).length,32,"Expected all 31 prior rule sections plus private Python projects");
assert.equal(rules.chatPublicConfig[".read"],true);
assert.equal(rules.hubSiteAvailability[".read"],true);
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
function evaluate(expr,{user,roles={},blocks={},anonymousEnabled=false,targetUid=""}={}){
 assert.equal(typeof expr,"string");
 const root=rootOf({
  chatRoles:roles,hubBlockedUsers:blocks,
  chatPublicConfig:{anonymousEnabled},
 });
 return Boolean(vm.runInNewContext("("+expr+")",{
  auth:user??null,root,$uid:targetUid,now:Date.now()
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

console.log("PASS: 32 sections retained, existing login checks and private Python project isolation assertions passed.");
