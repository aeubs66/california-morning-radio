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
