/* Minzify — free-to-stream music discovery with Audius.
 * Artist-controlled streams only. No scraping, ripping, DRM circumvention,
 * third-party uploads, hidden downloads, or Spotify catalogue claims.
 * Local favourites and playlists are stored on this device.
 */
(()=>{
  "use strict";
  const API_BASES=["https://api.audius.co/v1","https://discoveryprovider.audius.co/v1"];
  const STORAGE_PREFIX="minzify-v1:";
  const MAX_TRACKS=300,MAX_PLAYLISTS=50;
  const el=id=>document.getElementById(id);
  const audio=el("audioElement");
  const state={
    view:"home",searchResults:[],trending:[],fresh:[],current:null,
    queue:[],index:-1,shuffle:false,repeat:0,busySearch:null,
    likes:load("likes",{}),playlists:load("playlists",[]),recent:load("recent",[]),
    volume:Number(load("volume",75)),playlistId:null,pendingPlaylistSong:null
  };
  let toastTimeout=0,searchTimeout=0,trendingRequest=0,searchRequest=0,apiBase=API_BASES[0];
  if(!state.likes||typeof state.likes!=="object"||Array.isArray(state.likes))state.likes={};
  if(!Array.isArray(state.playlists))state.playlists=[];
  if(!Array.isArray(state.recent))state.recent=[];
  state.playlists=state.playlists.slice(0,MAX_PLAYLISTS).filter(p=>p&&typeof p.id==="string"&&Array.isArray(p.tracks));
  state.volume=Number.isFinite(state.volume)?Math.max(0,Math.min(100,state.volume)):75;
  audio.volume=state.volume/100;

  function load(name,fallback){
    try{const value=localStorage.getItem(STORAGE_PREFIX+name);return value?JSON.parse(value):fallback}catch{return fallback}
  }
  function persist(name,data){
    try{localStorage.setItem(STORAGE_PREFIX+name,JSON.stringify(data));return true}
    catch{notify("Storage is full or unavailable. These changes might not be saved.");return false}
  }
  function notify(text){
    const target=el("toast");target.textContent=String(text||"");target.hidden=false;
    clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>target.hidden=true,3700);
  }
  function time(seconds){
    const n=Number(seconds);
    if(!Number.isFinite(n)||n<0)return "0:00";
    const x=Math.floor(n);
    return Math.floor(x/60)+":"+String(x%60).padStart(2,"0");
  }
  function cleanText(raw,max=150){return typeof raw==="string"?raw.slice(0,max):""}
  function validUrl(raw,host){
    if(typeof raw!=="string"||!raw)return "";
    try{const url=new URL(raw,"https://audius.co");if(url.protocol!=="https:")return "";
      if(host&&url.hostname!==host)return "";return url.href}
    catch{return ""}
  }
  function trackLink(track){
    const raw=track?.permalink;
    if(!raw)return "https://audius.co/";
    try{
      const url=new URL(raw,"https://audius.co/");
      if(url.protocol==="https:"&&(url.hostname==="audius.co"||url.hostname==="www.audius.co"))return url.href;
    }catch{}
    return "https://audius.co/";
  }
  function normalize(track){
    if(!track||typeof track!=="object")return null;
    const id=cleanText(track.id,100);
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))return null;
    if(track.is_streamable===false||track.is_stream_gated===true||track.is_available===false)return null;
    if(track.access?.stream===false||track.access?.stream?.isAccessible===false)return null;
    const artwork=track.artwork||{};
    const art=validUrl(artwork["480x480"]||artwork["150x150"]||artwork["1000x1000"]||track.cover,"");
    return {
      id,title:cleanText(track.title||"Untitled track",160),
      artist:cleanText(track.user?.name||track.artist||track.user?.handle||"Unknown artist",100),
      art,genre:cleanText(track.genre||"",80),
      duration:Math.max(0,Number(track.duration)||0),
      permalink:trackLink(track),
      playCount:Math.max(0,Number(track.play_count)||0)
    };
  }
  function savedTrack(track){
    if(!track||typeof track!=="object")return null;
    const id=cleanText(track.id,100);
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))return null;
    const art=validUrl(track.art,"");
    return {
      id,title:cleanText(track.title||"Untitled",160),
      artist:cleanText(track.artist||"Unknown artist",100),
      art,genre:cleanText(track.genre||"",80),
      duration:Math.max(0,Number(track.duration)||0),
      permalink:trackLink(track),playCount:Number(track.playCount)||0
    };
  }
  async function requestTracks(path,params={},signal){
    let lastError;
    const qs=new URLSearchParams({app_name:"Minzify",...params});
    for(const base of [apiBase,...API_BASES.filter(item=>item!==apiBase)]){
      try{
        const controller=new AbortController();
        const timeout=setTimeout(()=>controller.abort(),13000);
        const abort=()=>controller.abort();
        if(signal){if(signal.aborted)throw new DOMException("Cancelled","AbortError");signal.addEventListener("abort",abort,{once:true})}
        try{
          const response=await fetch(base+path+"?"+qs,{signal:controller.signal,headers:{Accept:"application/json"},cache:"no-store"});
          if(!response.ok)throw Error("Music service returned "+response.status);
          const payload=await response.json();
          if(!Array.isArray(payload.data))throw Error("Unexpected music service response");
          apiBase=base;
          return payload.data.map(normalize).filter(Boolean);
        }finally{
          clearTimeout(timeout);
          if(signal)signal.removeEventListener("abort",abort);
        }
      }catch(error){
        if(signal?.aborted)throw error;
        lastError=error;
      }
    }
    throw lastError||Error("Music service unavailable");
  }
  function cleanArray(tracks){
    const seen=new Set(),out=[];
    for(const raw of tracks||[]){
      const track=savedTrack(raw);
      if(!track||seen.has(track.id))continue;
      seen.add(track.id);out.push(track);if(out.length>=MAX_TRACKS)break;
    }
    return out;
  }
  function imageFor(track,className){
    const wrapper=document.createElement("div");wrapper.className=className;
    const src=track.art;
    if(src){
      const img=document.createElement("img");img.alt="";
      img.loading="lazy";img.referrerPolicy="no-referrer";img.src=src;
      img.addEventListener("error",()=>{img.remove();if(!wrapper.firstChild){const fallback=document.createElement("span");fallback.className="track-placeholder";fallback.textContent="♫";wrapper.append(fallback)}});
      wrapper.append(img);
    }else{
      const fallback=document.createElement("span");fallback.className="track-placeholder";fallback.textContent="♫";wrapper.append(fallback);
    }
    return wrapper;
  }
  function button(label,className,action,aria){
    const b=document.createElement("button");b.type="button";b.className=className||"";
    b.textContent=label;
    if(aria)b.setAttribute("aria-label",aria);
    if(action)b.addEventListener("click",action);
    return b;
  }
  function empty(target,title,description,actionText,action){
    const root=document.createElement("div");root.className="empty-state";
    const icon=document.createElement("span");icon.className="empty-icon";icon.textContent="♫";
    const heading=document.createElement("h3");heading.textContent=title;
    const detail=document.createElement("p");detail.textContent=description;
    root.append(icon,heading,detail);
    if(actionText)root.append(button(actionText,"primary-button",action));
    target.append(root);
  }
  function currentMatch(track){return !!state.current&&state.current.id===track.id}
  function playingMatch(track){return currentMatch(track)&&!audio.paused}
  function renderGrid(target,tracks){
    target.replaceChildren();
    tracks.forEach((track,i)=>{
      const card=document.createElement("article");card.className="album-card";
      const art=imageFor(track,"album-cover");
      const play=button("▶","album-play",()=>playCollection(tracks,i),"Play "+track.title);
      art.append(play);
      const title=document.createElement("strong");title.className="album-name";title.textContent=track.title;title.title=track.title;
      const artist=document.createElement("span");artist.className="album-artist";artist.textContent=track.artist;
      card.append(art,title,artist);
      card.addEventListener("dblclick",()=>playCollection(tracks,i));
      target.append(card);
    });
  }
  function renderRows(target,tracks){
    target.replaceChildren();
    tracks.forEach((track,i)=>{
      const row=document.createElement("div");row.className="track-item";
      row.classList.toggle("playing",currentMatch(track));
      const number=document.createElement("span");number.className="track-number";number.textContent=currentMatch(track)&&!audio.paused?"♫":String(i+1);
      row.append(number,imageFor(track,"track-cover"));
      const info=button("","track-data",()=>playCollection(tracks,i),"Play "+track.title+" by "+track.artist);
      info.style.cssText="border:0;background:none;text-align:left;color:inherit;min-width:0;padding:0";
      const title=document.createElement("strong");title.textContent=track.title;
      const artist=document.createElement("span");artist.textContent=track.artist;
      info.append(title,artist);row.append(info);
      const duration=document.createElement("span");duration.className="track-duration";duration.textContent=time(track.duration);
      row.append(duration);
      const like=button(state.likes[track.id]?"♥":"♡","icon-button"+(state.likes[track.id]?" liked":""),()=>toggleLike(track),"Like "+track.title);
      like.title=state.likes[track.id]?"Remove from Liked songs":"Add to Liked songs";
      like.setAttribute("aria-pressed",String(!!state.likes[track.id]));
      const add=button("＋","icon-button add-icon",()=>openPlaylistDialog(track),"Add "+track.title+" to a playlist");
      const actions=document.createElement("div");actions.className="track-menu";actions.append(like,add);
      row.append(actions);
      target.append(row);
    });
  }
  function refreshRows(){
    if(state.view==="home"){
      renderGrid(el("trendingGrid"),state.trending.slice(0,12));
      renderRows(el("freshGrid"),state.fresh);
    }else if(state.view==="search")renderRows(el("resultsGrid"),state.searchResults);
    else if(state.view==="genre")renderRows(el("resultsGrid"),state.searchResults);
    else renderLibrary();
    el("nowLike").classList.toggle("liked",!!state.likes[state.current?.id]);
    el("nowLike").textContent=state.likes[state.current?.id]?"♥":"♡";
  }
  function nav(view){
    for(const b of document.querySelectorAll("[data-view]")){
      const groupView=view==="playlist"?"playlists":view==="genre"?"search":view;
      b.classList.toggle("selected",b.dataset.view===groupView);
      if(b.classList.contains("nav-link"))b.setAttribute("aria-current",b.dataset.view===groupView?"page":"false");
    }
    for(const b of document.querySelectorAll(".playlist-links button"))b.classList.toggle("active",view==="playlist"&&b.dataset.playlistId===state.playlistId);
  }
  function showView(view,scroll=true){
    state.view=view;
    el("homeView").hidden=view!=="home";
    el("resultsView").hidden=view!=="search"&&view!=="genre";
    el("libraryView").hidden=!["liked","recent","playlists","playlist"].includes(view);
    nav(view);
    if(view==="liked"||view==="recent"||view==="playlists"||view==="playlist")renderLibrary();
    if(view==="search"){el("resultsTitle").textContent=el("searchInput").value.trim()?"Search results":"Find your next favourite";el("resultEyebrow").textContent="DISCOVER MUSIC";}
    if(scroll)document.querySelector(".main-pane").scrollTo({top:0,behavior:"smooth"});
  }
  function getLibraryTracks(){
    if(state.view==="liked")return cleanArray(Object.values(state.likes).reverse());
    if(state.view==="recent")return cleanArray(state.recent);
    if(state.view==="playlist")return cleanArray(state.playlists.find(p=>p.id===state.playlistId)?.tracks);
    return [];
  }
  function renderSidebarPlaylists(){
    const target=el("sidebarPlaylists");target.replaceChildren();
    if(!state.playlists.length){
      const empty=document.createElement("div");empty.className="playlist-empty";empty.textContent="Your mixes will appear here.";target.append(empty);return;
    }
    for(const playlist of state.playlists){
      const b=button("","",()=>{state.playlistId=playlist.id;showView("playlist");});
      b.dataset.playlistId=playlist.id;
      const span=document.createElement("span");span.textContent=playlist.name;b.append(span);
      b.classList.toggle("active",state.view==="playlist"&&state.playlistId===playlist.id);
      target.append(b);
    }
  }
  function renderLibrary(){
    const title=el("libraryTitle"),sub=el("librarySubtitle"),eyebrow=el("libraryEyebrow"),grid=el("libraryGrid"),del=el("deletePlaylist");
    const pl=state.playlists.find(p=>p.id===state.playlistId);
    del.hidden=state.view!=="playlist"||!pl;
    if(state.view==="playlists"){
      eyebrow.textContent="YOUR SPACE";title.textContent="Your library";
      sub.textContent="Create playlists and organise the tracks you discover. Saved only on this device.";
      grid.replaceChildren();
      if(!state.playlists.length)empty(grid,"No playlists yet","Make your first playlist to get the collection started.","＋ Create playlist",()=>openPlaylistDialog(null));
      else{
        for(const playlist of state.playlists){
          const line=document.createElement("button");line.type="button";line.className="queue-entry";
          line.style.cssText="padding:16px;width:100%;text-align:left";
          const label=document.createElement("span");
          const strong=document.createElement("strong");strong.textContent="▤  "+playlist.name;
          const small=document.createElement("small");small.textContent=playlist.tracks.length+" songs";
          label.append(strong,small);line.append(label);
          line.addEventListener("click",()=>{state.playlistId=playlist.id;showView("playlist");});
          grid.append(line);
        }
      }
    }else{
      const tracks=getLibraryTracks();
      if(state.view==="liked"){eyebrow.textContent="ALL THE FAVOURITES";title.textContent="Liked songs";sub.textContent=tracks.length+" saved songs · on this device";}
      if(state.view==="recent"){eyebrow.textContent="LISTENING HISTORY";title.textContent="Recently played";sub.textContent=tracks.length+" tracks you've listened to recently";}
      if(state.view==="playlist"){eyebrow.textContent="YOUR PLAYLIST";title.textContent=pl?.name||"Playlist";sub.textContent=tracks.length+" songs · stored on this device";}
      if(!tracks.length){
        grid.replaceChildren();
        empty(grid,state.view==="liked"?"No favourites yet":state.view==="recent"?"Nothing played yet":"This playlist is empty",state.view==="liked"?"Tap the heart beside a song to save it.":state.view==="recent"?"Start playing music to build your listening history.":"Find songs and use ＋ to add them to this playlist.","Explore music",()=>showView("home"));
      }else renderRows(grid,tracks);
    }
    const has=state.view!=="playlists"&&getLibraryTracks().length>0;
    el("playLibrary").hidden=!has;el("shuffleLibrary").hidden=!has;
    renderSidebarPlaylists();
  }
  function toggleLike(track){
    const song=savedTrack(track);if(!song)return;
    if(state.likes[song.id]){delete state.likes[song.id];notify("Removed from Liked songs");}
    else{state.likes[song.id]=song;notify("♥ Added to Liked songs");}
    const ids=Object.keys(state.likes);
    while(ids.length>MAX_TRACKS){delete state.likes[ids.shift()]}
    persist("likes",state.likes);refreshRows();updatePlayer();
  }
  function createPlaylist(name){
    const clean=String(name||"").trim().slice(0,40);
    if(!clean){notify("Give your playlist a name.");return null;}
    if(state.playlists.length>=MAX_PLAYLISTS){notify("You reached the playlist limit for this device.");return null;}
    const id="pl-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8);
    const playlist={id,name:clean,tracks:[]};
    state.playlists.unshift(playlist);persist("playlists",state.playlists);
    renderSidebarPlaylists();return playlist;
  }
  function addToPlaylist(playlist,track){
    const song=savedTrack(track);
    if(!song)return;
    if(playlist.tracks.some(item=>item.id===song.id)){notify("Already in "+playlist.name);return;}
    if(playlist.tracks.length>=MAX_TRACKS){notify("This playlist is full.");return;}
    playlist.tracks.push(song);persist("playlists",state.playlists);
    notify("Added to "+playlist.name);renderLibrary();
  }
  function openPlaylistDialog(track){
    state.pendingPlaylistSong=track?savedTrack(track):null;
    const modal=el("playlistDialog"),target=el("playlistDialogList");
    el("playlistDialogTitle").textContent=track?"Add to playlist":"Create a playlist";
    el("playlistDialogSubtitle").textContent=track?"Save “"+track.title+"” to one of your playlists.":"Organise your favourite music in a personal mix.";
    el("newPlaylistName").value="";
    target.replaceChildren();
    if(track&&state.playlists.length){
      for(const playlist of state.playlists){
        const exists=playlist.tracks.some(song=>song.id===track.id);
        const b=button((exists?"✓ ":"＋ ")+playlist.name+(exists?" · Added":""),"",()=>{
          if(!exists){addToPlaylist(playlist,track);modal.close();}else notify("Already in this playlist");
        });
        target.append(b);
      }
    }else if(track){
      const p=document.createElement("p");p.textContent="You don't have any playlists yet.";target.append(p);
    }
    if(typeof modal.showModal==="function")modal.showModal();else modal.setAttribute("open","");
  }
  function addHistory(track){
    const song=savedTrack(track);if(!song)return;
    state.recent=[song,...state.recent.filter(item=>item.id!==song.id)].slice(0,80);
    persist("recent",state.recent);
  }
  function playCollection(collection,index){
    const valid=cleanArray(collection);
    const song=collection[index];
    const matching=valid.findIndex(t=>t.id===song?.id);
    if(matching<0){notify("This track is unavailable for streaming.");return;}
    state.queue=valid;state.index=matching;
    void startSong(valid[matching]);
  }
  async function startSong(track){
    if(!track)return;
    state.current=savedTrack(track);
    el("audioElement").pause();
    audio.src="https://api.audius.co/v1/tracks/"+encodeURIComponent(state.current.id)+"/stream?app_name=Minzify";
    audio.load();updatePlayer();addHistory(state.current);refreshRows();renderQueue();
    if("mediaSession" in navigator){
      navigator.mediaSession.metadata=new MediaMetadata({
        title:state.current.title,artist:state.current.artist,album:"Minzify · Audius",
        artwork:state.current.art?[{src:state.current.art,sizes:"480x480"}]:[]
      });
    }
    try{await audio.play();updatePlayer()}catch(error){
      if(error.name!=="AbortError")notify("Could not autoplay. Tap ▶ to try again.");
      updatePlayer();
    }
  }
  function togglePause(){
    if(!state.current){
      if(state.trending.length)playCollection(state.trending,0);
      else notify("Find a song to start listening.");
      return;
    }
    if(audio.paused){void audio.play().catch(()=>notify("This song couldn't be played. Try another track."));}
    else audio.pause();
  }
  function next(step=1){
    if(!state.queue.length)return;
    if(step<0&&audio.currentTime>3){audio.currentTime=0;return;}
    if(state.shuffle&&state.queue.length>1){
      let to=state.index,attempts=0;
      while(to===state.index&&attempts++<20)to=Math.floor(Math.random()*state.queue.length);
      state.index=to;
    }else{
      let i=state.index+step;
      if(i>=state.queue.length){
        if(state.repeat===1)i=0;
        else{audio.pause();audio.currentTime=0;updatePlayer();return;}
      }
      if(i<0)i=state.queue.length-1;
      state.index=i;
    }
    void startSong(state.queue[state.index]);
  }
  function updatePlayer(){
    const t=state.current;
    el("nowTitle").textContent=t?.title||"Nothing playing yet";
    el("nowArtist").textContent=t?.artist||"Pick a song to start listening";
    const art=el("nowArt");art.replaceChildren();
    if(t){const cover=imageFor(t,"now-img");while(cover.firstChild)art.append(cover.firstChild);}
    else{const x=document.createElement("span");x.textContent="♫";art.append(x);}
    const heart=el("nowLike");
    heart.disabled=!t;heart.textContent=t&&state.likes[t.id]?"♥":"♡";
    heart.classList.toggle("liked",!!t&&!!state.likes[t.id]);
    heart.setAttribute("aria-pressed",String(!!t&&!!state.likes[t.id]));
    el("audiusLink").href=t?trackLink(t):"https://audius.co/";
    el("playButton").textContent=!audio.paused?"❚❚":"▶";
    el("playButton").setAttribute("aria-label",audio.paused?"Play":"Pause");
    el("playButton").title=audio.paused?"Play":"Pause";
    const duration=Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:t?.duration||0;
    const current=Number.isFinite(audio.currentTime)?audio.currentTime:0;
    el("timeCurrent").textContent=time(current);el("timeTotal").textContent=time(duration);
    const slider=el("seekBar");
    slider.value=duration?String(Math.max(0,Math.min(1000,Math.round(current/duration*1000)))):"0";
    slider.style.setProperty("--progress",Number(slider.value)/10+"%");
    el("shuffleButton").classList.toggle("active",state.shuffle);
    el("shuffleButton").setAttribute("aria-pressed",String(state.shuffle));
    el("repeatButton").classList.toggle("active",state.repeat!==0);
    el("repeatButton").setAttribute("aria-pressed",String(state.repeat!==0));
    el("repeatButton").textContent=state.repeat===2?"↻¹":"↻";
    el("repeatButton").title=state.repeat===0?"Repeat off":state.repeat===1?"Repeat queue":"Repeat one";
    el("muteButton").textContent=audio.muted||audio.volume===0?"🔇":"🔊";
    el("volumeBar").value=String(Math.round(audio.volume*100));
    el("volumeBar").style.setProperty("--progress",Math.round(audio.volume*100)+"%");
  }
  function renderQueue(){
    const list=el("queueItems");list.replaceChildren();
    if(!state.queue.length){empty(list,"Queue is empty","Play a song to fill your queue.");return;}
    state.queue.forEach((t,i)=>{
      const b=button("","queue-entry"+(i===state.index?" active":""),()=>{state.index=i;void startSong(t)});
      const span=document.createElement("span");
      const title=document.createElement("strong");title.textContent=(i===state.index?"♫ ":"")+t.title;
      const sub=document.createElement("small");sub.textContent=t.artist;
      span.append(title,sub);b.append(span);list.append(b);
    });
  }
  async function fetchTrending(){
    const run=++trendingRequest;
    el("trendingStatus").textContent="Loading songs from Audius…";
    try{
      const results=await requestTracks("/tracks/trending",{limit:"35",time:"week"});
      if(run!==trendingRequest)return;
      state.trending=results;
      state.fresh=results.slice(12,25);
      el("trendingStatus").textContent=results.length?"":"Nothing to show right now.";
      renderGrid(el("trendingGrid"),results.slice(0,12));
      renderRows(el("freshGrid"),state.fresh);
      if(!results.length)empty(el("trendingGrid"),"No trending songs","Try searching for an artist or genre.","Search music",()=>showView("search"));
    }catch(error){
      if(run!==trendingRequest)return;
      el("trendingStatus").textContent="Couldn't load trending tracks. Check your internet connection or try searching.";
      el("trendingGrid").replaceChildren();
      empty(el("trendingGrid"),"Music temporarily unavailable","Audius is unreachable right now. You can try again.","↻ Retry",fetchTrending);
      console.warn("Minzify trending",error);
    }
  }
  async function search(query,genre){
    const q=String(query||"").trim().slice(0,90);
    if(!q){showView("search");el("resultsGrid").replaceChildren();el("searchStatus").textContent="";return;}
    searchRequest++;
    const thisRequest=searchRequest;
    if(state.busySearch)state.busySearch.abort();
    const controller=new AbortController();state.busySearch=controller;
    state.searchResults=[];
    showView(genre?"genre":"search",false);
    el("resultEyebrow").textContent=genre?"LISTEN TO YOUR MOOD":"SEARCH RESULTS";
    el("resultsTitle").textContent=genre?genre:'Results for “'+q+'”';
    el("resultsSubtitle").textContent=genre?"Tracks matching "+genre+" · Free-to-stream music by Audius artists":"Discover songs and artists shared for streaming";
    el("resultsGrid").replaceChildren();
    el("searchStatus").textContent="Finding music…";
    try{
      const tracks=await requestTracks("/tracks/search",{query:q,limit:"60"},controller.signal);
      if(thisRequest!==searchRequest||controller.signal.aborted)return;
      state.searchResults=tracks;
      el("searchStatus").textContent=tracks.length?tracks.length+" songs found":"";
      renderRows(el("resultsGrid"),tracks);
      if(!tracks.length)empty(el("resultsGrid"),"No results found","Try a different artist, song or genre.","See what's trending",()=>showView("home"));
    }catch(error){
      if(thisRequest!==searchRequest||controller.signal.aborted)return;
      el("searchStatus").textContent="Search isn't available right now. Please try again.";
      empty(el("resultsGrid"),"Couldn't search music","The music service might be offline or your connection is unavailable.","↻ Try again",()=>search(q,genre));
      console.warn("Minzify search",error);
    }finally{if(thisRequest===searchRequest)state.busySearch=null}
  }

  // Navigation
  document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{
    const view=b.dataset.view;
    if(view==="search"){showView("search");el("searchInput").focus();}
    else showView(view);
  }));
  el("searchInput").addEventListener("input",()=>{
    const val=el("searchInput").value;
    el("clearSearch").hidden=!val;
    clearTimeout(searchTimeout);
    if(!val.trim()){if(state.busySearch)state.busySearch.abort();state.searchResults=[];showView("search",false);el("resultsGrid").replaceChildren();el("searchStatus").textContent="";return;}
    searchTimeout=setTimeout(()=>search(val),380);
  });
  el("searchForm").addEventListener("submit",event=>{
    event.preventDefault();clearTimeout(searchTimeout);void search(el("searchInput").value);
    el("searchInput").blur();
  });
  el("clearSearch").addEventListener("click",()=>{
    el("searchInput").value="";el("searchInput").dispatchEvent(new Event("input"));el("searchInput").focus();
  });
  document.querySelectorAll("[data-genre]").forEach(b=>b.addEventListener("click",()=>{
    const genre=b.dataset.genre;el("searchInput").value=genre;el("clearSearch").hidden=false;
    void search(genre,true);
  }));
  el("heroPlay").addEventListener("click",()=>{
    if(!state.trending.length){notify("Trending songs are still loading.");return;}
    playCollection(state.trending,0);
  });
  el("heroExplore").addEventListener("click",()=>{
    document.getElementById("genreGrid").scrollIntoView({behavior:"smooth",block:"center"});
  });
  el("refreshTrending").addEventListener("click",fetchTrending);
  el("newPlaylistSide").addEventListener("click",()=>openPlaylistDialog(null));
  el("createPlaylistMain").addEventListener("click",()=>openPlaylistDialog(null));
  el("newPlaylistForm").addEventListener("submit",e=>{
    e.preventDefault();
    const name=el("newPlaylistName").value.trim();const playlist=createPlaylist(name);
    if(!playlist)return;
    if(state.pendingPlaylistSong)addToPlaylist(playlist,state.pendingPlaylistSong);
    el("playlistDialog").close();
    state.playlistId=playlist.id;showView("playlist");notify("Playlist created: "+playlist.name);
  });
  el("playLibrary").addEventListener("click",()=>{const tracks=getLibraryTracks();if(tracks.length)playCollection(tracks,0)});
  el("shuffleLibrary").addEventListener("click",()=>{
    const tracks=getLibraryTracks();
    if(tracks.length){state.shuffle=true;playCollection(tracks,Math.floor(Math.random()*tracks.length));updatePlayer();}
  });
  el("deletePlaylist").addEventListener("click",()=>{
    const p=state.playlists.find(item=>item.id===state.playlistId);
    if(!p||!confirm("Delete playlist “"+p.name+"”? This won't delete your liked songs."))return;
    state.playlists=state.playlists.filter(item=>item.id!==p.id);state.playlistId=null;
    persist("playlists",state.playlists);showView("playlists");notify("Playlist deleted.");
  });
  el("playButton").addEventListener("click",togglePause);
  el("prevButton").addEventListener("click",()=>next(-1));
  el("nextButton").addEventListener("click",()=>next(1));
  el("nowLike").addEventListener("click",()=>{if(state.current)toggleLike(state.current)});
  el("shuffleButton").addEventListener("click",()=>{
    state.shuffle=!state.shuffle;updatePlayer();notify(state.shuffle?"Shuffle on":"Shuffle off");
  });
  el("repeatButton").addEventListener("click",()=>{
    state.repeat=(state.repeat+1)%3;updatePlayer();
    notify(["Repeat off","Repeating queue","Repeating this song"][state.repeat]);
  });
  el("queueToggle").addEventListener("click",()=>{el("queuePanel").hidden=!el("queuePanel").hidden;renderQueue()});
  el("closeQueue").addEventListener("click",()=>{el("queuePanel").hidden=true});
  el("seekBar").addEventListener("input",e=>{
    const duration=Number.isFinite(audio.duration)?audio.duration:0;
    if(duration)audio.currentTime=duration*Number(e.target.value)/1000;updatePlayer();
  });
  el("volumeBar").addEventListener("input",e=>{
    const n=Math.max(0,Math.min(100,Number(e.target.value)));audio.volume=n/100;
    audio.muted=false;state.volume=n;persist("volume",n);updatePlayer();
  });
  el("muteButton").addEventListener("click",()=>{audio.muted=!audio.muted;updatePlayer()});
  audio.addEventListener("playing",()=>{updatePlayer();refreshRows()});
  audio.addEventListener("pause",()=>{updatePlayer();refreshRows()});
  audio.addEventListener("timeupdate",updatePlayer);
  audio.addEventListener("loadedmetadata",updatePlayer);
  audio.addEventListener("durationchange",updatePlayer);
  audio.addEventListener("ended",()=>{if(state.repeat===2){audio.currentTime=0;void audio.play();}else next(1)});
  audio.addEventListener("error",()=>{
    if(!state.current)return;
    notify("This artist's stream is unavailable. Please choose another song.");
    updatePlayer();
  });
  document.addEventListener("keydown",e=>{
    if(e.metaKey||e.ctrlKey||e.altKey)return;
    const input=e.target?.matches?.("input,textarea,[contenteditable]")||el("playlistDialog").open;
    if(e.key==="/"&&!input){e.preventDefault();el("searchInput").focus();}
    if(e.code==="Space"&&!input){e.preventDefault();togglePause();}
    if(e.key==="Escape"){el("queuePanel").hidden=true;}
  });
  if("mediaSession" in navigator){
    const handlers={play:()=>void audio.play(),pause:()=>audio.pause(),nexttrack:()=>next(1),previoustrack:()=>next(-1)};
    for(const [type,handler] of Object.entries(handlers)){try{navigator.mediaSession.setActionHandler(type,handler)}catch{}}
  }
  updatePlayer();renderSidebarPlaylists();void fetchTrending();
})();
