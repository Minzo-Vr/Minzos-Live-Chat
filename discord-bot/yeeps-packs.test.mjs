import test from "node:test";
import assert from "node:assert/strict";
import {drawYeepsPack,handleYeepsOpenPack,handleYeepsReveal,getYeepsCollectionText} from "./yeeps-packs.js";

function makeKV(){
  const store=new Map();
  return {
    store,
    async get(key,type){const value=store.get(key);return value===undefined?null:type==="json"?JSON.parse(value):value;},
    async put(key,value){store.set(key,value);},
    async list({prefix,limit=1000}){
      const keys=[...store.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(name=>({name}));
      return {keys,list_complete:true};
    }
  };
}
function interaction(userId,customId){
  return {member:{user:{id:userId}},data:{custom_id:customId}};
}
const FIRST_USER="123456789012345678";
const SECOND_USER="987654321098765432";

test("5 unique cards per pack, at least one Rare-or-higher",()=>{
  for(let i=0;i<300;i++){
    const cards=drawYeepsPack();
    assert.equal(cards.length,5);
    assert.equal(new Set(cards.map(c=>c.id)).size,5);
    assert.ok(["Rare","Epic","Legendary"].includes(cards[4].rarity));
  }
});

test("pack is hidden until its owner reveals, then saved once",async()=>{
  const kv=makeKV();
  const env={SAD_MESSAGES:kv};
  const opened=JSON.parse(await (await handleYeepsOpenPack(interaction(FIRST_USER),env)).text());
  assert.equal(opened.type,4);
  assert.doesNotMatch(JSON.stringify(opened),/Builder's Block|Horror Shark|Anniversary Yeep/);
  const button=opened.data.components[0].components[0];
  assert.equal(button.label,"Reveal Cards");
  const buttonId=button.custom_id;
  assert.match(buttonId,/^yeeps:reveal:/);

  const unauthorized=JSON.parse(await (await handleYeepsReveal(interaction(SECOND_USER,buttonId),env)).text());
  assert.equal(unauthorized.type,4);
  assert.equal(unauthorized.data.flags,64);
  assert.equal([...kv.store.keys()].filter(key=>key.includes(":collection:")).length,0);

  const reveal=JSON.parse(await (await handleYeepsReveal(interaction(FIRST_USER,buttonId),env)).text());
  assert.equal(reveal.type,7);
  assert.equal(reveal.data.components.length,0);
  assert.match(reveal.data.embeds[0].description,/1\./);
  assert.match(reveal.data.embeds[0].description,/5\./);

  const replay=JSON.parse(await (await handleYeepsReveal(interaction(FIRST_USER,buttonId),env)).text());
  assert.deepEqual(replay.data,reveal.data);
  assert.equal([...kv.store.keys()].filter(key=>key.includes(":collection:")).length,1);

  const collection=await getYeepsCollectionText(FIRST_USER,kv?env:{});
  assert.match(collection,/5 cards/);
  assert.match(collection,/1 packs/);
  const othersCollection=await getYeepsCollectionText(SECOND_USER,env);
  assert.match(othersCollection,/no cards yet/);
});

test("missing KV gives a private setup warning",async()=>{
  const opened=JSON.parse(await (await handleYeepsOpenPack(interaction(FIRST_USER),{})).text());
  assert.equal(opened.type,4);
  assert.equal(opened.data.flags,64);
  assert.match(opened.data.content,/SAD_MESSAGES/);
});
