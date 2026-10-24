/* Time-aware, fact-safe California radio writing.
  Forecast figures are inserted ONLY from Open-Meteo; an optional LLM may
  supply editorial transitions but can never replace numerical weather facts. */
const TZ="America/Los_Angeles";
const openings={
  dawn:["The city is finding its first quiet rhythm.","The day is just beginning to stretch awake.","Here's a peaceful beginning to the hours ahead."],
  morning:["Here's your gentle start to the day.","A fresh stretch of California hours is ahead.","Whether you're on the move or taking it slow, here's your forecast."],
  afternoon:["A little California pause for your afternoon.","Here's a quiet moment in the middle of the day.","A fresh look at the weather as the afternoon unfolds."],
  evening:["The pace of the day is beginning to soften.","Here's a gentle check-in as evening settles in.","As the daylight hours wind down, here's what the weather is doing."],
  night:["A quieter hour to check in on the city.","For anyone still awake, here's a calm weather update.","The city has slipped into its late-night rhythm."]
};
const bridges={
  clear:["There's a simple pleasure in a clear California sky.","It's a lovely moment for a little space in your day.","Let's see how the rest of the forecast is shaping up."],
  cloudy:["Let's look at the changes in the sky today.","Here's what the clouds mean for the rest of the forecast.","For the hours ahead, here's the outlook."],
  wet:["Let's keep an eye on the changing conditions.","Now, for the rest of today's weather.","Here's the outlook as conditions develop."],
  fog:["Low visibility can make for a slower start, so take your time outside.","Here's how conditions look beyond the haze.","Now, on to the rest of the forecast."],
  other:["Let's turn to the day's outlook.","Here's what the weather holds for the hours ahead.","And here's the forecast at a glance."]
};
const tomorrowLines=[
 "Now, a look one day ahead.",
 "And for tomorrow, here's the outlook.",
 "Looking beyond today, here's what to expect.",
 "Let's take a quick look at tomorrow."
];
const closings={
 "los-angeles":[
   "Take a little California calm with you, wherever the day leads.",
   "From the neighborhoods to the hills, enjoy the hours ahead.",
   "Here's hoping you find one peaceful moment for yourself today."
 ],
 "san-francisco":[
   "From the waterfront to the hills, wishing you an unhurried day.",
   "Here's to a peaceful moment somewhere in the city by the bay.",
   "Whether you're out or staying in, enjoy a little quiet in your day."
 ]
};
export function pacificContext(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
  timeZone:TZ,weekday:"long",year:"numeric",month:"long",day:"numeric",hour:"numeric",
  minute:"2-digit",hour12:false,hourCycle:"h23"
 }).formatToParts(now).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
 const hour=Number(p.hour)%24;
 const phase=hour<5?"night":hour<9?"dawn":hour<12?"morning":hour<17?"afternoon":hour<21?"evening":"night";
 const greeting=phase==="dawn"||phase==="morning"?"Good morning":
   phase==="afternoon"?"Good afternoon":phase==="evening"?"Good evening":"Hello";
 const localTime=new Intl.DateTimeFormat("en-US",{timeZone:TZ,hour:"numeric",minute:"2-digit",hour12:true}).format(now);
 return {hour,phase,greeting,localTime,weekday:p.weekday,dateLabel:p.month+" "+p.day+", "+p.year};
}
function pick(arr,index){return arr[Math.abs(index)%arr.length]}
function kind(code){
 const n=Number(code);
 if([45,48].includes(n))return "fog";
 if([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(n))return "wet";
 if([0,1].includes(n))return "clear";
 if([2,3].includes(n))return "cloudy";
 return "other";
}
const onlySafe=(s)=>{
 if(typeof s!=="string")return null;
 const text=s.trim().replace(/\s+/g," ");
 if(text.length<10||text.length>148||text.split(" ").length>24||/[\d<>\[\]{}]/.test(text))return null;
 // AI is only permitted to write radio atmosphere, never new forecast claims.
 if(/\b(?:degrees?|fahrenheit|rain|thunder|storms?|wind|gusts?|temperatures?|highs?|lows?|foggy|forecast|cloudy|sunny|precipitation|percent|mph|snow|flood|heatwave|advisory|warnings?)\b/i.test(text))return null;
 return text;
};
export function safeFlavor(flavors){
 if(!flavors||typeof flavors!=="object")return null;
 const x={};
 for(const key of ["opening","bridge","tomorrowIntro","closing"]){
  x[key]=onlySafe(flavors[key]);if(!x[key])return null;
 }
 return x;
}
export function fallbackFlavor(r,ctx,nonce=0){
 const seed=Math.floor(Date.now()/60000)+ctx.hour*27+(r.slug==="los-angeles"?19:71)+nonce*11;
 return {
  opening:pick(openings[ctx.phase],seed),
  bridge:pick(bridges[kind(r.current_code)],seed+2),
  tomorrowIntro:pick(tomorrowLines,seed+1),
  closing:pick(closings[r.slug],seed+3)
 };
}
export function assembleBroadcast(r,ctx,flavor){
 const f=safeFlavor(flavor)||fallbackFlavor(r,ctx);
 const spokenCity=r.city;
 // Figures below are never authored by an LLM; only verified live data.
 const breeze=Number(r.wind)>=12?" Winds are currently around "+Math.round(r.wind)+" miles per hour.":"";
 const rain=(r.rain!==null&&r.rain!==undefined&&Number(r.rain)>=15)?" Today's chance of precipitation is "+Math.round(r.rain)+" percent.":"";
 const intro="It's "+ctx.localTime+" Pacific time on "+ctx.weekday+", "+ctx.dateLabel+".";
 return [
  ctx.greeting+", "+spokenCity+". "+intro+" "+f.opening,
  "At the latest weather check, it's "+r.current_temp+" degrees with "+r.current_desc+".",
  f.bridge,
  "Today's outlook is "+r.today_desc+", with a forecast high near "+r.today_high+" and a low around "+r.today_low+" degrees."+breeze+rain,
  f.tomorrowIntro,
  "Tomorrow brings "+r.tomorrow_desc+", a high near "+r.tomorrow_high+" and a low around "+r.tomorrow_low+".",
  f.closing+" You're listening to California Morning Radio."
 ].join(" ").replace(/\s+/g," ").trim();
}
export async function createBroadcast(r,ctx,nonce=0,signal){
 let flavor=null,mode="time-aware";
 try{
  const response=await fetch("/api/radio-script",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      city:r.city,phase:ctx.phase,localTime:ctx.localTime,
      day:ctx.weekday,condition:r.current_desc,
      code:r.current_code,nonce
    }),
    signal
  });
  if(response.ok){flavor=safeFlavor((await response.json()).flavor);if(flavor)mode="AI-written";}
 }catch(e){if(e?.name==="AbortError")throw e;}
 return {script:assembleBroadcast(r,ctx,flavor||fallbackFlavor(r,ctx,nonce)),mode};
}
