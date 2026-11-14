/* Original, scalable SVG artwork for Community Hub apps and Game Hub games.
   Reuses the existing Community Chat brand icon for Chats. No icon font or CDN. */
(()=>{
 "use strict";
 const glyphs={
  "gatewayOpenAI":'<rect x="13" y="16" width="38" height="36" rx="12"/><path d="M23 16V9m18 7V9M20 52v4m24-4v4M13 29H7m6 10H7m44-10h6m-6 10h6"/><path d="m32 22 3.2 7 7.8 3-7.8 3-3.2 7-3.2-7-7.8-3 7.8-3Z" fill="#d4b7ff" stroke-width="2"/>',
  "gatewayOpenBubbleBuilder":'<circle cx="23" cy="38" r="15"/><circle cx="41" cy="19" r="11"/><circle cx="46" cy="44" r="7"/><path d="M16 33c2-5 6-7 10-7m11-10c1-3 3-5 6-5" stroke="#bce9ff"/><path d="M30 11 32 5l2 6 6 2-6 2-2 6-2-6-6-2Z" fill="#ccf4ff" stroke-width="1.8"/>',
  "gatewayOpenShapes":'<path d="m32 8 22 12v25L32 57 10 45V20Z" fill="#ffffff18"/><path d="m10 20 22 13 22-13M32 33v24" stroke="#fff"/><path d="m32 8 22 12-22 13-22-13Z" fill="#ffb88e" stroke="none"/><path d="m10 21 22 12v24L10 45Z" fill="#ff75c8" stroke="none"/><path d="m54 21-22 12v24l22-12Z" fill="#79d9ff" stroke="none"/>',
  "gatewayOpenMinzify":'<path d="M27 43V15l24-6v29"/><path d="M27 15 51 9v9l-24 6Z" fill="#8bffe1" stroke="none"/><ellipse cx="20" cy="45" rx="10" ry="7" fill="#70e9d1" stroke="none"/><ellipse cx="44" cy="40" rx="10" ry="7" fill="#70e9d1" stroke="none"/><path d="M27 18v27M51 13v27"/>',
  "gatewayOpenMinzSign":'<rect x="10" y="10" width="44" height="44" rx="10"/><rect x="17" y="17" width="13" height="13" rx="3" fill="#bde7ff" stroke="none"/><rect x="35" y="17" width="13" height="13" rx="3" fill="#bde7ff" stroke="none"/><rect x="17" y="35" width="13" height="13" rx="3" fill="#bde7ff" stroke="none"/><path d="M42 34v13m-6-6 6 6 6-6" stroke="#fff"/>',
  "gatewayOpenInstaller":'<rect x="15" y="11" width="34" height="43" rx="7" fill="#b1e5ff22"/><path d="M25 19h14M32 17v22m-8-8 8 8 8-8" stroke="#c1f6e6" stroke-width="3.5"/><path d="M21 46h22" stroke="#fff" stroke-width="3"/>',
  "gatewayOpenUpdates":'<path d="M19 17h25v35H19z" fill="#fff2" /><path d="M26 26h12M26 33h12M26 40h6"/><path d="M46 15a21 21 0 0 1 10 17M56 23v9h-9M15 49A21 21 0 0 1 8 33M8 42v-9h9" stroke="#ffe4a1"/>',
  "gatewayOpenGames":'<path d="M20 24h24c6 0 10 5 12 11l3 11c1 6-5 10-10 7L40 46H24l-9 7c-5 3-11-1-10-7l3-11c2-6 6-11 12-11Z" fill="#d5c8ff" stroke="none"/><path d="M20 32v12m-6-6h12" stroke="#46318e" stroke-width="4"/><circle cx="43" cy="35" r="3.5" fill="#46318e" stroke="none"/><circle cx="50" cy="42" r="3.5" fill="#46318e" stroke="none"/>',
  "gatewayOpenBrowser":'<rect x="9" y="11" width="46" height="42" rx="7" fill="#183759"/><path d="M9 22h46"/><circle cx="16" cy="17" r="1.5" fill="#aad2ff" stroke="none"/><circle cx="22" cy="17" r="1.5" fill="#a0f3dc" stroke="none"/><circle cx="32" cy="38" r="13" stroke="#d7f4ff"/><path d="M19 38h26M32 25c-7 7-7 19 0 26m0-26c7 7 7 19 0 26" stroke="#b7e3ff" stroke-width="2"/>',
  "gatewayOpenChat":'<path d="M12 13h40v30H32L20 54V43h-8Z" fill="#fff" stroke="none"/><circle cx="22" cy="29" r="3.8" fill="#5669ed" stroke="none"/><circle cx="32" cy="29" r="3.8" fill="#5669ed" stroke="none"/><circle cx="42" cy="29" r="3.8" fill="#5669ed" stroke="none"/>',
  "Python Editor":'<rect x="9" y="12" width="46" height="40" rx="7" fill="#0d244b" stroke="#c4e7ff"/><path d="M9 23h46" stroke="#88a1d8"/><circle cx="16" cy="18" r="1.5" fill="#80e8ac" stroke="none"/><circle cx="22" cy="18" r="1.5" fill="#8bc1ff" stroke="none"/><path d="m20 32-6 6 6 6m11-12 6 6-6 6m10-12-4 12" stroke="#a4f7c2" stroke-width="3.2"/><path d="M28 31c2-3 6-3 8 0" stroke="#ffcb79"/>',
  "2048":'<rect x="9" y="9" width="21" height="21" rx="4" fill="#ffe1a4" stroke="none"/><rect x="34" y="9" width="21" height="21" rx="4" fill="#ffac7a" stroke="none"/><rect x="9" y="34" width="21" height="21" rx="4" fill="#ffcd8c" stroke="none"/><rect x="34" y="34" width="21" height="21" rx="4" fill="#ff906b" stroke="none"/><text x="19.5" y="24.5" text-anchor="middle" font-size="14" font-weight="900" fill="#814b35" stroke="none">2</text><text x="44.5" y="24.5" text-anchor="middle" font-size="14" font-weight="900" fill="#7a3729" stroke="none">4</text><text x="19.5" y="49.5" text-anchor="middle" font-size="14" font-weight="900" fill="#814b35" stroke="none">8</text><text x="44.5" y="49.5" text-anchor="middle" font-size="14" font-weight="900" fill="#77291e" stroke="none">16</text>',
  "Cookie Clicker":'<path d="M34 10c-3 9 1 12 9 13-4 9 2 10 10 10 0 11-8 21-21 22C17 55 8 43 9 29 10 17 19 9 34 10Z" fill="#d99a5f" stroke="#fff1d3"/><circle cx="24" cy="23" r="4" fill="#74452b" stroke="none"/><circle cx="40" cy="34" r="5" fill="#74452b" stroke="none"/><circle cx="24" cy="41" r="3.7" fill="#74452b" stroke="none"/><circle cx="35" cy="18" r="2.2" fill="#74452b" stroke="none"/>',
  "Google Dino":'<path d="M17 48V29h8v-9h8V10h16v18H37v8H28v12h-5v8h-8v-8Zm23-33h4v4h-4Z" fill="#d4ffe1" stroke="none"/><path d="M17 41h-8m33-12h8m-13 9h11" stroke="#d4ffe1" stroke-width="4"/><rect x="41" y="15" width="3" height="3" fill="#123827" stroke="none"/>',
  "Google Snake":'<path d="M15 45c-10-16 4-30 18-23 14 7 18-13 1-13-11 0-13 12-4 16" stroke="#b9ffc9" stroke-width="9"/><circle cx="15" cy="46" r="8" fill="#b9ffc9" stroke="none"/><circle cx="12" cy="44" r="1.8" fill="#193525" stroke="none"/><circle cx="20" cy="44" r="1.8" fill="#193525" stroke="none"/><circle cx="50" cy="44" r="6" fill="#ff8698" stroke="none"/><path d="M50 36v-3" stroke="#fff"/>',
  "Retro Bowl":'<path d="M11 39C16 20 37 11 54 22 50 43 30 54 11 39Z" fill="#c86c48" stroke="#fff4dc"/><path d="m22 40 21-17M28 33l5 5m-1-10 5 5m-1-10 5 5" stroke="#fff4dc" stroke-width="2.7"/>',
  "Slope":'<path d="M8 51 34 17l23 34H8Z" fill="#69e6c5" stroke="none"/><path d="m8 51 26-34 23 34" stroke="#c2ffe8"/><circle cx="33" cy="25" r="10" fill="#e7fffc" stroke="#96e9df"/><path d="M10 55h45" stroke="#fff"/>',
  "Run 3":'<path d="m12 14 40 0-8 36H20Z" fill="#5544a4" stroke="#e4ceff"/><path d="m20 21 24 0-5 21H25Z" fill="#a18af3" stroke="#fff"/><path d="m32 15 0 35" stroke="#e5daff" stroke-dasharray="3 5"/><path d="m22 43 9-9 11 9" stroke="#fff5b4"/>',
  "Minesweeper":'<rect x="9" y="9" width="46" height="46" rx="5" fill="#ffffff18"/><path d="M24 9v46M40 9v46M9 24h46M9 40h46" stroke="#dce6ff" stroke-width="1.8"/><path d="M31 14v23" stroke="#fff"/><path d="m32 14 15 8-15 8Z" fill="#ff7796" stroke="none"/><circle cx="17" cy="48" r="3.5" fill="#b5d2ff" stroke="none"/>',
  "Blackjack":'<rect x="9" y="16" width="30" height="41" rx="4" fill="#f6f4ff" stroke="#eae4ff" transform="rotate(-12 24 37)"/><rect x="27" y="9" width="28" height="40" rx="4" fill="#fff" stroke="#eae4ff" transform="rotate(10 41 29)"/><text x="36" y="30" font-size="17" font-weight="900" fill="#da4b67" stroke="none">A</text><path d="m45 33 5-7 5 7-5 7Z" fill="#da4b67" stroke="none"/>',
  "Moto X3M":'<circle cx="16" cy="45" r="10" fill="none" stroke="#fff"/><circle cx="49" cy="45" r="10" fill="none" stroke="#fff"/><path d="m16 45 13-16 9 16H16l12-9 10 9 11 0-11-17" stroke="#ffde96"/><path d="m27 23 10 1m0 0 5 6" stroke="#fff"/>',
  "Block Blast":'<rect x="10" y="10" width="13" height="13" rx="3" fill="#f6b96a" stroke="none"/><rect x="26" y="10" width="13" height="13" rx="3" fill="#f6b96a" stroke="none"/><rect x="26" y="26" width="13" height="13" rx="3" fill="#8ee8ff" stroke="none"/><rect x="42" y="26" width="13" height="13" rx="3" fill="#8ee8ff" stroke="none"/><rect x="10" y="42" width="13" height="13" rx="3" fill="#b6a1ff" stroke="none"/><rect x="26" y="42" width="13" height="13" rx="3" fill="#b6a1ff" stroke="none"/><path d="m44 11 6 0m-3-3v6" stroke="#fff"/>',
  "Gorilla Tag":'<path d="M15 31c0-17 8-23 17-23s17 6 17 23v8c5 6 1 15-9 15H24c-10 0-14-9-9-15Z" fill="#a5a0b9" stroke="#fff"/><path d="M21 31c-1-11 23-11 22 0v10c0 13-22 13-22 0Z" fill="#d9c6b6" stroke="none"/><circle cx="26" cy="35" r="3" fill="#2c273d" stroke="none"/><circle cx="39" cy="35" r="3" fill="#2c273d" stroke="none"/><path d="M27 46q5 4 11 0" stroke="#594750"/>',
  "Twerk Race 3D":'<circle cx="36" cy="13" r="7" fill="#fff" stroke="none"/><path d="m32 25-9 12 12 4 12-8m-15-8 8 12 12 4M34 40l-11 16m12-15 12 14" stroke="#fff" stroke-width="5"/><path d="M8 28h12M6 40h10" stroke="#a9f7e8" stroke-width="3"/>',
  "Coming Soon":'<path d="m32 7 6 18 19 7-19 7-6 18-6-18-19-7 19-7Z" fill="#d9d4ed" stroke="none"/><path d="M49 6v13m-6-7h12M11 44v12m-6-6h12" stroke="#c5d0f7"/>',
  "default":'<rect x="13" y="13" width="38" height="38" rx="11"/><path d="M22 32h20M32 22v20"/>'
 };
 const alias={
  "Community Chat":"gatewayOpenChat","Admin AI":"gatewayOpenAI",
  "BubbleBuilder 3D":"gatewayOpenBubbleBuilder","Shapes & Colours":"gatewayOpenShapes",
  "Minzify":"gatewayOpenMinzify","Minz Apps":"gatewayOpenMinzSign","App Installer":"gatewayOpenInstaller",
  "Update Centre":"gatewayOpenUpdates","Game Hub":"gatewayOpenGames",
  "Community Browser":"gatewayOpenBrowser"
 };
 function create(key){
  key=alias[key]||key;
  if(key==="gatewayOpenChat"||key==="Python Editor"){
   const img=document.createElement("img");
   img.src=key==="gatewayOpenChat"?"./app-icon.svg":"./python-editor-icon.svg";
   img.alt="";img.decoding="async";
   img.className=key==="gatewayOpenChat"?"store-brand-chat-icon":"store-brand-python-icon";
   return img;
  }
  const graphic=glyphs[key]||glyphs.default;
  const holder=document.createElement("span");
  holder.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="store-vector-icon" role="presentation" aria-hidden="true" fill="none" stroke="white" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">'+graphic+"</svg>";
  return holder.firstElementChild;
 }
 window.CommunityHubIcons=Object.freeze({create,has:key=>!!glyphs[alias[key]||key]});
})();