/* Main-thread controller. The radio UI stays responsive while the Kokoro
   AI model works in a dedicated Web Worker, even on slower computers. */
const VOICES={af_nicole:"Nicole · Soft & intimate",af_heart:"Heart · Warm & grounded",af_bella:"Bella · Smooth & expressive"};
let worker=null,active=null,serial=0;
function cancel(){
 if(active){
  const job=active;active=null;
  job.reject(Object.assign(new Error("Generation canceled"),{name:"AbortError"}));
 }
 if(worker){worker.terminate();worker=null;}
}
function generate(script,voice="af_nicole",onProgress=()=>{}){
 if(typeof Worker==="undefined")return Promise.reject(new Error("Your browser does not support background audio workers"));
 if(active)return Promise.reject(new Error("One radio report is already generating. Please cancel it first."));
 if(!worker){
  try{
   worker=new Worker(new URL("./voice-worker.js",import.meta.url),{type:"module"});
  }catch(e){return Promise.reject(new Error("Unable to start background voice worker: "+e.message));}
  worker.onerror=e=>{
   const error=new Error("Voice worker failed: "+(e?.message||"unknown error"));
   if(active){const job=active;active=null;job.reject(error);}
   worker?.terminate();worker=null;
  };
  worker.onmessage=({data})=>{
   if(!active||data?.id!==active.id)return;
   if(data.type==="progress"){
    active.onProgress(data.message);return;
   }
   const job=active;active=null;
   if(data.type==="error"){job.reject(new Error(data.message));return;}
   if(data.type==="result"){
     const blob=new Blob([data.buffer],{type:"audio/wav"});
     if(blob.size<=44)job.reject(new Error("Voice model returned an empty recording"));
     else job.resolve({blob,duration:data.duration});
   }
  };
 }
 return new Promise((resolve,reject)=>{
  const id=++serial;active={id,resolve,reject,onProgress};
  try{worker.postMessage({type:"generate",id,script,voice});}
  catch(e){active=null;reject(e);}
 });
}
window.CaliforniaNeuralVoice={voices:VOICES,generate,cancel};
