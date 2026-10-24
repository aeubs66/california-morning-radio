"""Produce two weather-grounded California morning radio broadcasts.

Weather: Open-Meteo (CC BY 4.0, noncommercial free tier).
Voice: Kokoro-82M (Apache-2.0).  No API keys or subscription required.
Music: Procedural ambient synth/piano, generated here, reusable at no cost.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import shutil
import subprocess
import tempfile
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import soundfile as sf

ZONE = ZoneInfo("America/Los_Angeles")
RATE = 24000
CITY_COORDS = {
    "los-angeles": ("Los Angeles", 34.0522, -118.2437),
    "san-francisco": ("San Francisco", 37.7749, -122.4194),
}
WEATHER_CODES = {
    0: "clear skies", 1: "mostly clear skies", 2: "partly cloudy skies", 3: "overcast skies",
    45: "fog", 48: "patchy freezing fog",
    51: "light drizzle", 53: "drizzle", 55: "steady drizzle", 56: "freezing drizzle", 57: "freezing drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain",
    71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
    80: "isolated rain showers", 81: "rain showers", 82: "heavy rain showers",
    85: "snow showers", 86: "heavy snow showers", 95: "thunderstorms", 96: "thunderstorms", 99: "thunderstorms",
}

@dataclass(frozen=True)
class Report:
    city: str
    slug: str
    local_date: str
    current_temp: int
    current_desc: str
    today_high: int
    today_low: int
    today_desc: str
    tomorrow_high: int
    tomorrow_low: int
    tomorrow_desc: str
    today_rain_chance: int | None
    current_wind: int | None


def fetch_weather(slug: str, today: dt.date) -> Report:
    name, latitude, longitude = CITY_COORDS[slug]
    params = {
        "latitude": latitude, "longitude": longitude,
        "timezone": "America/Los_Angeles", "forecast_days": 3,
        "temperature_unit": "fahrenheit", "wind_speed_unit": "mph",
        "current": "temperature_2m,weather_code,wind_speed_10m",
        "daily": "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max",
    }
    url = "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "CaliforniaMorningRadio/1.0 (noncommercial personal weather radio)"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.load(resp)
    if payload.get("error"):
        raise RuntimeError(f"Weather provider error for {name}: {payload.get('reason', 'unknown')}")
    d, c = payload["daily"], payload["current"]
    days = d["time"]
    stamp = today.isoformat()
    if stamp not in days or (today + dt.timedelta(days=1)).isoformat() not in days:
        raise RuntimeError(f"Out-of-date forecast for {name}; missing {stamp} or tomorrow")
    # Do not silently turn a stale observation into a supposedly live temperature.
    observed_at = dt.datetime.fromisoformat(c["time"]).replace(tzinfo=ZONE)
    now = dt.datetime.now(ZONE)
    if abs((now - observed_at).total_seconds()) > 5 * 3600:
        raise RuntimeError(f"Weather observation too old for {name}: {c['time']}")
    i = days.index(stamp)
    j = days.index((today + dt.timedelta(days=1)).isoformat())
    def num(v):
        if v is None or (isinstance(v, float) and not math.isfinite(v)):
            raise RuntimeError(f"Missing required weather data for {name}")
        return int(round(v))
    def desc(code):
        if code is None: raise RuntimeError(f"Missing weather code for {name}")
        return WEATHER_CODES.get(int(code), "variable weather conditions")
    chance = d.get("precipitation_probability_max", [None] * len(days))[i]
    wind = c.get("wind_speed_10m")
    return Report(
        city=name, slug=slug, local_date=stamp,
        current_temp=num(c["temperature_2m"]), current_desc=desc(c["weather_code"]),
        today_high=num(d["temperature_2m_max"][i]),
        today_low=num(d["temperature_2m_min"][i]), today_desc=desc(d["weather_code"][i]),
        tomorrow_high=num(d["temperature_2m_max"][j]),
        tomorrow_low=num(d["temperature_2m_min"][j]), tomorrow_desc=desc(d["weather_code"][j]),
        today_rain_chance=num(chance) if chance is not None else None,
        current_wind=num(wind) if wind is not None else None,
    )


def script_for(r: Report) -> str:
    local = dt.date.fromisoformat(r.local_date)
    day = local.strftime("%A, %B %d").replace(" 0", " ")
    windy = (
        f"Winds are around {r.current_wind} miles per hour right now. "
        if r.current_wind is not None and r.current_wind >= 12 else ""
    )
    rainy = (
        f"The chance of precipitation today is about {r.today_rain_chance} percent. "
        if r.today_rain_chance is not None and r.today_rain_chance >= 15 else ""
    )
    greeting = (
        "Let the city wake up slowly, and enjoy a peaceful start to your day."
        if r.slug == "los-angeles" else
        "From the waterfront to the quiet hills, take a little time for yourself today."
    )
    return (
        f"Good morning, {r.city}. It's {day}, and welcome to your little moment of California calm. "
        f"At the latest weather check, it's {r.current_temp} degrees with {r.current_desc}. "
        f"Today brings {r.today_desc}, with a high around {r.today_high} degrees and a low near {r.today_low} tonight. "
        f"{windy}{rainy}"
        f"Looking ahead to tomorrow, expect {r.tomorrow_desc}, reaching about {r.tomorrow_high}, "
        f"and cooling toward {r.tomorrow_low} by night. "
        f"{greeting} This is Good Morning, {r.city}."
    )


def speech_kokoro(text: str, pipeline) -> np.ndarray:
    chunks = []
    for _, _, audio in pipeline(text, voice="af_heart", speed=0.95):
        if audio is None: continue
        part = np.asarray(audio, dtype=np.float32).reshape(-1)
        if len(part): chunks.append(part)
    if not chunks:
        raise RuntimeError("Kokoro returned no audible speech")
    return np.concatenate(chunks)


def make_music(duration_sec: float, seed: int = 42) -> np.ndarray:
    """An original gentle synth and felt-piano-inspired underscore; no copyrighted recording."""
    n = max(1, int(duration_sec * RATE))
    mix = np.zeros(n, dtype=np.float32)
    rng = np.random.default_rng(seed)
    t = np.arange(n, dtype=np.float32) / RATE
    # Slow suspended chords, in A major / F-sharp minor, no percussion.
    chords = [(220.0, 261.63, 329.63), (174.61, 220.0, 261.63),
              (146.83, 220.0, 293.66), (164.81, 246.94, 329.63)]
    section = 13.0
    for k in range(int(math.ceil(duration_sec / section))):
        start = k * section
        i0, i1 = int(start * RATE), min(n, int((start + section + 1.0) * RATE))
        if i0 >= n: break
        tx = (np.arange(i1 - i0, dtype=np.float32) / RATE)
        envelope = np.minimum(1.0, tx / 3.5) * np.minimum(1.0, np.maximum(0.0, section + 1.0 - tx) / 3.5)
        pad = np.zeros_like(tx)
        for freq in chords[k % len(chords)]:
            # Nearly-sine padded synth sound, detuned for subtle warmth.
            pad += np.sin(2 * np.pi * freq * tx) + 0.12 * np.sin(2 * np.pi * (freq * 1.003) * tx)
        mix[i0:i1] += 0.010 * (pad / 3.0) * envelope
    # Sparse delicate piano bell notes, rounded attack and long decay.
    sequence = [440.0, 392.0, 329.63, 293.66, 261.63, 329.63, 440.0, 493.88]
    for i, start in enumerate(np.arange(1.1, duration_sec - 2, 4.8)):
        p0 = int(start * RATE)
        plen = min(n - p0, int(3.8 * RATE))
        if plen <= 0: continue
        tt = np.arange(plen, dtype=np.float32) / RATE
        attack = 1.0 - np.exp(-tt * 35)
        decay = np.exp(-tt * 1.65)
        frequency = sequence[i % len(sequence)]
        piano = (np.sin(2 * np.pi * frequency * tt) + 0.2 * np.sin(2 * np.pi * 2 * frequency * tt))
        mix[p0:p0+plen] += 0.012 * attack * decay * piano
    # Tiny air/tape noise, well below the narration.
    mix += rng.normal(0, 0.00022, n).astype(np.float32)
    # Fade in first two seconds and away over the last three seconds.
    intro, outro = min(n, int(2.1 * RATE)), min(n, int(3.1 * RATE))
    mix[:intro] *= np.linspace(0, 1, intro, dtype=np.float32)
    mix[-outro:] *= np.linspace(1, 0, outro, dtype=np.float32)
    return mix


def mix_audio(speech: np.ndarray, seed: int) -> np.ndarray:
    intro, outro = 2.3, 3.2
    length = int((intro + len(speech) / RATE + outro) * RATE)
    music = make_music(length / RATE, seed=seed)
    voice = np.zeros(length, dtype=np.float32)
    pos = int(intro * RATE)
    # Moderate normalized broadcast speech level, music stays more than 15 dB under.
    peak = float(np.max(np.abs(speech)))
    if peak < 1e-5:
        raise RuntimeError("Speech waveform is silent")
    normalized = np.asarray(speech, dtype=np.float32) * min(1.5, 0.68 / peak)
    fade = min(len(normalized)//2, int(0.08*RATE))
    if fade:
        normalized[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)
        normalized[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    voice[pos:pos+len(normalized)] = normalized
    return np.clip(voice + music, -0.98, 0.98)


def encode_mp3(wave: np.ndarray, path: Path) -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not found; cannot export MP3")
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        sf.write(f.name, wave, RATE, subtype="PCM_16")
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                        "-i", f.name, "-codec:a", "libmp3lame", "-b:a", "128k", str(path)], check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", default="site", help="Output site path")
    parser.add_argument("--dry-run", action="store_true", help="Fetch weather, build metadata and scripts, skip TTS")
    args = parser.parse_args()
    now = dt.datetime.now(ZONE)
    site = Path(args.site)
    reports = [fetch_weather(slug, now.date()) for slug in CITY_COORDS]
    # Fail the entire batch on missing real weather BEFORE publishing anything.
    scripts = {r.slug: script_for(r) for r in reports}
    if args.dry_run:
        for r in reports: print(r.city, scripts[r.slug]); print()
        return
    from kokoro import KPipeline
    pipeline = KPipeline(lang_code="a", device="cpu")
    audio_dir = site / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    for stale in audio_dir.glob("*.mp3"):
        stale.unlink()  # Keep the site bounded to two current reports.
    cards = []
    for i, r in enumerate(reports):
        path = audio_dir / f"{r.slug}-{r.local_date}.mp3"
        voice = speech_kokoro(scripts[r.slug], pipeline)
        mixed = mix_audio(voice, seed=211 + i)
        encode_mp3(mixed, path)
        duration = round(len(mixed) / RATE, 1)
        if not 32 <= duration <= 75:
            raise RuntimeError(f"Unexpected broadcast length for {r.city}: {duration}s")
        cards.append({
            "city": r.city, "slug": r.slug,
            "current_temp": r.current_temp, "current_desc": r.current_desc,
            "today_high": r.today_high, "today_low": r.today_low,
            "today_desc": r.today_desc, "tomorrow_high": r.tomorrow_high,
            "tomorrow_low": r.tomorrow_low, "tomorrow_desc": r.tomorrow_desc,
            "audio": f"audio/{path.name}", "duration": duration,
        })
    data = {
        "date": now.date().isoformat(),
        "generated_at": now.isoformat(timespec="minutes"),
        "zone": "America/Los_Angeles", "reports": cards,
        "weather_source": "Open-Meteo (CC BY 4.0)",
        "voice": "Kokoro-82M / af_heart",
    }
    site.mkdir(parents=True, exist_ok=True)
    tmp = site / "data.json.tmp"
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(site / "data.json")
    print(f"Generated {len(cards)} playable broadcasts for {data['date']} PST/PDT.")

if __name__ == "__main__":
    main()
