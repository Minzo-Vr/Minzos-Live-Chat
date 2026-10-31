import {cpSync,copyFileSync,existsSync,mkdirSync,rmSync,readFileSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
const root=resolve(import.meta.dirname,"../../");
const dest=resolve(import.meta.dirname,"../www");
rmSync(dest,{recursive:true,force:true});mkdirSync(dest,{recursive:true});
for(const name of ["index.html","app-icon.svg","manifest.webmanifest","service-worker.js"]){const src=join(root,name);if(!existsSync(src))throw new Error("Missing "+src);copyFileSync(src,join(dest,name));}
if(existsSync(join(root,"music")))cpSync(join(root,"music"),join(dest,"music"),{recursive:true});
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
