# California Morning Radio ☀️ 📻

A peaceful California weather radio show for **Los Angeles** and **San Francisco**, hosted online for free.

- **Live radio:** Fresh Open-Meteo weather when you press Generate, narrated by American female [Kokoro voices hosted by TTS.ai](https://tts.ai/api/), not computed in your browser. Choose Nicole, Heart or Bella; the site downloads cloud-generated speech and mixes a quiet original synth/piano soundtrack into a WAV you can play or save. No large local AI download or heavy local inference.
- **Daily recorded editions:** A GitHub Actions job is configured for **8:00 AM America/Los_Angeles** and can generate two MP3s with Kokoro on a cloud runner. Availability depends on GitHub Actions runner access and limits; this job is not guaranteed to start at the exact minute.
- **Privacy:** No ElevenLabs API key or credits. The forecast text is sent from your browser to the third-party free [TTS.ai](https://tts.ai/) voice service to generate speech; avoid including personal text. Audio mixing happens locally. No model weights need to download.
- **Source:** This is a standalone GitHub repository, separate from `aeubs66/code`.

## Deploy

The listening site's static files are in `site/`. This repository is linked to its **own Vercel project**, separate from `aeubs66/code`:

- [Production website](https://california-radio-independent-ayoubs-projects-d793d9ee.vercel.app/) (available when the first deployment reaches **Ready**)
- [Vercel project](https://vercel.com/ayoubs-projects-d793d9ee/california-radio-independent)

Vercel builds from the `main` branch, with Root Directory `site`, Framework Preset **Other**, and a static site at `site/index.html`.

The project is designed to stay available for live listening even if the daily server-side MP3 job fails.

## Generate MP3s automatically (GitHub Actions)

Workflow: `.github/workflows/california-morning-radio.yml`. Run it manually from **Actions → California Morning Weather Radio → Run workflow** to test your account's runner availability. If GitHub Actions fails before checkout (no runner or no steps), check Actions settings, runner availability, and billing/minutes.

It fetches Open-Meteo weather in Fahrenheit and refuses stale or missing observations. It uses [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) voice synthesis (American English female `af_heart`) and a custom quiet ambient instrumental backing bed.

Generated outputs:
- `site/audio/los-angeles-YYYY-MM-DD.mp3`
- `site/audio/san-francisco-YYYY-MM-DD.mp3`
- `site/data.json`

These are committed to the repo to trigger a fresh Vercel deployment. No laptop needs to be running.

### Run locally, if desired

Install Python 3.11+, ffmpeg, espeak-ng and `pip install -r requirements.txt`:

```bash
python -m radio.broadcast --site site
python -m unittest discover -s tests -v
```

## Limitations

- Live speech uses the **third-party TTS.ai anonymous free tier**, currently documented at 5,000 input characters per day per IP, 500 characters per request, and 10 requests/minute. The service can queue, fail, throttle, or change its limits; use the Cancel button if needed. Two short city reports generally fit this allowance, but unlimited use is not guaranteed.
- GitHub scheduled jobs can be delayed and may require account Actions permissions. A timed cron is not a real-time delivery guarantee.
- No push notifications are configured: visit the site and choose Generate to listen.
- The separate GitHub Actions 8 AM daily MP3 workflow still uses CPU Kokoro on its cloud runner and has **not been verified to run successfully**; live on-demand cloud voice is the working fast option.
- Weather API usage must comply with [Open-Meteo's free noncommercial terms](https://open-meteo.com/en/terms).

## Licenses

Kokoro-82M: Apache 2.0. Hosted text-to-speech: TTS.ai (subject to its usage terms and free-tier limits). Live forecasts: Open-Meteo (attribution required). Music: original programmatically generated synth/piano in the browser.

## Time-aware and AI-written scripts

The site checks fresh weather **whenever you press Generate**, not only when the page opens. It uses the California-local clock (America/Los_Angeles), so openings and transitions fit morning, afternoon, evening or late night. The audio player labels when an edition was created and includes a Generate an updated edition button. An old recording does not silently change when you replay it.

### Optional free-tier Gemini AI writing

Without a key the site already varies its time-aware scripts and uses verified Open-Meteo facts. For more original editorial writing, Gemini 3.8 Flash is available:

1. Create a key at https://aistudio.google.com/api-keys if your region/account is eligible.
2. Open https://vercel.com/ayoubs-projects-d793d9ee/california-radio-independent → Settings → Environment Variables.
3. Add the sensitive Production environment variable `GEMINI_API_KEY` with your new API key.
4. Redeploy the Production website, then click Generate again.

**Never paste the API key into GitHub, browser JavaScript, or public messages.** The secret stays in Vercel's server-side environment and is read by `site/api/radio-script.js`.

The optional LLM now writes the **full radio narration structure** as a fresh, varied monologue using 5 strict placeholders (greeting, current conditions, today's forecast, tomorrow's forecast, closing). Real temperatures and weather statements are inserted after generation from verified Open-Meteo readings. The template is rejected if it repeats/misses placeholders, invents factual weather assertions or exceeds permitted length. If Gemini fails, is over quota, or is not configured, the site falls back to varied time-aware scripts. The radio identifies AI-written editions in its player.

The API route is public and could consume the account's free Gemini quota if abused. Gemini free-tier quotas and availability vary by region and account; free-tier usage may be used by Google to improve their products. Only city/weather/time information is sent to Gemini, not personal conversation data.

## Cinematic interface

The Vite frontend stays dependency-light and uses three focused modules:

- `weather.js`: current observations, complete WMO condition mapping, stale-data rejection, Pacific dates and sunrise/sunset themes.
- `player.js`: the shared audio console, media controls, seek/download, and a Web Audio analyser. The visualizer stays flat when paused, hidden, or reduced motion is requested.
- `script.js`: independent city loading, voice preferences, cancellable generation, scheduled MP3 discovery and accessible UI state.

The existing `neural-voice.js` cloud Kokoro and original audio mixing engine and `api/radio-script.js` protected Gemini endpoint are retained. No local model inference or client API keys are added. Playback requires an explicit Play press after generation, preserving mobile autoplay rules.

The supplied coastal emblem is used for the brand. A simplified SVG favicon and 16/32 px PNG fallbacks retain the sun/ocean/radio motif at small sizes. Original AI-generated California landscape artwork is optimized as WebP. It is an artistic montage, not a live camera view; weather effects use verified city observations only. `public/og-image.png` is the sharing card.

### Frontend checks

```sh
cd site
npm ci
npm test
npm run build
npm run dev
```

The Node tests cover weather freshness, missing data, WMO effects, Pacific DST boundaries, solar themes, Gemini fact slots, fallback writing, cancellation, and endpoint request validation. The original Python tests remain available from the repository root. The local Vite server does not emulate the protected serverless endpoint; Gemini falls back locally. Verify AI writing against the deployed `/api/radio-script` endpoint.
