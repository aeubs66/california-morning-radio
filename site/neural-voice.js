/* Cloud-hosted Kokoro radio generation: no expensive AI inference on the user's CPU.
   Anonymous free TTS.ai provider; limited to 500 text characters per request
   and 5,000 total characters per IP per day, subject to provider availability.
   Audio is assembled with gentle piano/synth underneath the female voice. */
const VOICES={
 af_nicole:"Nicole · Soft & intimate",
 af_heart:"Heart · Warm & grounded",
 af_bella:"Bella · Smooth & expressive"
};
const API="https://api.tts.ai";
let active=null;
function cancel(){if(active){active.abort();active=null;}}
function splitText(text,max=430){
 const sentences=text.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[];
 const chunks=[];let next="";
 for(const fragment of sentences){
  const sentence=fragment.trim();if(!sentence)continue;
  if(next && next.length+sentence.length+1>max){chunks.push(next);next="";}
  if(sentence.length<=max){next+=(next?" ":"")+sentence;continue;}
  for(const word of sentence.split(/\s+/)){
   if(next && next.length+word.length+1>max){chunks.push(next);next="";}
   next+=(next?" ":"")+word;
  }
 }
 if(next)chunks.push(next);
 if(!chunks.length || chunks.some(x=>x.length>500))throw new Error("Radio script could not fit free service limits.");
 return chunks;
}
function sleep(ms,signal){
 return new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(new DOMException("Canceled","AbortError"));
  const onAbort=()=>{clearTimeout(t);reject(new DOMException("Canceled","AbortError"));};
  const t=setTimeout(()=>{signal.removeEventListener("abort",onAbort);resolve();},ms);
  signal.addEventListener("abort",onAbort,{once:true});
 });
}
async function textSpeech(text,voice,signal,onProgress,part,total){
 onProgress("Cloud voice: submitting segment "+part+" of "+total+"…");
 const response=await fetch(API+"/v1/tts/",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({model:"kokoro",voice,text,format:"mp3",language:"en",speed:0.94}),
  signal
 });
 if(!response.ok){
  const msg=(await response.text()).slice(0,240);
  if(response.status===429)throw new Error("Free hosted voice quota or rate limit reached (429). Try later.");
  throw new Error("Hosted TTS rejected segment "+part+" (HTTP "+response.status+"): "+msg);
 }
 const data=await response.json();
 if(!data.uuid)throw new Error("The voice service did not return a generation ID.");
 for(let attempt=0;attempt<75;attempt++){
  await sleep(attempt===0?1100:1300,signal);
  onProgress("Cloud voice: generating segment "+part+" of "+total+"…");
  const poll=await fetch(API+"/v1/speech/results/?uuid="+encodeURIComponent(data.uuid),{signal,cache:"no-store"});
  if(!poll.ok)throw new Error("Cloud voice status failed (HTTP "+poll.status+")");
  const status=await poll.json();
  if(status.status==="failed")throw new Error("Cloud voice generation failed: "+(status.error||"provider error"));
  if(status.status!=="completed")continue;
  const url=status.result_url||status.url;
  if(typeof url!=="string"||!/^https:\/\/(?:cdn|api)\.tts\.ai\//.test(url))
   throw new Error("Cloud voice returned an unexpected audio link.");
  onProgress("Cloud voice: downloading segment "+part+" of "+total+"…");
  const audio=await fetch(url,{signal});
  if(!audio.ok)throw new Error("Cloud voice audio download failed (HTTP "+audio.status+")");
  const bytes=await audio.arrayBuffer();
  if(bytes.byteLength<400)throw new Error("Cloud voice returned an empty audio clip.");
  return bytes;
 }
 throw new Error("Hosted voice queue timed out. Try again later.");
}
function wavFromAudio(buffer){
 const src=buffer.getChannelData(0),view=new DataView(new ArrayBuffer(44+src.length*2));
 const four=(pos,s)=>{for(let i=0;i<s.length;i++)view.setUint8(pos+i,s.charCodeAt(i))};
 four(0,"RIFF");view.setUint32(4,36+src.length*2,true);four(8,"WAVE");
 four(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);
 view.setUint16(22,1,true);view.setUint32(24,buffer.sampleRate,true);
 view.setUint32(28,buffer.sampleRate*2,true);view.setUint16(32,2,true);
 view.setUint16(34,16,true);four(36,"data");view.setUint32(40,src.length*2,true);
 for(let i=0;i<src.length;i++){
  const v=Math.max(-1,Math.min(1,src[i]));
  view.setInt16(44+i*2,Math.round(v<0?v*32768:v*32767),true);
 }
 return new Blob([view.buffer],{type:"audio/wav"});
}
async function mixWithMorningMusic(chunks,signal,onProgress){
 onProgress("Mixing soft piano and atmospheric synths…");
 const AC=window.AudioContext||window.webkitAudioContext;
 if(!AC || !window.OfflineAudioContext)throw new Error("Audio mixing isn't supported by this browser.");
 const decoder=new AC();
 let decoded;
 try{decoded=await Promise.all(chunks.map(bytes=>decoder.decodeAudioData(bytes.slice(0))))}
 finally{await decoder.close().catch(()=>{})}
 if(signal.aborted)throw new DOMException("Canceled","AbortError");
 const intro=2.1,outro=2.5,gap=0.18,sr=24000;
 const speechSeconds=decoded.reduce((t,a)=>t+a.duration,0)+(decoded.length-1)*gap;
 const duration=intro+speechSeconds+outro;
 const offline=new OfflineAudioContext(1,Math.ceil(duration*sr),sr);
 let position=intro;
 for(const buffer of decoded){
  const source=offline.createBufferSource();source.buffer=buffer;
  const vol=offline.createGain();
  const fade=Math.min(.06,buffer.duration/6);
  vol.gain.setValueAtTime(0,position);
  vol.gain.linearRampToValueAtTime(.9,position+fade);
  vol.gain.setValueAtTime(.9,position+buffer.duration-fade);
  vol.gain.linearRampToValueAtTime(0,position+buffer.duration);
  source.connect(vol).connect(offline.destination);
  source.start(position);position+=buffer.duration+gap;
 }
 const notes=[[220,261.63,329.63],[174.61,220,261.63],[146.83,220,293.66],[164.81,246.94,329.63]];
 // Original very low-key ambient bed, kept underneath speech.
 for(let t=0;t<duration;t+=12){
  const chord=notes[Math.floor(t/12)%notes.length];
  for(const note of chord){
   const o=offline.createOscillator(),g=offline.createGain();
   o.type="sine";o.frequency.value=note;
   const e=Math.min(duration,t+12);
   g.gain.setValueAtTime(.00005,t);
   g.gain.linearRampToValueAtTime(.008,t+Math.min(2.2,(e-t)/2));
   g.gain.setValueAtTime(.008,Math.max(t+Math.min(2.2,(e-t)/2),e-2));
   g.gain.linearRampToValueAtTime(.00005,e);
   o.connect(g).connect(offline.destination);o.start(t);o.stop(e);
  }
 }
 const melody=[440,392,329.63,293.66,349.23,392];
 for(let t=0;t<duration;t+=5.2){
  const length=Math.min(2.7,duration-t);
  if(length<.15)break;
  const o=offline.createOscillator(),g=offline.createGain();
  o.type="sine";o.frequency.value=melody[Math.floor(t/5.2)%melody.length];
  g.gain.setValueAtTime(.00001,t);
  g.gain.linearRampToValueAtTime(.013,t+.04);
  g.gain.exponentialRampToValueAtTime(.00001,t+length);
  o.connect(g).connect(offline.destination);o.start(t);o.stop(t+length);
 }
 const output=await offline.startRendering();
 if(signal.aborted)throw new DOMException("Canceled","AbortError");
 return {blob:wavFromAudio(output),duration:output.duration};
}
async function generate(script,voice="af_nicole",onProgress=()=>{}){
 if(active)throw new Error("Another report is already generating. Cancel it before starting a new one.");
 const controller=new AbortController();active=controller;
 const signal=controller.signal;
 try{
  const chunks=splitText(script),audios=[];
  for(let i=0;i<chunks.length;i++){
   const bytes=await textSpeech(chunks[i],VOICES[voice]?voice:"af_nicole",signal,onProgress,i+1,chunks.length);
   audios.push(bytes);
  }
  return await mixWithMorningMusic(audios,signal,onProgress);
 }finally{if(active===controller)active=null;}
}
window.CaliforniaNeuralVoice={voices:VOICES,generate,cancel};
