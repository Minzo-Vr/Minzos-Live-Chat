// Generated iOS projects should expose Documents to Files.app, including
// imported GLB/ZIP/JSON files kept by the native file bridge.
import {existsSync,readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";

const plist=resolve(import.meta.dirname,"../ios/App/App/Info.plist");
if(!existsSync(plist)){
  console.log("No generated iOS Info.plist yet; skipping iOS Files integration.");
  process.exit(0);
}
let xml=readFileSync(plist,"utf8");
for(const key of ["UIFileSharingEnabled","LSSupportsOpeningDocumentsInPlace"]){
  const exact=new RegExp("(<key>"+key+"<\\/key>\\s*)<(?:true|false)\\s*\\/>");
  if(exact.test(xml)){
    xml=xml.replace(exact,"$1<true/>");
  }else{
    const i=xml.lastIndexOf("</dict>");
    if(i<0)throw Error("Cannot find root Info.plist dictionary");
    xml=xml.slice(0,i)+"  <key>"+key+"</key>"+String.fromCharCode(10)+"  <true/>"+String.fromCharCode(10)+xml.slice(i);
  }
}
writeFileSync(plist,xml);
console.log("iOS Files app sharing enabled for Community Hub imports.");
