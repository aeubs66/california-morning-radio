/* Free high-quality American female speech synthesized locally with Kokoro-82M.
   No paid service, no uploading the forecast text, no browser system voices.
   The pretrained weights download once and are cached by the browser. */
(() => {
  "use strict";
  let enginePromise = null;
  const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
  const VOICES = {
    af_nicole: "Nicole · Soft & intimate",
    af_heart: "Heart · Warm & grounded",
    af_bella: "Bella · Smooth & expressive"
  };
  function progressMessage(fn, message) { if (typeof fn === "function") fn(message); }
  function getEngine(onProgress) {
    if (!enginePromise) {
      progressMessage(onProgress, "Downloading the free neural voice model (first listen only)…");
      enginePromise = (async () => {
        const { KokoroTTS } = await import("https://esm.sh/kokoro-js@1.2.1?bundle");
        return KokoroTTS.from_pretrained(MODEL, { dtype: "q8", device: "wasm" });
      })().catch(err => { enginePromise = null; throw err; });
    }
    return enginePromise;
  }
  // The model's sentence-length limit means a forecast must be split.
  function splitScript(text, max=170) {
    const sentences = text.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    const chunks = [];
    let group = "";
    for (const s of sentences) {
      const sentence = s.trim();
      if (group && group.length + sentence.length + 1 > max) {
        chunks.push(group.trim()); group = "";
      }
      if (sentence.length <= max) {
        group += (group ? " " : "") + sentence;
      } else {
        for (const word of sentence.split(/\s+/)) {
          if (group && group.length + word.length + 1 > max) {
            chunks.push(group.trim()); group = "";
          }
          group += (group ? " " : "") + word;
        }
      }
    }
    if (group.trim()) chunks.push(group.trim());
    return chunks;
  }
  function makeWav(samples, rate) {
    const buffer = new ArrayBuffer(44 + samples.length*2);
    const view = new DataView(buffer);
    const chars = (offset, str) => {for(let i=0;i<str.length;i++)view.setUint8(offset+i,str.charCodeAt(i));};
    chars(0,"RIFF");view.setUint32(4,36+samples.length*2,true);
    chars(8,"WAVE");chars(12,"fmt ");view.setUint32(16,16,true);
    view.setUint16(20,1,true);view.setUint16(22,1,true);
    view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);
    view.setUint16(32,2,true);view.setUint16(34,16,true);
    chars(36,"data");view.setUint32(40,samples.length*2,true);
    for(let i=0;i<samples.length;i++){
      const s=Math.max(-1,Math.min(1,samples[i]));
      view.setInt16(44+i*2, s<0 ? Math.round(s*32768): Math.round(s*32767),true);
    }
    return new Blob([buffer],{type:"audio/wav"});
  }
  function radioMix(parts, rate) {
    const intro=Math.round(2.1*rate),outro=Math.round(2.8*rate),pause=Math.round(.14*rate);
    const speechSamples=parts.reduce((n,p)=>n+p.length,0)+pause*Math.max(0,parts.length-1);
    const total=intro+speechSamples+outro;
    const output=new Float32Array(total), TAU=2*Math.PI;
    let cursor=intro;
    for(const p of parts){
      for(let i=0;i<p.length;i++){
        const fade=Math.min(1,i/(rate*.045),(p.length-i)/(rate*.045));
        output[cursor+i]=Math.max(-.95,Math.min(.95,p[i]*.82*Math.max(0,fade)));
      }
      cursor+=p.length+pause;
    }
    // Original unobtrusive radio bed; music is baked into downloadable WAV.
    const chords=[[220,261.63,329.63],[174.61,220,261.63],[146.83,220,293.66],[164.81,246.94,329.63]];
    for(let i=0;i<total;i++){
      const t=i/rate, f=Math.min(1,t/2.1,(total-i)/rate/2.8);
      const secs=t%13,chord=chords[Math.floor(t/13)%chords.length];
      const env=Math.min(1,secs/2.6,(13-secs)/2.6);
      let pad=0;
      for(const hz of chord) pad+=Math.sin(TAU*hz*t)+.08*Math.sin(TAU*hz*1.004*t);
      // Piano notes around every fifth second, very low in the mix.
      const tick=t%5.2, bell= tick<3.2
        ? .0038*Math.exp(-tick*1.2)*Math.sin(TAU*[440,392,329.63,293.66][Math.floor(t/5.2)%4]*tick)
        : 0;
      output[i]+=(.0041*pad/3*Math.max(0,env)+bell)*Math.max(0,Math.min(1,f));
      output[i]=Math.max(-.98,Math.min(.98,output[i]));
    }
    return output;
  }
  async function generate(script,voice="af_nicole",onProgress=()=>{}) {
    const tts=await getEngine(onProgress);
    const chunks=splitScript(script);
    const parts=[];
    let sampleRate=24000;
    for(let i=0;i<chunks.length;i++){
      progressMessage(onProgress,`Creating natural narration — ${i+1} of ${chunks.length}…`);
      const result=await tts.generate(chunks[i],{voice:VOICES[voice]?voice:"af_nicole",speed:.94});
      const data=result.audio;
      if(!data || !data.length)throw new Error("Kokoro produced no audio for a sentence.");
      sampleRate=result.sampling_rate||24000;
      parts.push(data instanceof Float32Array?data:new Float32Array(data));
      // Keep the main thread responsive on slower mobile devices.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    progressMessage(onProgress,"Mixing soft piano and atmospheric music…");
    const wave=radioMix(parts,sampleRate);
    return {blob:makeWav(wave,sampleRate),duration:wave.length/sampleRate};
  }
  window.CaliforniaNeuralVoice={generate,voices:VOICES};
})();
