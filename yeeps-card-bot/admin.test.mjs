import test from "node:test";
import assert from "node:assert/strict";
import {handleAdminCommand,handleAdminInteraction} from "./admin.js";
import {drawYeepsPack,getCustomCards,getYeepsCollectionText,handleYeepsOpenPack,handleYeepsReveal} from "./packs.js";

const GUILD="1564239312613015585",USER="123456789012345678",OTHER="987654321098765432";
function kv(){
 const store=new Map(),metadata=new Map();
 return {store,
  async get(k,mode){const value=store.get(k);return value===undefined?null:mode==="json"?JSON.parse(value):value;},
  async put(k,v,options={}){store.set(k,v);if(options.metadata)metadata.set(k,options.metadata);},
  async delete(k){store.delete(k);metadata.delete(k);},
  async list({prefix,limit=1000}){
   const all=[...store.keys()].filter(k=>k.startsWith(prefix));
   return {keys:all.slice(0,limit).map(name=>({name,metadata:metadata.get(name)})),list_complete:all.length<=limit};
  }
 };
}
function admin({guild_id=GUILD,permissions="8",type=2,id=null,fields={}}={}){
 return {type,guild_id,member:{permissions,user:{id:USER}},data:{custom_id:id,components:Object.entries(fields).map(([custom_id,value])=>({type:1,components:[{type:4,custom_id,value}]}))}};
}
async function payload(response){return JSON.parse(await response.text());}
async function submit(env,id,fields,ctx={}){
 return payload(await handleAdminInteraction(admin({type:5,id:"cardadmin:"+id,fields}),env,ctx));
}
test("admin panel is hidden from members and admins in other servers",async()=>{
 const env={PACKS:kv(),YEEPS_ADMIN_GUILD_ID:GUILD};
 const denied=await payload(handleAdminCommand(admin({permissions:"0"}),env));
 assert.equal(denied.data.flags,64);
 assert.match(denied.data.content,/Administrator/);
 const other=await payload(await handleAdminInteraction(admin({guild_id:"111111111111111111",type:5,id:"cardadmin:submit-delete",fields:{target:"@everyone",confirm:"DELETE ALL"}}),env,{}));
 assert.match(other.data.content,/configured Discord server/);
 assert.equal(env.PACKS.store.size,0);
 const allowed=await payload(handleAdminCommand(admin(),env));
 assert.equal(allowed.data.components[0].components.length,3);
});
test("custom cards validate chance and difficulty and appear in packs",async()=>{
 const env={PACKS:kv(),YEEPS_ADMIN_GUILD_ID:GUILD};
 const view=await payload(await handleAdminInteraction(admin({type:3,id:"cardadmin:add"}),env,{}));
 assert.equal(view.type,9);
 const invalid=await submit(env,"submit-add",{name:"Admin Rare",chance:"120",difficulty:"Extreme"});
 assert.match(invalid.data.content,/between 0% and 100%/);
 const added=await submit(env,"submit-add",{name:"Admin Rare",chance:"100",difficulty:"Extreme"});
 assert.match(added.data.content,/Custom card created/);
 const cards=await getCustomCards(env);
 assert.equal(cards.length,1);
 assert.equal(cards[0].chance,100);
 assert.equal(cards[0].difficulty,"Extreme");
 const pack=drawYeepsPack(cards);
 assert.equal(pack.length,5);
 assert.equal(pack[0].name,"Admin Rare");
 assert.ok(["Rare","Epic","Legendary"].includes(pack[4].rarity));
 const duplicate=await submit(env,"submit-add",{name:"admin rare",chance:"10",difficulty:"Easy"});
 assert.match(duplicate.data.content,/already exists/);
});
test("give, single-user delete, global delete and stale-pack protection",async()=>{
 const env={PACKS:kv(),YEEPS_ADMIN_GUILD_ID:GUILD};
 const ctx={jobs:[],waitUntil(p){this.jobs.push(p);}};
 const gift=await submit(env,"submit-give",{target:OTHER,card:"Builder's Block",quantity:"2"},ctx);
 assert.match(gift.data.content,/Gave/);
 assert.match(await getYeepsCollectionText(OTHER,env),/2 cards/);
 const unauthorizedDelete=await submit(env,"submit-delete",{target:OTHER,confirm:"no"},ctx);
 assert.match(unauthorizedDelete.data.content,/No cards were changed/);
 assert.match(await getYeepsCollectionText(OTHER,env),/2 cards/);
 const deleted=await submit(env,"submit-delete",{target:OTHER,confirm:"DELETE USER"},ctx);
 assert.match(deleted.data.content,/Cleared/);
 assert.match(await getYeepsCollectionText(OTHER,env),/no cards yet/);
 await submit(env,"submit-give",{target:USER,card:"Portal Gun",quantity:"1"},ctx);
 await submit(env,"submit-give",{target:OTHER,card:"Harpoon",quantity:"1"},ctx);
 const pending=await payload(await handleYeepsOpenPack(admin(),env));
 const buttonId=pending.data.components[0].components[0].custom_id;
 const refused=await submit(env,"submit-delete",{target:"@everyone",confirm:"delete all"},ctx);
 assert.match(refused.data.content,/No cards were changed/);
 assert.match(await getYeepsCollectionText(USER,env),/1 cards/);
 const wipe=await submit(env,"submit-delete",{target:"@everyone",confirm:"DELETE ALL"},ctx);
 assert.match(wipe.data.content,/All users/);
 assert.deepEqual(wipe.data.allowed_mentions,{parse:[]});
 assert.match(await getYeepsCollectionText(USER,env),/no cards yet/);
 assert.match(await getYeepsCollectionText(OTHER,env),/no cards yet/);
 const stale=await payload(await handleYeepsReveal({...admin({type:3,id:buttonId}),data:{custom_id:buttonId}},env));
 assert.match(stale.data.content,/predates a collection reset/);
 await Promise.all(ctx.jobs);
});
