// Python is executed inside a worker so runaway loops cannot freeze the editor UI.
// This is not a security sandbox for untrusted Python. Run only code you trust.
import {loadPyodide} from "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";

let runtime=null;
async function getRuntime(){
  if(!runtime)runtime=loadPyodide();
  return await runtime;
}
self.addEventListener("message",async event=>{
  const {id,code,stdin}=event.data||{};
  if(!Number.isSafeInteger(id)||typeof code!=="string")return;
  self.postMessage({id,type:"status",value:"Loading Python engine…"});
  try{
    const py=await getRuntime();
    self.postMessage({id,type:"status",value:"Running Python…"});
    py.setStdout({batched:value=>self.postMessage({id,type:"output",value:String(value)+"\n"})});
    py.setStderr({batched:value=>self.postMessage({id,type:"output",value:String(value)+"\n"})});
    const inputLines=String(stdin||"").split(/\r?\n/);
    py.setStdin({stdin:()=>inputLines.length?inputLines.shift():null});
    await py.loadPackagesFromImports(code);
    const result=await py.runPythonAsync(code);
    if(result!==undefined&&result!==null)self.postMessage({id,type:"output",value:String(result)+"\n"});
    if(result&&typeof result.destroy==="function")result.destroy();
    self.postMessage({id,type:"done",ok:true});
  }catch(error){
    self.postMessage({id,type:"output",value:String(error?.message||error)+"\n"});
    self.postMessage({id,type:"done",ok:false});
  }
});
