/* Minz Studio: original, offline-capable Web Audio music composer.
   All sound is synthesised in the browser; no third-party copyrighted samples. */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const names = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
const icons = {"Keys":"🎹","Guitars & Strings":"🎸","Bass":"🎸","Winds & Brass":"🎷","Synths & Pads":"✨","Drums":"🥁"};
const categories = ["All",...Object.keys(icons)];
const colors = ["#87dce3","#efb7e9","#a4b6ff","#ffd399","#f5a4a2","#c5a4fd","#9fe9bb","#f6d994","#f7a8c7","#9bbee2","#e5bd9e","#89dabf"];
const groups = {
"Keys": "Grand Piano|triangle;Soft Piano|sine;Bright Piano|triangle;Electric Piano|fm;Rhodes Keys|fm;Wurlitzer Keys|triangle;Harpsichord|sawtooth;Clavinet|square;Music Box|metal;Celesta|sine;Toy Piano|triangle;Honky Tonk|stack;Accordion|sawtooth;Drawbar Organ|sine;Church Organ|stack",
"Guitars & Strings": "Nylon Guitar|triangle;Acoustic Guitar|sawtooth;Steel Guitar|triangle;Electric Guitar|stack;Muted Guitar|square;Clean Guitar|triangle;Overdrive Guitar|sawtooth;Banjo|triangle;Ukulele|triangle;Harp|metal;Violin|sawtooth;Viola|sawtooth;Cello|triangle;Pizzicato Strings|square;String Ensemble|stack;Orchestral Harp|metal",
"Bass": "Finger Bass|triangle;Picked Bass|sawtooth;Slap Bass|square;Upright Bass|triangle;Synth Bass|sawtooth;Deep Sub Bass|sine;FM Bass|fm;Reese Bass|stack",
"Winds & Brass": "Flute|sine;Piccolo|sine;Recorder|triangle;Oboe|sawtooth;Clarinet|square;Bassoon|square;Alto Saxophone|sawtooth;Tenor Saxophone|sawtooth;Trumpet|sawtooth;Trombone|sawtooth;French Horn|triangle;Tuba|triangle;Pan Flute|sine;Harmonica|square",
"Synths & Pads": "Sine Lead|sine;Square Lead|square;Saw Lead|sawtooth;Pulse Lead|square;Chiptune Lead|square;Pluck Synth|triangle;Supersaw|stack;Analog Lead|stack;Bell Synth|metal;Glass Synth|fm;Retro Arcade|square;Vaporwave Keys|triangle;Warm Pad|stack;Dream Pad|sine;Choir Pad|triangle;Dark Pad|sawtooth;Space Pad|fm;Ambient Strings|stack;Analog Brass|sawtooth;Synth Choir|stack",
"Drums": "Kick Drum|kick;808 Kick|kick;Snare Drum|snare;Hand Clap|clap;Closed Hi-Hat|hat;Open Hi-Hat|hat;Low Tom|tom;High Tom|tom;Rimshot|rim;Cowbell|cowbell;Tambourine|hat;Shaker|hat;Crash Cymbal|hat;Ride Cymbal|hat;Woodblock|rim;Claves|rim;Bongo|tom;Congas|tom;Triangle|bell"
};
const instruments = [];
for (const [category,entries] of Object.entries(groups)) for (const entry of entries.split(";")) {
 const [name,wave] = entry.split("|"),id=name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
 instruments.push({name,id,wave,category});
}
const presets = new Map(instruments.map(p=>[p.id,p]));
const defaultIds = ["grand-piano","finger-bass","string-ensemble","sine-lead","kick-drum","snare-drum","closed-hi-hat","open-hi-hat"];
function midiName(n){return names[n%12]+(Math.floor(n/12)-1);}
function clamp(n,lo,hi){return Math.min(hi,Math.max(lo,n));}
function makeTrack(instrument,index){return {instrument,steps:Array(32).fill(null),volume:80,muted:false,solo:false,color:colors[index%colors.length]};}
function newState(){return {version:1,name:"My First Song",tempo:110,stepCount:16,swing:0,volume:72,selected:0,note:60,octave:4,tracks:defaultIds.map(makeTrack)};}
function validate(value){
 if(!value||typeof value!=="object"||!Array.isArray(value.tracks)||value.tracks.length<1||value.tracks.length>12)throw Error("Not a valid Minz Studio project.");
 const state=newState();
 state.name=String(value.name||"Untitled Song").slice(0,60);
 state.tempo=clamp(Math.round(Number(value.tempo)||110),50,220);
 state.stepCount=Number(value.stepCount)===32?32:16;
 state.swing=clamp(Math.round(Number(value.swing)||0),0,45);
 state.volume=clamp(Math.round(Number(value.volume)||72),0,100);
 state.octave=clamp(Math.round(Number(value.octave)||4),2,5);
 state.note=clamp(Math.round(Number(value.note)||60),24,95);
 state.selected=clamp(Math.round(Number(value.selected)||0),0,value.tracks.length-1);
 state.tracks=value.tracks.map((track,i)=>{
  if(!track||!presets.has(track.instrument)||!Array.isArray(track.steps)||track.steps.length>32)throw Error("An instrument or step array is invalid.");
  const safe=makeTrack(track.instrument,i);
  safe.steps=Array.from({length:32},(_,s)=>{
   const v=track.steps[s];
   if(v===null||v===undefined)return null;
   const n=Number(v);return Number.isInteger(n)&&n>=24&&n<=95?n:null;
  });
  safe.volume=clamp(Number.isFinite(Number(track.volume))?Math.round(Number(track.volume)):80,0,100);
  safe.muted=track.muted===true;safe.solo=track.solo===true;
  return safe;
 });
 return state;
}
const storageKey="minz-studio-song-v1";
let state=newState(),filter="",category="All",saveTimer=0;
try{const saved=localStorage.getItem(storageKey);if(saved)state=validate(JSON.parse(saved));}catch(error){console.warn("Saved project unavailable",error);}
function save(){try{localStorage.setItem(storageKey,JSON.stringify(state));return true;}catch(error){console.warn(error);return false;}}
function soonSave(){clearTimeout(saveTimer);saveTimer=setTimeout(save,220);}
function status(text,error=false){$("status").textContent=text;$("status").classList.toggle("error",error);}
function elem(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
function track(){return state.tracks[state.selected];}
function categoryTabs(){
 const root=$("categories");root.replaceChildren();
 for(const item of categories){
  const button=elem("button","category-btn",item);button.type="button";button.setAttribute("aria-pressed",String(category===item));
  button.addEventListener("click",()=>{category=item;categoryTabs();instrumentList();});root.append(button);
 }
}
function instrumentList(){
 const list=$("instrumentList"),top=list.scrollTop;list.replaceChildren();
 const found=instruments.filter(p=>(category==="All"||p.category===category)&&p.name.toLowerCase().includes(filter));
 for(const p of found){
  const button=elem("button","instrument"+(track().instrument===p.id?" selected":""));
  button.type="button";button.setAttribute("aria-label","Use "+p.name+" on selected track");
  const symbol=elem("span","ins-symbol",icons[p.category]);
  const label=elem("span","ins-name",p.name);label.append(elem("small","ins-kind",p.category));
  button.append(symbol,label);
  button.addEventListener("click",()=>{
   track().instrument=p.id;sequence();instrumentList();soonSave();
   void preview(p,state.note);status(p.name+" assigned to track "+(state.selected+1)+".");
  });
  list.append(button);
 }
 if(found.length===0)list.append(elem("p","hint","No matching instruments."));
 list.scrollTop=top;$("instrumentCount").textContent=instruments.length+" sounds";
}
for(let midi=36;midi<=95;midi++){
 const item=elem("option",null,midiName(midi));item.value=String(midi);$("notePicker").append(item);
}
let currentStep=-1;
function sequence(){
 const body=$("sequencer"),fragment=document.createDocumentFragment();
 const header=elem("div","seq-row");header.append(elem("span","seq-label","TRACK / BEATS"));
 const nums=elem("div","cells");
 for(let i=0;i<state.stepCount;i++)nums.append(elem("span","step-number",String(i+1)));
 header.append(nums);fragment.append(header);
 state.tracks.forEach((t,i)=>{
  const row=elem("div","seq-row"),meta=elem("div","track-meta"+(i===state.selected?" active":""));
  const name=elem("button","track-pick",(i+1)+". "+presets.get(t.instrument).name);
  name.type="button";name.append(elem("small",null,"Tap to change instrument"));
  name.addEventListener("click",()=>{state.selected=i;sequence();instrumentList();soonSave();});
  const actions=elem("div");
  for(const [label,prop] of [["M","muted"],["S","solo"]]){
   const btn=elem("button","mini"+(prop==="muted"?" muted":""),label);btn.type="button";
   btn.setAttribute("aria-pressed",String(t[prop]));btn.setAttribute("aria-label",(prop==="muted"?"Mute":"Solo")+" track "+(i+1));
   btn.addEventListener("click",()=>{t[prop]=!t[prop];sequence();soonSave();});
   actions.append(btn);
  }
  meta.append(name,actions);
  const vol=elem("label","track-vol");vol.append(elem("span",null,"Vol"));
  const slider=elem("input");slider.type="range";slider.min="0";slider.max="100";slider.value=String(t.volume);
  slider.setAttribute("aria-label","Track "+(i+1)+" volume");
  slider.addEventListener("input",()=>{t.volume=Number(slider.value);soonSave();});vol.append(slider);meta.append(vol);row.append(meta);
  const cells=elem("div","cells");
  for(let n=0;n<state.stepCount;n++){
   const note=t.steps[n];
   const cell=elem("button","step"+(n%4===0?" beat-start":"")+(note!==null?" filled":"")+(n===currentStep?" current":""),note===null?"·":midiName(note));
   cell.type="button";cell.dataset.step=String(n);cell.style.setProperty("--track-color",t.color);
   cell.setAttribute("aria-pressed",String(note!==null));
   cell.setAttribute("aria-label","Track "+(i+1)+", step "+(n+1)+", "+(note===null?"empty":midiName(note)));
   cell.title=note===null?"Add "+midiName(state.note):"Tap to clear or change the note";
   cell.addEventListener("click",()=>{
    state.selected=i;t.steps[n]=t.steps[n]===state.note?null:state.note;
    sequence();instrumentList();soonSave();
    if(t.steps[n]!==null)void preview(presets.get(t.instrument),t.steps[n],.6);
   });
   cells.append(cell);
  }
  row.append(cells);fragment.append(row);
 });
 body.replaceChildren(fragment);
 $("selectedTrackLabel").textContent="Track "+(state.selected+1)+": "+presets.get(track().instrument).name;
 $("notePicker").value=String(state.note);
 $("addTrackBtn").disabled=state.tracks.length>=12;
 $("removeTrackBtn").disabled=state.tracks.length<=1;
}
const sharps=new Set([1,3,6,8,10]),prior=[0,1,1,2,2,3,4,4,5,5,6,6];
function keyboard(){
 const board=$("keyboard");board.replaceChildren();
 const w=100/14,bw=w*.63;
 for(const blackPass of [false,true]){
  for(let step=0;step<24;step++){
   const black=sharps.has(step%12);if(black!==blackPass)continue;
   const midi=(state.octave+1)*12+step;
   const key=elem("button","key "+(black?"black":"white")+(midi===state.note?" active-note":""),black?"":midiName(midi));
   key.type="button";key.dataset.midi=String(midi);
   key.style.width=(black?bw:w)+"%";
   key.style.left=(prior[step%12]*w+(step>=12?7*w:0)+(black?-bw/2:0))+"%";
   key.setAttribute("aria-label","Play "+midiName(midi));
   key.addEventListener("pointerdown",e=>{
    if(e.pointerType==="mouse"&&e.button!==0)return;
    e.preventDefault();state.note=midi;keyboard();$("notePicker").value=String(midi);soonSave();
    void preview(presets.get(track().instrument),midi);
   });
   board.append(key);
  }
 }
 $("octaveDisplay").textContent="C"+state.octave+"–B"+(state.octave+1);
 $("octaveDown").disabled=state.octave<=2;$("octaveUp").disabled=state.octave>=5;
}
const noiseCache=new WeakMap();
function noiseBuffer(context){
 let buffer=noiseCache.get(context);if(buffer)return buffer;
 buffer=context.createBuffer(1,Math.ceil(context.sampleRate*2),context.sampleRate);
 const data=buffer.getChannelData(0);
 for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
 noiseCache.set(context,buffer);return buffer;
}
function frequency(midi){return 440*Math.pow(2,(midi-69)/12);}
function synth(context,out,preset,midi,at,duration,velocity=1){
 if(!preset||velocity<=0)return;
 if(preset.category==="Drums"){drum(context,out,preset,at,velocity);return;}
 const t=Math.max(at,context.currentTime||0),hz=frequency(midi),name=preset.name;
 const pad=/Pad|Ambient|Ensemble|Strings|Choir|Space|Church/.test(name);
 const pluck=/Piano|Guitar|Harp|Box|Banjo|Ukulele|Clavinet|Celesta|Pluck|Pizzicato|Toy/.test(name);
 const bass=preset.category==="Bass";
 const wind=preset.category==="Winds & Brass";
 const attack=pad?.3:wind?.065:pluck?.005:.012;
 const decay=pluck?.5:bass?.2:.2;
 const sustain=pluck?.12:pad?.86:wind?.73:.69;
 const release=pad?1.1:pluck?.35:wind?.28:.22;
 const end=t+Math.max(.12,duration,attack+decay+.02),stop=end+release+.03;
 const amp=context.createGain(),filter=context.createBiquadFilter();
 filter.type="lowpass";
 const cutoff=bass?1450:wind?3300:pad?2100:pluck?5400:6500;
 filter.frequency.setValueAtTime(Math.min(cutoff,context.sampleRate*.44),t);
 amp.connect(filter);filter.connect(out);
 const strength=Math.max(.0001,Math.min(.28,.23*velocity));
 amp.gain.setValueAtTime(.00001,t);
 amp.gain.linearRampToValueAtTime(strength,t+attack);
 amp.gain.exponentialRampToValueAtTime(Math.max(.0001,strength*sustain),t+attack+decay);
 amp.gain.setValueAtTime(Math.max(.0001,strength*sustain),end);
 amp.gain.exponentialRampToValueAtTime(.00001,stop);
 const stack=preset.wave==="stack"||/Overdrive|Reese|Ensemble/.test(name),voices=stack?3:1;
 for(let v=0;v<voices;v++){
  const osc=context.createOscillator(),mix=context.createGain();
  osc.type=preset.wave==="fm"||preset.wave==="metal"||stack?"sine":preset.wave;
  if(stack)osc.type=preset.category==="Keys"?"triangle":"sawtooth";
  osc.frequency.setValueAtTime(hz,t);
  osc.detune.value=stack?(v-1)*12:0;
  mix.gain.value=1/voices;osc.connect(mix);mix.connect(amp);
  if(preset.wave==="fm"||preset.wave==="metal"){
   const mod=context.createOscillator(),amount=context.createGain();
   mod.type="sine";mod.frequency.value=hz*(preset.wave==="metal"?3.4:2);
   amount.gain.value=hz*(preset.wave==="metal"?1.2:.44);
   mod.connect(amount);amount.connect(osc.frequency);
   mod.start(t);mod.stop(stop);
  }
  osc.start(t);osc.stop(stop);
 }
 if(pluck&&preset.wave!=="metal"){
  const harmonic=context.createOscillator(),level=context.createGain();
  harmonic.type="sine";harmonic.frequency.value=hz*2.01;level.gain.value=.19;
  harmonic.connect(level);level.connect(amp);harmonic.start(t);harmonic.stop(stop);
 }
}
function drum(context,out,preset,at,velocity){
 const t=Math.max(at,context.currentTime||0),name=preset.name;
 const loud=Math.max(.001,.35*velocity);
 function tone(pitch,duration,shape="sine",endPitch){
  const osc=context.createOscillator(),gain=context.createGain();
  osc.type=shape;osc.frequency.setValueAtTime(pitch,t);
  if(endPitch)osc.frequency.exponentialRampToValueAtTime(Math.max(25,endPitch),t+duration);
  gain.gain.setValueAtTime(loud,t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
  osc.connect(gain);gain.connect(out);osc.start(t);osc.stop(t+duration+.02);
 }
 function white(duration,cut=5000,amount=.7){
  const src=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
  src.buffer=noiseBuffer(context);filter.type="highpass";filter.frequency.value=Math.min(cut,context.sampleRate*.44);
  gain.gain.setValueAtTime(loud*amount,t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
  src.connect(filter);filter.connect(gain);gain.connect(out);
  src.start(t);src.stop(t+duration+.01);
 }
 if(/Kick/.test(name)){tone(name==="808 Kick"?105:155,name==="808 Kick"?.65:.29,"sine",name==="808 Kick"?35:48);}
 else if(/Snare/.test(name)){white(.18,1500,.9);tone(190,.11,"triangle",110);}
 else if(/Clap/.test(name))white(.2,2000,1);
 else if(/Hi-Hat/.test(name))white(/Open/.test(name)?.37:.08,7000,.7);
 else if(/Crash/.test(name))white(1.08,3300,.55);
 else if(/Ride/.test(name))white(.75,5100,.48);
 else if(/Shaker/.test(name))white(.12,7800,.43);
 else if(/Tambourine/.test(name)){white(.24,6500,.55);tone(1150,.06,"square");}
 else if(/Tom/.test(name))tone(/High/.test(name)?215:98,.26,"sine",/High/.test(name)?115:55);
 else if(/Bongo/.test(name))tone(360,.18,"sine",170);
 else if(/Conga/.test(name))tone(218,.24,"sine",108);
 else if(/Rimshot/.test(name))tone(760,.07,"triangle",420);
 else if(/Woodblock/.test(name))tone(840,.095,"triangle",510);
 else if(/Claves/.test(name))tone(1260,.055,"triangle",820);
 else if(/Cowbell/.test(name)){tone(550,.23,"square");tone(835,.2,"square");}
 else if(/Triangle/.test(name)){tone(1620,.58,"sine");tone(2310,.41,"sine");}
}
let ctx=null,master=null;
async function ensureAudio(){
 const Context=window.AudioContext||window.webkitAudioContext;
 if(!Context){status("Web Audio isn't available here. Try Safari or Chrome.",true);return false;}
 try{
  if(!ctx){ctx=new Context();master=ctx.createGain();master.connect(ctx.destination);}
  if(ctx.state!=="running")await ctx.resume();
  master.gain.setTargetAtTime(state.volume/100,ctx.currentTime,.02);
  return true;
 }catch(error){status("Audio could not start: "+error.message,true);return false;}
}
async function preview(preset,note=60,volume=.75){
 if(!(await ensureAudio()))return;
 synth(ctx,master,preset,note,ctx.currentTime+.008,.28,volume);
}
let playing=false,stepIndex=0,nextAt=0,interval=0,playBus=null,visualTimers=new Set();
function audible(t,solo){return !t.muted&&(!solo||t.solo);}
function stepLength(i){const base=60/state.tempo/4,swing=state.swing/100;return base*(i%2===0?1+swing:1-swing);}
function playhead(step){
 currentStep=step;
 for(const cell of $("sequencer").querySelectorAll(".step"))cell.classList.toggle("current",Number(cell.dataset.step)===step);
}
function queueBeat(n,at){
 const solo=state.tracks.some(t=>t.solo),length=stepLength(n);
 for(const t of state.tracks)if(t.steps[n]!==null&&audible(t,solo))synth(ctx,playBus,presets.get(t.instrument),t.steps[n],at,length*.88,t.volume/100);
 const timeout=setTimeout(()=>{visualTimers.delete(timeout);if(playing)playhead(n);},Math.max(0,(at-ctx.currentTime)*1000));
 visualTimers.add(timeout);
}
function scheduler(){
 if(!playing||!ctx)return;
 while(nextAt<ctx.currentTime+.125){
  queueBeat(stepIndex,nextAt);
  nextAt+=stepLength(stepIndex);
  stepIndex=(stepIndex+1)%state.stepCount;
 }
}
async function start(){
 if(playing)return;if(!(await ensureAudio()))return;
 playing=true;stepIndex=0;nextAt=ctx.currentTime+.06;
 playBus=ctx.createGain();playBus.connect(master);
 $("playBtn").textContent="♫ Playing";$("playBtn").setAttribute("aria-pressed","true");
 scheduler();interval=setInterval(scheduler,25);status("Playing "+state.stepCount+" steps · "+state.tempo+" BPM");
}
function stop(){
 playing=false;clearInterval(interval);interval=0;
 visualTimers.forEach(clearTimeout);visualTimers.clear();
 if(ctx&&playBus){playBus.gain.setTargetAtTime(.00001,ctx.currentTime,.012);playBus=null;}
 $("playBtn").textContent="▶ Play";$("playBtn").setAttribute("aria-pressed","false");playhead(-1);
}
function restart(){if(playing){stop();void start();}}
function sync(){
 $("songName").value=state.name;$("tempo").value=state.tempo;$("stepCount").value=state.stepCount;
 $("swing").value=state.swing;$("swingValue").textContent=state.swing+"%";
 $("masterVolume").value=state.volume;$("volumeValue").textContent=state.volume+"%";
 sequence();keyboard();instrumentList();soonSave();
}
function demo(){
 stop();state=newState();state.name="Minz Studio Demo";
 const add=(t,pairs)=>{for(const [index,note] of pairs)state.tracks[t].steps[index]=note;};
 add(0,[[0,60],[2,64],[4,67],[6,72],[8,69],[10,67],[12,64],[14,62]]);
 add(1,[[0,36],[4,36],[8,41],[12,43]]);
 add(2,[[0,48],[8,53]]);
 add(3,[[3,72],[7,74],[11,76],[15,79]]);
 add(4,[0,4,8,12].map(i=>[i,36]));
 add(5,[[4,38],[12,38]]);
 add(6,[0,2,4,6,8,10,12,14].map(i=>[i,42]));
 add(7,[[6,46],[14,46]]);
 sync();status("Demo beat ready. Press Play!");
}
function filename(){return (state.name||"Minz-Studio").replace(/[^a-z0-9_-]+/gi,"-").replace(/^-|-$/g,"").slice(0,60)||"Minz-Studio";}
function download(blob,name){
 const link=document.createElement("a"),url=URL.createObjectURL(blob);
 link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),20000);
}
function makeWav(buffer){
 const channels=Math.min(2,buffer.numberOfChannels),length=buffer.length,bytes=length*channels*2;
 const ab=new ArrayBuffer(44+bytes),view=new DataView(ab);
 function label(offset,str){for(let i=0;i<str.length;i++)view.setUint8(offset+i,str.charCodeAt(i));}
 label(0,"RIFF");view.setUint32(4,bytes+36,true);label(8,"WAVE");label(12,"fmt ");
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);
 view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*channels*2,true);
 view.setUint16(32,channels*2,true);view.setUint16(34,16,true);label(36,"data");view.setUint32(40,bytes,true);
 const data=Array.from({length:channels},(_,c)=>buffer.getChannelData(c));
 let offset=44;
 for(let i=0;i<length;i++)for(let c=0;c<channels;c++){
  const sample=clamp(data[c][i],-1,1);
  view.setInt16(offset,sample<0?sample*32768:sample*32767,true);offset+=2;
 }
 return new Blob([ab],{type:"audio/wav"});
}
async function exportWav(){
 const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
 if(!Offline){status("Offline WAV export is unavailable in this browser.",true);return;}
 const button=$("exportAudioBtn"),loops=Number($("exportLoops").value)||2;
 const durations=Array.from({length:state.stepCount},(_,i)=>stepLength(i));
 const seconds=loops*durations.reduce((a,b)=>a+b,0)+2;
 if(seconds>75){status("Choose fewer repeats for WAV export.",true);return;}
 button.disabled=true;status("Rendering your WAV locally…");
 try{
  const sampleRate=44100,offline=new Offline(2,Math.ceil(seconds*sampleRate),sampleRate),bus=offline.createGain();
  bus.gain.value=state.volume/100*.8;bus.connect(offline.destination);
  const solo=state.tracks.some(t=>t.solo);let at=.01;
  for(let loop=0;loop<loops;loop++)for(let step=0;step<state.stepCount;step++){
   for(const t of state.tracks){
    if(t.steps[step]!==null&&audible(t,solo))synth(offline,bus,presets.get(t.instrument),t.steps[step],at,durations[step]*.88,t.volume/100);
   }
   at+=durations[step];
  }
  const rendered=await offline.startRendering();
  download(makeWav(rendered),filename()+".wav");
  status("WAV exported. Your audio was rendered in this browser.");
 }catch(error){console.error("WAV export",error);status("WAV export failed: "+String(error.message||error).slice(0,140),true);}
 finally{button.disabled=false;}
}
$("instrumentSearch").addEventListener("input",e=>{filter=e.target.value.trim().toLowerCase();instrumentList();});
$("playBtn").addEventListener("click",()=>playing?stop():void start());
$("stopBtn").addEventListener("click",()=>{stop();status("Stopped.");});
$("tempo").addEventListener("change",e=>{state.tempo=clamp(Math.round(Number(e.target.value)||110),50,220);e.target.value=state.tempo;soonSave();restart();});
$("stepCount").addEventListener("change",e=>{state.stepCount=Number(e.target.value)===32?32:16;soonSave();restart();sequence();});
$("swing").addEventListener("input",e=>{state.swing=Number(e.target.value);$("swingValue").textContent=state.swing+"%";soonSave();});
$("masterVolume").addEventListener("input",e=>{
 state.volume=Number(e.target.value);$("volumeValue").textContent=state.volume+"%";
 if(ctx&&master)master.gain.setTargetAtTime(state.volume/100,ctx.currentTime,.025);
 soonSave();
});
$("songName").addEventListener("input",e=>{state.name=e.target.value.slice(0,60);soonSave();});
$("notePicker").addEventListener("change",e=>{state.note=Number(e.target.value);keyboard();soonSave();});
$("octaveDown").addEventListener("click",()=>{state.octave=Math.max(2,state.octave-1);keyboard();soonSave();});
$("octaveUp").addEventListener("click",()=>{state.octave=Math.min(5,state.octave+1);keyboard();soonSave();});
$("addTrackBtn").addEventListener("click",()=>{
 if(state.tracks.length>=12)return;
 state.tracks.push(makeTrack("saw-lead",state.tracks.length));state.selected=state.tracks.length-1;
 sync();status("New track added. Choose an instrument on the left.");
});
$("removeTrackBtn").addEventListener("click",()=>{
 if(state.tracks.length<=1)return;
 state.tracks.splice(state.selected,1);state.selected=Math.min(state.selected,state.tracks.length-1);
 state.tracks.forEach((t,i)=>t.color=colors[i%colors.length]);sync();status("Track removed.");
});
$("clearTrackBtn").addEventListener("click",()=>{track().steps.fill(null);sequence();soonSave();status("Track cleared.");});
$("clearAllBtn").addEventListener("click",()=>{
 if(!confirm("Start a blank song? Download your current project first if you want to keep it."))return;
 stop();state=newState();state.tracks.forEach(t=>t.steps.fill(null));sync();status("Blank song created.");
});
$("demoBtn").addEventListener("click",()=>{
 if(state.tracks.some(t=>t.steps.some(v=>v!==null))&&!confirm("Replace the current pattern with the demo beat?"))return;
 demo();
});
$("saveBtn").addEventListener("click",()=>{const ok=save();status(ok?"Saved to this browser.":"Local saving is blocked. Download the project JSON instead.",!ok);});
$("downloadProjectBtn").addEventListener("click",()=>{
 const project=JSON.stringify({...state,app:"Minz Studio",savedAt:new Date().toISOString()},null,2);
 download(new Blob([project],{type:"application/json"}),filename()+".json");
 status("Project JSON downloaded.");
});
$("importProjectBtn").addEventListener("click",()=>$("importProjectFile").click());
$("importProjectFile").addEventListener("change",async event=>{
 const file=event.target.files?.[0];event.target.value="";
 if(!file)return;if(file.size>262144){status("Project exceeds 256 KB.",true);return;}
 try{const imported=validate(JSON.parse(await file.text()));stop();state=imported;sync();status("Imported "+state.name+".");}
 catch(error){status("Import failed: "+String(error.message||error).slice(0,130),true);}
});
$("exportAudioBtn").addEventListener("click",()=>void exportWav());
const keyboardShortcuts=["KeyA","KeyW","KeyS","KeyE","KeyD","KeyF","KeyT","KeyG","KeyY","KeyH","KeyU","KeyJ","KeyK"];
document.addEventListener("keydown",e=>{
 if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName))return;
 const index=keyboardShortcuts.indexOf(e.code);if(index<0)return;
 e.preventDefault();const midi=(state.octave+1)*12+index;
 state.note=midi;$("notePicker").value=String(midi);keyboard();soonSave();void preview(presets.get(track().instrument),midi);
});
window.addEventListener("pagehide",()=>{stop();save();});
categoryTabs();sync();
if(state.tracks.some(t=>t.steps.some(v=>v!==null)))status("Project restored. Press Play to hear it.");
else status("Choose an instrument, tap keyboard keys, or press Demo Beat to start composing.");
})();