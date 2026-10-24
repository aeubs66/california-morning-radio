# California Morning Radio ☀️ 📻

A peaceful California weather radio show for **Los Angeles** and **San Francisco**, hosted online for free.

- **Live radio:** Fresh Open-Meteo weather at the time you play, spoken by free [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) American female neural voices right in your browser, with a subtle original synth/piano soundtrack. Choose Nicole, Heart or Bella and download a WAV.
- **Daily recorded editions:** A GitHub Actions job is configured for **8:00 AM America/Los_Angeles** and can generate two MP3s with Kokoro on a cloud runner. Availability depends on GitHub Actions runner access and limits; this job is not guaranteed to start at the exact minute.
- **Privacy:** No ElevenLabs API key or paid speech credits. The browser downloads model weights as needed. The weather scripts are not sent to a paid voice API.
- **Source:** This is a standalone GitHub repository, separate from `aeubs66/code`.

## Deploy

The listening site's static files are in `site/`. On Vercel, create a **new project connected to this repository**, set Root Directory to `site`, Framework Preset to Other, and use the default static output. Production deployments serve `site/index.html` at the site root.

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

- First browser playback downloads a relatively large free voice model, which may be slow on mobile networks or fail on very low-memory devices.
- GitHub scheduled jobs can be delayed and may require account Actions permissions. A timed cron is not a real-time delivery guarantee.
- No push notifications are configured: visit the site to listen.
- Weather API usage must comply with [Open-Meteo's free noncommercial terms](https://open-meteo.com/en/terms).

## Licenses

Kokoro-82M: Apache 2.0. Live forecasts: Open-Meteo (attribution required). Music: procedurally generated original notes and pads in this project.
