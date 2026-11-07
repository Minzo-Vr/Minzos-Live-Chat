/**
 * Usage: node billing/merge-firebase-rules.mjs ./firebase-rules-backup.json ./firebase-rules-with-chatplus.json
 * Preserves all existing Firebase rules and adds server-owned billing access.
 * This does NOT deploy to Firebase; review the diff and publish manually.
 */
import {readFileSync,writeFileSync} from "node:fs";
const [input,output]=process.argv.slice(2);
if(!input||!output||input===output)throw Error("Provide distinct backup JSON input and output filenames.");
const old=JSON.parse(readFileSync(input,"utf8"));
if(!old||typeof old.rules!=="object"||Array.isArray(old.rules))throw Error("Expected Firebase rules JSON containing a top-level 'rules' object.");
const copy=structuredClone(old);
const entitlement="(root.child('chatBillingEntitlements/'+auth.uid+'/stripe/active').val() === true && root.child('chatBillingEntitlements/'+auth.uid+'/stripe/expiresAt').val() > now || root.child('chatBillingEntitlements/'+auth.uid+'/apple/active').val() === true && root.child('chatBillingEntitlements/'+auth.uid+'/apple/expiresAt').val() > now)";
const needles=[
 "root.child('chatRoles/'+auth.uid+'/plus').val() === true",
 "root.child('chatRoles/'+auth.uid).val() === 'plus'",
 "root.child('chatRoles').child(auth.uid).child('plus').val() === true",
 "root.child('chatRoles').child(auth.uid).val() === 'plus'"
];
let replacements=0;
function walk(node){
 if(!node||typeof node!=="object")return;
 for(const [key,v] of Object.entries(node)){
  if(typeof v==="string"&&(key===".read"||key===".write"||key===".validate")){
   let next=v;
   for(const needle of needles){
    if(next.includes(needle)){
     // A full parenthesized condition preserves the previous role test,
     // while allowing a separately verified, unexpired paid subscription.
     next=next.split(needle).join("("+needle+" || "+entitlement+")");
     replacements++;
    }
   }
   node[key]=next;
  }else if(v&&typeof v==="object")walk(v);
 }
}
walk(copy.rules);
if(replacements<3)throw Error("Expected existing Plus role rules were not found; refusing to produce a partially integrated rules file.");
if(copy.rules.chatBillingEntitlements||copy.rules.chatBillingPrivate)throw Error("Billing rules are already present. Review or merge manually to avoid overwriting existing rules.");
copy.rules.chatBillingEntitlements={
 "$uid":{
  ".read":"auth != null && auth.uid === $uid",
  ".write":false
 }
};
copy.rules.chatBillingPrivate={".read":false,".write":false};
writeFileSync(output,JSON.stringify(copy,null,2)+"\n");
console.log("Wrote "+output+". Updated "+replacements+" existing Plus checks; all other rule nodes preserved.");
console.log("IMPORTANT: Compare this file with your backup and publish it in Firebase Console only when ready.");
