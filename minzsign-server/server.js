"use strict";
/**
 * MinzSign server: sign IPA files with user-supplied Apple credentials.
 * No shared/borrowed enterprise certificate; no bypass of Apple provisioning.
 * Run in a dedicated, isolated container. Do not use public/shared hosting for private keys.
 */
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const multer = require("multer");
const {rateLimit} = require("express-rate-limit");
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {randomBytes} = require("crypto");
const {mkdtemp, readFile, open, rm, unlink, stat} = require("fs/promises");
const {createReadStream} = require("fs");
const os = require("os");
const path = require("path");
const {spawn} = require("child_process");
const {promisify} = require("util");
const {execFile} = require("child_process");
const yauzl = require("yauzl");
const bplist = require("bplist-parser");
const plist = require("plist");
const execFileAsync = promisify(execFile);

const port = Number(process.env.PORT || 10000);
const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
const allowedOrigin = String(process.env.FRONTEND_ORIGIN || "").trim().replace(/\/$/, "");
const publicBase = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
const ready = Boolean(projectId && /^https:\/\/[^/]+$/.test(allowedOrigin) && /^https:\/\/[^/]+$/.test(publicBase));
if (projectId) initializeApp({projectId});
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({contentSecurityPolicy:false}));
app.use(cors({origin(origin, cb) {
  if (!origin || origin === allowedOrigin) return cb(null, true);
  return cb(new Error("Origin not allowed"));
}, methods:["GET","POST","OPTIONS"], allowedHeaders:["Authorization","Content-Type"]}));
app.use("/api/sign", rateLimit({windowMs:60*60*1000, limit:6, standardHeaders:"draft-7", legacyHeaders:false,
  message:{error:"Too many signing requests. Try again later."}}));
app.get("/health", (_req,res)=>res.json({ready,app:"MinzSign",version:1}));
const jobs = new Map(); // signed IPA only; all .p12 files are removed immediately
const TTL = 15*60*1000;
let active=0;

async function cleanupExpired() {
  for (const [token, job] of jobs) {
    if (job.expires <= Date.now()) {
      jobs.delete(token);
      await rm(job.dir,{recursive:true,force:true}).catch(()=>{});
    }
  }
}
setInterval(()=>{void cleanupExpired()},60*1000).unref();

function verifyBearer(req,res,next) {
  if (!ready) return res.status(503).json({error:"The signing backend has not been configured."});
  const match=/^Bearer (.+)$/.exec(req.headers.authorization||"");
  if (!match) return res.status(401).json({error:"Please sign in first."});
  getAuth().verifyIdToken(match[1]).then(decoded=>{
    if (!decoded.uid || decoded.firebase?.sign_in_provider === "anonymous") return res.status(403).json({error:"A full Community Hub account is required."});
    req.uid=decoded.uid;next();
  }).catch(()=>res.status(401).json({error:"Your login expired. Sign in again."}));
}
const fileNames={ipa:"original.ipa", certificate:"certificate.p12", profile:"profile.mobileprovision"};
const storage=multer.diskStorage({
  destination(req,_file,cb){cb(null,req.workdir)},
  filename(_req,file,cb){cb(null,fileNames[file.fieldname]||"invalid")}
});
const upload=multer({
 storage,
 limits:{fileSize:250*1024*1024,files:3,fields:1,fieldSize:2000,parts:4},
 fileFilter(_req,file,cb){cb(null,Object.hasOwn(fileNames,file.fieldname))}
}).fields([{name:"ipa",maxCount:1},{name:"certificate",maxCount:1},{name:"profile",maxCount:1}]);

function run(program,args,timeoutMs=180000) {
  return new Promise((resolve,reject)=>{
    const child=spawn(program,args,{shell:false,stdio:["ignore","ignore","ignore"],timeout:timeoutMs});
    child.once("error",reject);
    child.once("close",code=>code===0?resolve():reject(Error("Signing command failed ("+code+"). Check your certificate, password, and provisioning profile.")));
  });
}
async function readProvision(file,dir) {
  const xml=path.join(dir,"profile.xml");
  await execFileAsync("openssl",["cms","-verify","-inform","DER","-noverify","-in",file,"-out",xml],{timeout:15000,maxBuffer:1024*1024});
  const data=await readFile(xml,"utf8");
  await unlink(xml).catch(()=>{});
  const p=plist.parse(data);
  if(!p||typeof p!=="object")throw Error("Invalid provisioning profile.");
  return p;
}
function zipInfo(file) {
  return new Promise((resolve,reject)=>{
    yauzl.open(file,{lazyEntries:true,validateEntrySizes:true},(err,zip)=>{
      if(err)return reject(err);
      let settled=false;
      const fail=e=>{if(!settled){settled=true;zip.close();reject(e)}};
      zip.on("error",fail);
      zip.on("entry",entry=>{
        if(settled)return;
        if(!/^Payload\/[^/]+\.app\/Info\.plist$/.test(entry.fileName)){zip.readEntry();return}
        if(entry.uncompressedSize>1024*1024)return fail(Error("Invalid oversized Info.plist"));
        zip.openReadStream(entry,(e,stream)=>{
          if(e)return fail(e);
          const chunks=[];let size=0;
          stream.on("data",buf=>{size+=buf.length;if(size>1024*1024){stream.destroy(Error("Info.plist too large"));return}chunks.push(buf)});
          stream.on("error",fail);
          stream.on("end",()=>{
            try{
              const raw=Buffer.concat(chunks),binary=raw.subarray(0,6).toString("ascii")==="bplist";
              const info=binary?bplist.parseBuffer(raw)[0]:plist.parse(raw.toString("utf8"));
              if(!info || typeof info.CFBundleIdentifier!=="string")throw Error("No app bundle identifier");
              settled=true;zip.close();
              resolve({bundleId:info.CFBundleIdentifier,version:String(info.CFBundleShortVersionString||info.CFBundleVersion||"1"),title:String(info.CFBundleDisplayName||info.CFBundleName||"Signed app").slice(0,80)});
            }catch(x){fail(x)}
          });
        });
      });
      zip.on("end",()=>fail(Error("This IPA has no readable Payload/*.app/Info.plist")));
      zip.readEntry();
    });
  });
}
function profileMatchesApp(profile,bundleId){
  const applicationId=profile?.Entitlements?.["application-identifier"];
  if(typeof applicationId!=="string")return false;
  const pieces=applicationId.split(".");
  if(pieces.length<2)return false;
  const pattern=pieces.slice(1).join(".");
  return pattern==="*"||pattern===bundleId||(pattern.endsWith("*")&&bundleId.startsWith(pattern.slice(0,-1)));
}
function xmlEscape(input){return String(input).replace(/[<>&"']/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[c]))}
function manifest(job,token) {
  const ipaUrl=publicBase+"/api/files/"+token+"/signed.ipa";
  return '<?xml version="1.0" encoding="UTF-8"?>\n'+
   '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'+
   '<plist version="1.0"><dict><key>items</key><array><dict><key>assets</key><array><dict>'+
   '<key>kind</key><string>software-package</string><key>url</key><string>'+xmlEscape(ipaUrl)+'</string>'+
   '</dict></array><key>metadata</key><dict><key>bundle-identifier</key><string>'+xmlEscape(job.bundleId)+
   '</string><key>bundle-version</key><string>'+xmlEscape(job.version)+
   '</string><key>kind</key><string>software</string><key>title</key><string>'+xmlEscape(job.title)+
   '</string></dict></dict></array></dict></plist>';
}
app.post("/api/sign", verifyBearer, async(req,res)=>{
  if(active>=1)return res.status(429).json({error:"Another IPA is being signed. Try again shortly."});
  active++;
  let dir=null,keep=false;
  try{
    dir=await mkdtemp(path.join(os.tmpdir(),"minzsign-"));req.workdir=dir;
    await new Promise((resolve,reject)=>upload(req,res,e=>e?reject(e):resolve()));
    if(!req.files?.ipa?.[0]||!req.files?.certificate?.[0]||!req.files?.profile?.[0])throw Error("Provide .ipa, .p12 and .mobileprovision files.");
    if(typeof req.body.password!=="string"||!req.body.password.length||req.body.password.length>1000)throw Error("A valid .p12 password is required.");
    const ipa=req.files.ipa[0].path,cert=req.files.certificate[0].path,prov=req.files.profile[0].path;
    if((await stat(cert)).size>256*1024 || (await stat(prov)).size>3*1024*1024)throw Error("Certificate or provisioning profile is too large.");
    const fh=await open(ipa,"r");
    const header=Buffer.alloc(4);
    try{await fh.read(header,0,4,0)}finally{await fh.close()}
    if(header[0]!==0x50||header[1]!==0x4b||header[2]!==0x03||header[3]!==0x04)throw Error("The IPA is not a ZIP archive.");
    const profile=await readProvision(prov,dir);
    const info=await zipInfo(ipa);
    if(!profileMatchesApp(profile,info.bundleId))throw Error("The provisioning profile does not match this app's bundle identifier.");
    const out=path.join(dir,"signed.ipa");
    await run("zsign",["-k",cert,"-p",req.body.password,"-m",prov,"-o",out,ipa]);
    const signedInfo=await zipInfo(out);
    if(signedInfo.bundleId!==info.bundleId)throw Error("The signed bundle identifier unexpectedly changed.");
    // Remove originals/private keys/password-containing files; only the IPA stays briefly.
    await Promise.all([unlink(ipa),unlink(cert),unlink(prov)].map(p=>p.catch(()=>{})));
    req.body.password="";
    const token=randomBytes(32).toString("hex");
    const inHouse=profile.ProvisionsAllDevices===true;
    jobs.set(token,{dir,expires:Date.now()+TTL,bundleId:info.bundleId,version:info.version,title:info.title,inHouse});
    keep=true;
    res.json({downloadPath:"/api/files/"+token+"/signed.ipa",installManifestPath:inHouse?"/api/files/"+token+"/manifest.plist":null,expiresInSeconds:TTL/1000});
  }catch(e){
    const msg=e instanceof multer.MulterError?"Upload limit exceeded or invalid upload.":(e.message||"Signing failed.");
    res.status(400).json({error:String(msg).slice(0,200)});
  }finally{
    active--;
    if(dir&&!keep)await rm(dir,{recursive:true,force:true}).catch(()=>{});
  }
});
app.get("/api/files/:token/:name",async(req,res)=>{
  const token=req.params.token,name=req.params.name;
  if(!/^[a-f0-9]{64}$/.test(token))return res.sendStatus(404);
  const job=jobs.get(token);
  if(!job||job.expires<=Date.now())return res.sendStatus(404);
  res.set("Cache-Control","no-store");res.set("X-Content-Type-Options","nosniff");
  if(name==="manifest.plist"&&job.inHouse){res.type("application/xml").send(manifest(job,token));return}
  if(name!=="signed.ipa")return res.sendStatus(404);
  const file=path.join(job.dir,"signed.ipa");
  try{const st=await stat(file);res.set("Content-Type","application/octet-stream");res.set("Content-Disposition",'attachment; filename="minzsign-signed.ipa"');res.set("Content-Length",String(st.size));createReadStream(file).pipe(res)}
  catch{res.sendStatus(404)}
});
app.use((err,_req,res,_next)=>res.status(403).json({error:"Request was blocked."}));
app.listen(port,"0.0.0.0",()=>console.log("MinzSign API listening on "+port+" (configured: "+ready+")"));
