import './neural-voice.js';

const pacific = 'America/Los_Angeles';
function pacificDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: pacific, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function prettyDate(s) {
  const [y,m,d] = s.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y,m-1,d)));
}
function updateClock() {
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: pacific, weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());
  document.getElementById('clock').textContent = `${clock} · California`;
}
function element(tag, cls, content) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (content !== undefined) el.textContent = content;
  return el;
}

const LOCATIONS=[
  {city:'Los Angeles',slug:'los-angeles',lat:34.0522,lon:-118.2437},
  {city:'San Francisco',slug:'san-francisco',lat:37.7749,lon:-122.4194}
];
const SKY={0:'clear skies',1:'mostly clear skies',2:'partly cloudy skies',3:'overcast skies',45:'fog',48:'patchy fog',51:'light drizzle',53:'drizzle',55:'steady drizzle',61:'light rain',63:'rain',65:'heavy rain',80:'a few showers',81:'rain showers',82:'heavy showers',95:'thunderstorms'};
let playing=null;
function rounded(x){if(x===null||x===undefined||!Number.isFinite(Number(x)))throw Error('Missing verified weather value');return Math.round(Number(x));}
async function liveWeather(c) {
  const params=new URLSearchParams({latitude:String(c.lat),longitude:String(c.lon),timezone:'America/Los_Angeles',temperature_unit:'fahrenheit',wind_speed_unit:'mph',forecast_days:'3',current:'temperature_2m,weather_code,wind_speed_10m',daily:'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max'});
  const response=await fetch('https://api.open-meteo.com/v1/forecast?'+params,{cache:'no-store'});
  if(!response.ok)throw Error('Weather provider HTTP '+response.status);
  const w=await response.json();if(w.error)throw Error(w.reason||'Weather provider error');
  const today=pacificDate(),next=new Date(today+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
  const i=w.daily.time.indexOf(today),j=w.daily.time.indexOf(next.toISOString().slice(0,10));
  if(i===-1||j===-1)throw Error('Weather provider has no forecast for today and tomorrow');
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',timeZoneName:'shortOffset'}).formatToParts(new Date());
  const offset=Number((parts.find(x=>x.type==='timeZoneName')?.value||'GMT-7').match(/GMT([+-]\d+)/)?.[1]||'-7');
  const observation=new Date(w.current.time+'Z').getTime()-offset*3600*1000;
  if(Math.abs(Date.now()-observation)>5*3600*1000)throw Error('Observation is not fresh');
  const label=code=>SKY[code]||'variable skies';
  return {...c,date:today,current_temp:rounded(w.current.temperature_2m),current_desc:label(w.current.weather_code),today_high:rounded(w.daily.temperature_2m_max[i]),today_low:rounded(w.daily.temperature_2m_min[i]),today_desc:label(w.daily.weather_code[i]),tomorrow_high:rounded(w.daily.temperature_2m_max[j]),tomorrow_low:rounded(w.daily.temperature_2m_min[j]),tomorrow_desc:label(w.daily.weather_code[j]),wind:w.current.wind_speed_10m,rain:w.daily.precipitation_probability_max?.[i]??null};
}
function announcement(r){
  const weekday=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long'}).format(new Date(r.date+'T12:00:00Z'));
  const wind=Number(r.wind)>=12?'A breeze near '+rounded(r.wind)+' miles an hour is moving through. ':'';
  const rain=r.rain!==null&&Number(r.rain)>=15?'The chance of rain is '+rounded(r.rain)+' percent. ':'';
  const closing=r.slug==='los-angeles'
    ? 'Wherever your morning begins, let the sunshine find you.'
    : 'From the waterfront to the quiet hills, have a peaceful morning.';
  return 'Good morning, '+r.city+'. It is '+weekday+', '+prettyDate(r.date)+'. '
    +'The city is waking up slowly. Right now, it is '+r.current_temp+' degrees with '+r.current_desc+'. '
    +'Today brings '+r.today_desc+', a high near '+r.today_high+' and a low around '+r.today_low+' tonight. '
    +wind+rain
    +'Tomorrow brings '+r.tomorrow_desc+', a high near '+r.tomorrow_high+' and a low near '+r.tomorrow_low+'. '
    +closing+' This is Good Morning, '+r.city+'.';
}
const speechCache=new Map();
let preferredVoice=(()=>{try{return localStorage.getItem('california-radio-voice')||'af_nicole'}catch{return 'af_nicole'}})();
function updateVoice(voice){
  preferredVoice=voice;
  try{localStorage.setItem('california-radio-voice',voice)}catch{}
  document.querySelectorAll('.voice-choice').forEach(select=>select.value=voice);
}

function stop(){
  if (!playing) return;
  const item=playing;
  playing=null;
  if(item.audio) { item.audio.pause(); item.audio.currentTime=0; }
  if(item.generating) window.CaliforniaNeuralVoice?.cancel();
  if(item.elapsedTimer) clearInterval(item.elapsedTimer);
  if(item.generating && item.button) { item.button._radio=null; }
  if(item.button){
    item.button.textContent=item.generating?'▶ Generate radio recording':(item.audio?'▶ Play recording':'▶ Generate recording');
    item.button.setAttribute('aria-pressed','false');
  }
}
function ensureAudioUI(r,button,cached) {
  const card=button.closest('.weather-card');
  const oldPlayer=card.querySelector('.radio-player');
  if(oldPlayer){
    const existing=button._radio;
    if(existing?.url)URL.revokeObjectURL(existing.url);
    oldPlayer.remove();
  }
  const wrapper=element('div','radio-player');
  const title=element('div','player-ready','✓ Recording ready · '+Math.round(cached.duration)+' seconds');
  const audio=element('audio');
  audio.controls=true;
  audio.preload='metadata';
  audio.setAttribute('aria-label','Listen to Good Morning, '+r.city);
  const url=URL.createObjectURL(cached.blob);
  audio.src=url;
  const download=element('a','wav-download','↓ Download this recording');
  download.href=url;
  download.download=r.slug+'-'+r.date+'-'+preferredVoice+'.wav';
  wrapper.append(title,audio,download);
  card.insertBefore(wrapper,card.querySelector('.voice-note'));
  button._radio={ready:true,generating:false,audio,url};
  audio.onplay=()=>{
    if(playing && playing.audio!==audio)stop();
    playing={button,audio,generating:false};
    button.textContent='Ⅱ Pause recording';
    button.setAttribute('aria-pressed','true');
    document.getElementById('status-message').textContent='Now playing Good Morning, '+r.city+'.';
  };
  audio.onpause=()=>{
    if(playing?.audio===audio)playing=null;
    button.textContent='▶ Play recording';
    button.setAttribute('aria-pressed','false');
  };
  audio.onended=()=>{
    if(playing?.audio===audio)playing=null;
    button.textContent='▶ Play recording';
    button.setAttribute('aria-pressed','false');
    document.getElementById('status-message').textContent='Thanks for tuning in. Choose another city whenever you like.';
  };
  audio.onerror=()=>{
    document.getElementById('status-message').textContent='Could not decode this recording in your browser. Please try Download this recording.';
  };
  // The recording is now a genuine audio file with a native player. We don't
  // call audio.play() here: long asynchronous TTS generation loses the user's
  // browser activation, and autoplay gets blocked on Chrome/Safari/mobile.
  button.textContent='▶ Play recording';
  button.setAttribute('aria-pressed','false');
}
async function speak(r,button){
  const status=document.getElementById('status-message');
  const state=button._radio;
  if(state?.generating){
    stop();
    status.textContent='Recording generation canceled. Chrome can keep playing other audio normally.';
    return;
  }
  if(state?.ready && state.audio){
    // This runs synchronously from the user's actual click, so browser
    // autoplay protection permits playback on mobile and desktop.
    if(state.audio.paused){
      if(playing && playing.audio!==state.audio)stop();
      try{
        await state.audio.play();
      }catch(error){
        status.textContent='Your recording is ready, but automatic playback was blocked ('+(error?.name||'browser restriction')+'). Tap Play in the audio player directly.';
      }
    }else{
      state.audio.pause();
    }
    return;
  }
  const engine=window.CaliforniaNeuralVoice;
  if(!engine){
    status.textContent='Voice engine has not loaded. Please refresh and try again.';
    return;
  }
  if(playing && playing.button!==button)stop();
  const item={button,audio:null,generating:true,startedAt:Date.now(),progressText:'Preparing neural voice…'};
  playing=item;
  button._radio=item;
  button.textContent='■ Cancel generation';
  button.setAttribute('aria-pressed','true');
  status.textContent='AI voice generating in the background. The page will remain responsive. First-time download ~100 MB.';
  item.elapsedTimer=setInterval(()=>{
    if(button._radio!==item)return clearInterval(item.elapsedTimer);
    status.textContent=item.progressText+' · '+Math.floor((Date.now()-item.startedAt)/1000)+'s elapsed. You can cancel anytime.';
  },1000);
  const script=announcement(r),voice=preferredVoice;
  const key=r.slug+':'+voice+':'+script;
  try{
    let cached=speechCache.get(key);
    if(!cached){
      cached=await engine.generate(script,voice,message=>{
        if(button._radio===item){
          item.progressText=message;
          status.textContent=message+' (background worker; you can cancel)';
        }
      });
      speechCache.set(key,cached);
    }
    if(button._radio!==item)return;
    clearInterval(item.elapsedTimer);
    if(playing===item)playing=null;
    ensureAudioUI(r,button,cached);
    status.textContent='Your '+r.city+' recording is ready! Tap ▶ Play recording or use the audio controls below. The soft music is included.';
  }catch(error){
    if(button._radio!==item)return;
    clearInterval(item.elapsedTimer);
    if(playing===item)playing=null;
    button._radio=null;
    button.textContent='↻ Retry voice generation';
    button.setAttribute('aria-pressed','false');
    status.textContent='Could not generate free neural speech: '+(error?.message||String(error))+'. If your phone has limited memory, try desktop Chrome or Edge. No weather was invented.';
    console.error('[California Radio] Voice generation failure:',error);
  }
}
function card(r){
  const a=element('article','weather-card '+(r.slug==='san-francisco'?'sf':'la'));
  a.append(element('div','card-overline',r.slug==='los-angeles'?'✦ THE SOUTHERN CALIFORNIA EDITION':'✦ THE NORTHERN CALIFORNIA EDITION'));
  const head=element('div','card-head');head.append(element('div','city',r.city),element('div','temperature',r.current_temp+'°'));a.append(head);
  a.append(element('div','sky',r.current_desc));
  const fc=element('div','forecast');for(const [name,temp] of [['HIGH',r.today_high],['LOW',r.today_low],['TOMORROW',r.tomorrow_high]]){
    const sp=element('span');sp.append(name+' ',element('strong','',temp+'°F'));fc.append(sp);
  }
  a.append(fc,element('div','separator'));
  const label=element('div','play-caption');label.append(element('span','',r.audio?'☼ RECORDED EDITION':'☼ LIVE EDITION'),element('span','',r.audio?Math.round(r.duration||45)+' SEC':'FREE · ON DEMAND'));a.append(label);
  if(r.audio){const audio=element('audio');audio.controls=true;audio.preload='none';audio.setAttribute('aria-label','Play recorded broadcast for '+r.city);const src=element('source');src.src=r.audio;src.type='audio/mpeg';audio.append(src);a.append(audio);}
  const voiceLabel=element('label','voice-label','RADIO VOICE');
  const choice=element('select','voice-choice');choice.setAttribute('aria-label','Choose female radio voice for '+r.city);
  for(const [id,title] of Object.entries(window.CaliforniaNeuralVoice?.voices||{af_nicole:'Nicole · Soft & intimate',af_heart:'Heart · Warm & grounded',af_bella:'Bella · Smooth & expressive'})){
    const option=element('option','',title);option.value=id;choice.append(option);
  }
  choice.value=preferredVoice;choice.onchange=()=>{
    if(playing)stop();
    const next=choice.value;
    // Invalidate audio prepared with a different narrator, on both city cards.
    document.querySelectorAll('.weather-card').forEach(card=>{
      const b=card.querySelector('.live-play');
      if(b?._radio?.url)URL.revokeObjectURL(b._radio.url);
      if(b){
        b._radio=null;b.textContent='▶ Generate radio recording';
        b.setAttribute('aria-pressed','false');
      }
      card.querySelector('.radio-player')?.remove();
    });
    updateVoice(next);
    document.getElementById('status-message').textContent='Voice changed. Tap Generate to create a new recording with '+(window.CaliforniaNeuralVoice?.voices?.[next]||next)+'.';
  };
  voiceLabel.append(choice);a.append(voiceLabel);
  const button=element('button','live-play','▶ Generate radio recording');button.type='button';button.setAttribute('aria-label','Generate and listen to natural neural radio for '+r.city);button.setAttribute('aria-pressed','false');button.onclick=()=>speak(r,button);a.append(button);
  a.append(element('p','voice-note','Free natural neural voice, not your browser’s robotic system voice. First use downloads the neural voice model (about 100 MB). Voice generation happens off the main page, but a slower CPU may still need several minutes. Tap again to cancel. Once ready, tap Play. Piano and synth are included.'));
  return a;
}
async function load(){
  const box=document.getElementById('broadcasts'),status=document.getElementById('status-message');
  try{
    const current=await Promise.all(LOCATIONS.map(liveWeather));
    try{
      const response=await fetch('data.json?refresh='+Date.now(),{cache:'no-store'});
      if(response.ok){const data=await response.json();if(data.date===pacificDate()&&Array.isArray(data.reports))current.forEach(r=>{const x=data.reports.find(y=>y.slug===r.slug);if(x?.audio){r.audio=x.audio;r.duration=x.duration}});}
    }catch{}
    box.replaceChildren(...current.map(card));document.getElementById('edition').textContent=prettyDate(pacificDate())+' · Pacific time';
    status.textContent=current.every(r=>r.audio)?'Recorded MP3 editions are ready. Or listen live for the newest conditions.':'Two free live broadcasts are ready. Choose a warm female neural voice and press Play. First use downloads the free AI model. Automatic morning MP3 publishing is not yet active.';
  }catch(e){box.replaceChildren(element('article','placeholder','The live weather service is unavailable. No forecast will be invented.'));status.textContent='Unable to verify weather: '+e.message;}
}
const css=document.createElement('style');css.textContent='.voice-label{display:block;font-size:10px;letter-spacing:.16em;color:#dfb980;margin:17px 0 5px}.voice-choice{display:block;width:100%;margin-top:8px;border:1px solid #69817a;border-radius:7px;background:#213739;color:#f2ede1;padding:12px 10px;font:inherit;font-size:13px;letter-spacing:0}.radio-player{margin:14px 0 8px;padding:14px;border:1px solid rgba(223,185,128,.5);border-radius:9px;background:rgba(0,0,0,.16)}.radio-player audio{display:block;width:100%;margin-top:10px;height:45px}.player-ready{color:#f0d5a9;font-weight:600;font-size:12px}.wav-download{display:block;margin-top:15px;font-size:12px;color:#dfb980;text-decoration:underline;text-underline-offset:4px}.live-play{width:100%;border:1px solid #e5bc8b;border-radius:8px;padding:15px;margin-top:13px;background:#e6c49a;color:#1c3030;font-size:12px;letter-spacing:.13em;font-weight:700;cursor:pointer}.live-play[aria-pressed=true]{background:#213a3c;color:#f2ede1}.voice-note{font-size:11px;color:#bdc6bc;line-height:1.6;margin:10px 0 0}';document.head.append(css);
updateClock();setInterval(updateClock,60000);load();
