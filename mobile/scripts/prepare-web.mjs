import {cpSync,copyFileSync,existsSync,mkdirSync,rmSync,readFileSync,readdirSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
const root=resolve(import.meta.dirname,"../../");
const dest=resolve(import.meta.dirname,"../www");
rmSync(dest,{recursive:true,force:true});mkdirSync(dest,{recursive:true});
// Include each root-level public HTML app automatically (Community Chat,
 // Shapes & Colours, Update Centre, and new apps added in later updates).
 // These are browser assets only; never bundle .github, docs or backend source.
const publicFiles=new Set(["index.html","app-icon.svg","manifest.webmanifest","service-worker.js"]);
for(const item of readdirSync(root,{withFileTypes:true})){
  if(item.isFile()&&!item.name.startsWith(".")&&/\.(?:html?|js|css|svg|png|jpe?g|webp|gif|ico|woff2?)$/i.test(item.name)){
    publicFiles.add(item.name);
  }
}
for(const name of publicFiles){
  const src=join(root,name);
  if(!existsSync(src))throw new Error("Missing "+src);
  copyFileSync(src,join(dest,name));
}
for(const directory of ["music","assets","images","icons"]){
  if(existsSync(join(root,directory)))cpSync(join(root,directory),join(dest,directory),{recursive:true});
}
console.log("Bundled public files:",[...publicFiles].join(", "));
// Preserve original HTML and app integrations; only adapt the shell for bundled app origin.
const index=join(dest,"index.html");let html=readFileSync(index,"utf8");
html=html.replace(/<link rel="manifest" href="\.\/manifest\.webmanifest">/, '<link rel="manifest" href="./manifest.webmanifest">');
writeFileSync(index,html);
console.log("Prepared Community Chat web assets in mobile/www");

// Inject mobile-only download UI without editing the website's original index.html.
copyFileSync(resolve(import.meta.dirname,"../sideload-tool.js"),join(dest,"sideload-tool.js"));
let bundled=readFileSync(index,"utf8");
bundled=bundled.replace("</body>",'<script src="./sideload-tool.js"></script>\\n</body>');
writeFileSync(index,bundled);
