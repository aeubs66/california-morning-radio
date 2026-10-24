// Gemini writes the full radio-shaped script with opaque trusted-weather slots.
// The real forecast numbers and statements are inserted client-side from Open-Meteo.
// Never expose GEMINI_API_KEY to the browser.
const MODEL="gemini-3.8-flash";
const CITIES=new Set(["Los Angeles","San Francisco"]);
const PHASES=new Set(["dawn","morning","afternoon","evening","night"]);
const safeText=(v,max=80)=>typeof v==="string"&&v.length<=max&&/^[a-zA-Z0-9 .,:+\-]+$/.test(v);
const TOKENS=["[GREETING]","[CURRENT]","[TODAY]","[TOMORROW]","[CLOSING]"];
function validTemplate(s){
 if(typeof s!=="string"||s.length<125||s.length>720)return false;
 let prev=-1;
 for(const token of TOKENS){
  const i=s.indexOf(token);
  if(i<0||i<=prev||s.indexOf(token,i+1)!==-1)return false;
  prev=i;
 }
 if(/\[[^\]]+\]/g.test(s.replace(/\[(?:GREETING|CURRENT|TODAY|TOMORROW|CLOSING)\]/g,"")))return false;
 const prose=s.replace(/\[(?:GREETING|CURRENT|TODAY|TOMORROW|CLOSING)\]/g," ");
 if(/\d|[{}<>]|https?:|@/.test(prose))return false;
 if(/\b(?:degrees?|fahrenheit|celsius|rain(?:y|fall)?|cloud(?:s|y)?|winds?|gusts?|sunny|sunshine|fog(?:gy)?|snow|storms?|thunder|highs?|lows?|precipitation|percent|mph|forecast|temperature|advisory|warnings?)\b/i.test(prose))return false;
 const words=prose.trim().split(/\s+/).filter(Boolean).length;
 return words>=18&&words<=65;
}
const limiter=new Map();
function allow(ip){
 const now=Date.now();
 const v=limiter.get(ip)||[];
 const fresh=v.filter(t=>t>now-60000);
 if(fresh.length>=5)return false;
 fresh.push(now);limiter.set(ip,fresh);
 if(limiter.size>800)limiter.clear();
 return true;
}
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
 const hostname=req.headers.host,origin=req.headers.origin;
 if(origin&&!["https://"+hostname,"http://"+hostname].includes(origin))return res.status(403).json({error:"cross_origin"});
 const b=req.body&&typeof req.body==="object"?req.body:{};
 if(!CITIES.has(b.city)||!PHASES.has(b.phase)||!safeText(b.localTime,30)||
 !safeText(b.day,20)||!safeText(b.condition)||!Number.isInteger(b.nonce)||b.nonce<0||b.nonce>1000000){
  return res.status(400).json({error:"invalid_input"});
 }
 if(!allow(String(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"unknown").split(",")[0]))return res.status(429).json({error:"rate_limit"});
 const key=process.env.GEMINI_API_KEY;
 if(!key)return res.status(503).json({error:"gemini_not_configured"});
 const instructions=[
 "Create an ORIGINAL, flowing, peaceful Southern/Northern California FM radio weather narration.",
 "Output JSON with exactly one field called template.",
 "Do not write weather facts. The app inserts them into the following exact placeholders:",
 TOKENS.join(" "),
 "Include all five tokens exactly once each, in this order, in one coherent spoken monologue.",
 "Use prose before or after tokens for warmth, pacing, scene-setting, personality, gentle human natural transitions and a fresh ending.",
 "The total new prose OUTSIDE the tokens should be 25 to 48 words (enough for a 35-60 second full radio report including slots).",
 "Avoid cliches and obvious repeating lines. No poetic excess. This is a professional nostalgic California radio host, soft and natural.",
 "Never claim a specific time of sunrise/sunset, traffic, events, weather, temperatures, clouds, fog, rain, wind, or other verifiable facts OUTSIDE the placeholders.",
 "No weather nouns outside tokens at all, no numbers, emojis, markup, JSON-like codes or stage directions outside tokens.",
 "No invented firsthand observations of a place or people; choose subtle sensory atmosphere without weather claims.",
 "The programme location is "+b.city+". It is "+b.phase+" in California at "+b.localTime+" on "+b.day+".",
 "Observed condition context: "+b.condition+". It is for style only and must not be repeated outside weather tokens.",
 "Vary editorial mood and narration in a natural way for each request. Variation ID "+b.nonce+".",
 "Good example structural form: [GREETING] A small quiet moment, wherever you are in the city. [CURRENT] ... [TODAY] ... [TOMORROW] ... [CLOSING]",
 "DO NOT add weather descriptions after the sentence ending [CLOSING]."
 ].join("\n");
 let lastCode="gemini_unavailable";
 // 3.8 Flash has a documented free tier. 3.5 Flash-Lite is only a fallback
 // if the stronger model isn't accessible; never retry exhausted free quota.
 for(const model of [MODEL,"gemini-3.5-flash-lite"]){
  try{
   const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent",{
    method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
    body:JSON.stringify({
     contents:[{role:"user",parts:[{text:instructions}]}],
     generationConfig:{
      temperature:0.95,
      maxOutputTokens:650,
      responseMimeType:"application/json",
      responseSchema:{type:"OBJECT",properties:{template:{type:"STRING"}},required:["template"]},
      thinkingConfig:{thinkingLevel:"low"}
     }
    }),
    signal:AbortSignal.timeout(14000)
   });
   if(!r.ok){
    // Never return the provider's error text or key in HTTP responses.
    if([400,404,500,502,503,504].includes(r.status)){lastCode=r.status===503?"model_overloaded":"model_not_available";continue;}
    lastCode=r.status===401||r.status===403?"gemini_auth_or_access":r.status===429?"gemini_quota":"gemini_http_"+r.status;
    break;
   }
   const json=await r.json();
   const responseText=json.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("");
   if(!responseText){lastCode="empty_ai_reply";break;}
   const parsed=JSON.parse(responseText);
   const template=parsed?.template;
   if(!validTemplate(template)){lastCode="ai_template_validation_failed";break;}
   return res.status(200).json({template,model});
  }catch(e){
   lastCode=e?.name==="TimeoutError"?"gemini_timeout":"gemini_request_failed";
   break;
  }
 }
 return res.status(502).json({error:lastCode});
}
