// Optional Gemini Flash-Lite editorial writer. API key stays server-side.
// The client always composes trusted temperature/forecast sentences itself.
const MODEL="gemini-2.5-flash-lite";
const CITIES=new Set(["Los Angeles","San Francisco"]);
const PHASES=new Set(["dawn","morning","afternoon","evening","night"]);
const allowedText=(value,max=80)=>typeof value==="string" && value.length<=max && /^[a-zA-Z0-9 .,:+-]+$/.test(value);
const field=(name)=>({type:"STRING",description:name});
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
 const key=process.env.GEMINI_API_KEY;
 if(!key)return res.status(503).json({error:"gemini_not_configured"});
 const origin=req.headers.origin;
 const hostname=req.headers.host;
 if(origin && ![("https://"+hostname),("http://"+hostname)].includes(origin))
   return res.status(403).json({error:"cross_origin"});
 const b=req.body&&typeof req.body==="object"?req.body:{};
 if(!CITIES.has(b.city)||!PHASES.has(b.phase)||!allowedText(b.localTime,30)||
    !allowedText(b.day,20)||!allowedText(b.condition)||!Number.isInteger(b.nonce)||b.nonce<0||b.nonce>1000000)
    return res.status(400).json({error:"invalid_input"});
 const instruction=[
 "You write short, gentle and varied editorial interludes for a nostalgic California weather-radio show.",
 "This is "+b.city+" on "+b.day+", during "+b.phase+" at "+b.localTime+" Pacific time.",
 "The verified observed weather descriptor is "+b.condition+".",
 "Write exactly four natural-sounding creative snippets, JSON keys opening, bridge, tomorrowIntro, closing.",
 "Make them unique, warm, conversational, quiet and specific to city and daypart. Avoid formulaic repeated phrases.",
 "Each snippet must be one concise sentence of 5 to 15 words; no longer than 130 characters.",
 "DO NOT state weather, temperatures, high/lows, clouds, winds, rain, sunset time, sunrise, meteorological facts, events or news.",
 "DO NOT use numbers or percentages. The application inserts all verified facts separately.",
 "Do not mention real landmarks as if a condition has been observed there.",
 "No emojis, stage directions, salutation, outro program name, or claims about specific people.",
 "Vary narrative imagery gently, without clichés. Variance seed: "+b.nonce+"."
 ].join("\n");
 try{
  const result=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+MODEL+":generateContent",{
    method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
    body:JSON.stringify({
      contents:[{role:"user",parts:[{text:instruction}]}],
      generationConfig:{
        responseMimeType:"application/json",temperature:.9,maxOutputTokens:240,
        responseSchema:{type:"OBJECT",properties:{
          opening:field("Editorial welcome"),bridge:field("Brief transition to daily weather"),
          tomorrowIntro:field("Transition to tomorrow"),closing:field("Gentle city-specific closing")
        },required:["opening","bridge","tomorrowIntro","closing"],propertyOrdering:["opening","bridge","tomorrowIntro","closing"]}
      }
    }),signal:AbortSignal.timeout(9000)
  });
  if(!result.ok)return res.status(502).json({error:"gemini_unavailable"});
  const body=await result.json();
  const generated=body.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("");
  if(!generated)return res.status(502).json({error:"empty_output"});
  const flavor=JSON.parse(generated);
  return res.status(200).json({flavor});
 }catch(e){
  return res.status(502).json({error:"gemini_error"});
 }
}
