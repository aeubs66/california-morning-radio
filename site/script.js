import "./neural-voice.js";
import { pacificContext, createBroadcast } from "./broadcast-script.js";
import { LOCATIONS, liveWeather, weatherKind, solarPhase } from "./weather.js";
import { createPlayer } from "./player.js";
const $ = (id) => document.getElementById(id);
const reports = new Map(),
  recordings = new Map();
let selected = LOCATIONS[0].slug,
  generation = null,
  nonce = 0;
const voices = window.CaliforniaNeuralVoice.voices;
let voice = "af_nicole";
try {
  const saved = localStorage.getItem("california-radio-voice");
  if (voices[saved]) voice = saved;
} catch {}
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const status = (text) => ($("status-message").textContent = text);
const location = () => LOCATIONS.find((c) => c.slug === selected);
const player = createPlayer(
  () => toggleCity(selected),
  () => updateButtons(),
);
function weatherIcon(code) {
  const k = weatherKind(code),
    night = document.body.dataset.phase === "night";
  const sun =
    '<circle cx="24" cy="24" r="9"/><path d="M24 3v6m0 30v6M3 24h6m30 0h6M9 9l4 4m22 22 4 4M9 39l4-4m22-22 4-4"/>';
  const cloud =
    '<path d="M12 32a9 9 0 0 1 0-18 12 12 0 0 1 23-1 9 9 0 0 1 1 19z"/>';
  const content =
    k === "clear"
      ? night
        ? '<path d="M35 33A17 17 0 0 1 17 7a18 18 0 1 0 18 26Z"/>'
        : sun
      : k === "neutral"
        ? '<circle cx="24" cy="24" r="14"/><path d="M18 20a6 6 0 0 1 12 0c0 4-6 4-6 8m0 6h.01"/>'
        : cloud +
          (k === "rain" || k === "storm"
            ? '<path d="m16 38-2 5m12-5-2 5m12-5-2 5"/>'
            : k === "fog"
              ? '<path d="M8 38h32M12 43h24"/>'
              : k === "snow"
                ? '<path d="M15 39h.1m10 3h.1m10-3h.1"/>'
                : "");
  return '<svg viewBox="0 0 48 48" aria-hidden="true">' + content + "</svg>";
}
function renderCard(city) {
  const old = $(city.slug),
    r = reports.get(city.slug),
    a = el(
      "article",
      "weather-card " + (city.slug === "san-francisco" ? "sf" : "la"),
    );
  a.id = city.slug;
  a.classList.toggle("selected", selected === city.slug);
  const over = el("div", "card-overline");
  over.append(
    el("span", "", city.region),
    el("span", "", r ? "LIVE WEATHER" : "WEATHER CHECK"),
  );
  a.append(over);
  const select = el("button", "city-select");
  select.type = "button";
  select.setAttribute("aria-pressed", String(selected === city.slug));
  select.setAttribute("aria-label", "Select " + city.city + " atmosphere");
  select.append(el("h3", "city-name", city.city));
  select.onclick = () => selectCity(city.slug);
  a.append(select);
  if (r) {
    a.dataset.weather = weatherKind(r.current_code);
    a.append(el("div", "card-atmosphere"));
    const main = el("div", "weather-main"),
      group = el("div", "temp-group"),
      icon = el("div", "weather-symbol");
    icon.innerHTML = weatherIcon(r.current_code);
    const reading = el("div"),
      temperature = el("div", "temperature", r.current_temp + "°");
    temperature.append(el("sup", "", "F"));
    reading.append(
      temperature,
      el("p", "feels", "Feels like " + r.feels + "°"),
    );
    group.append(icon, reading);
    const metrics = el("div", "metric-stack"),
      wind = el("div", "metric", "Wind"),
      humidity = el("div", "metric", "Humidity");
    wind.append(el("span", "", r.wind + " mph"));
    humidity.append(el("span", "", r.humidity + "%"));
    metrics.append(wind, humidity);
    main.append(group, metrics);
    a.append(el("p", "sky", r.current_desc), main);
    const forecast = el("div", "forecast");
    for (const [label, value] of [
      ["HIGH", r.today_high + "°"],
      ["LOW", r.today_low + "°"],
      ["TOMORROW", r.tomorrow_high + "° / " + r.tomorrow_low + "°"],
    ]) {
      const part = el("span", "", label);
      part.append(el("strong", "", value));
      forecast.append(part);
    }
    a.append(
      forecast,
      el("p", "tomorrow-note", "Tomorrow · " + r.tomorrow_desc),
    );
    const controls = el("div", "card-controls"),
      button = el("button", "live-play");
    button.type = "button";
    button.dataset.slug = city.slug;
    button.onclick = () => toggleCity(city.slug);
    controls.append(button);
    const label = el("label", "voice-label", "RADIO VOICE"),
      choice = el("select", "voice-choice");
    choice.setAttribute("aria-label", "Radio voice for " + city.city);
    for (const [id, title] of Object.entries(voices)) {
      const option = el("option", "", title.split(" · ")[0]);
      option.value = id;
      choice.append(option);
    }
    choice.value = voice;
    choice.onchange = () => changeVoice(choice.value);
    label.append(choice);
    controls.append(label);
    a.append(
      controls,
      el(
        "p",
        "card-status",
        recordings.has(city.slug)
          ? "Your recording is ready."
          : "Fresh weather. A warm voice. A little music.",
      ),
    );
  } else {
    a.append(
      el(
        "p",
        "loading-text",
        reports.has(city.slug)
          ? "Weather is taking a little longer."
          : "Finding the latest local weather…",
      ),
    );
    if (reports.has(city.slug)) {
      a.append(
        el("p", "card-status", "Current conditions could not be verified."),
      );
      const retry = el("button", "retry", "↻ Check again");
      retry.onclick = () => refreshCity(city);
      a.append(retry);
    }
  }
  old ? old.replaceWith(a) : $("city-cards").append(a);
  updateButtons();
}
function updateButtons() {
  document.querySelectorAll(".live-play").forEach((b) => {
    const slug = b.dataset.slug,
      busy = generation?.slug === slug,
      record = recordings.get(slug),
      active = player.record === record && record && !player.audio.paused;
    b.replaceChildren(
      el("span", "play-orb", busy ? "■" : active ? "Ⅱ" : "▶"),
      el(
        "span",
        "",
        busy
          ? "CANCEL GENERATION"
          : record
            ? (active ? "PAUSE" : "PLAY") +
              " " +
              LOCATIONS.find((c) => c.slug === slug).city.toUpperCase()
            : "TUNE IN · " +
              LOCATIONS.find((c) => c.slug === slug).city.toUpperCase(),
      ),
      el("span", "", "›"),
    );
    b.setAttribute(
      "aria-label",
      busy
        ? "Cancel generation for " + location().city
        : (record ? "Play or pause " : "Generate broadcast for ") +
            LOCATIONS.find((c) => c.slug === slug).city,
    );
    b.setAttribute("aria-pressed", String(!!active || busy));
  });
}
function updateAtmosphere() {
  const r = reports.get(selected),
    now = new Date();
  const fresh =
    r && Math.abs(now.getTime() / 1000 - r.observed) <= 5400 ? r : null;
  document.body.dataset.phase = solarPhase(now, fresh);
  document.body.dataset.weather = weatherKind(fresh?.current_code);
  document.body.dataset.city = selected;
  document.querySelectorAll(".weather-card").forEach((card) => {
    const r = reports.get(card.id),
      icon = card.querySelector(".weather-symbol");
    if (r && icon) icon.innerHTML = weatherIcon(r.current_code);
  });
  document.documentElement.style.setProperty(
    "--wind-duration",
    Math.max(20, 90 - (fresh?.wind || 0) * 2) + "s",
  );
  const phase = document.body.dataset.phase;
  $("atmospheric-subtitle").textContent = {
    dawn: "Somewhere in California, the day begins.",
    day: "Real weather. A familiar voice. A little California calm.",
    evening: "Let the Golden State slow your evening down.",
    night: "A quiet frequency, under the California sky.",
  }[phase];
  $("clock").textContent = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(now);
  $("clock").dateTime = now.toISOString();
  $("today-date").textContent = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "long",
    day: "numeric",
  }).format(now);
  $("year").textContent = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
  }).format(now);
  const details = $("detail-content");
  details.replaceChildren();
  if (!fresh) {
    details.textContent =
      "Current conditions unavailable. A neutral atmosphere, until we can check again.";
    return;
  }
  const t = (epoch) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(epoch * 1000));
  for (const [label, value] of [
    ["SELECTED CITY", fresh.city],
    ["SUNRISE / SUNSET", t(fresh.sunrise) + " / " + t(fresh.sunset)],
    [
      "PRECIPITATION",
      fresh.rain == null ? "Unavailable" : fresh.rain + "% today",
    ],
    ["OBSERVED", t(fresh.observed) + " Pacific"],
  ]) {
    const d = el("div");
    d.append(el("span", "", label), document.createTextNode(value));
    details.append(d);
  }
}
function selectCity(slug) {
  if (selected !== slug && generation) cancelGeneration();
  selected = slug;
  const record = recordings.get(slug);
  if (player.record !== record) player.load(record || null);
  if (!record) {
    $("player-title").textContent = location().city;
    $("player-meta").textContent =
      "Your next quiet moment is one broadcast away.";
  }
  document.querySelectorAll(".weather-card").forEach((a) => {
    a.classList.toggle("selected", a.id === slug);
    a.querySelector(".city-select")?.setAttribute(
      "aria-pressed",
      String(a.id === slug),
    );
  });
  updateAtmosphere();
  updateButtons();
}
function cancelGeneration() {
  if (!generation) return;
  const item = generation;
  generation = null;
  item.abort.abort();
  window.CaliforniaNeuralVoice.cancel();
  clearInterval(item.timer);
  player.generating(false);
  updateButtons();
  status("Generation canceled. Tune in again whenever you like.");
}
function clearRecordings() {
  player.load(null);
  for (const r of recordings.values())
    if (r.objectURL) URL.revokeObjectURL(r.url);
  recordings.clear();
}
function changeVoice(next) {
  cancelGeneration();
  clearRecordings();
  voice = next;
  try {
    localStorage.setItem("california-radio-voice", voice);
  } catch {}
  document.querySelectorAll(".voice-choice").forEach((c) => (c.value = voice));
  document
    .querySelectorAll(".card-status")
    .forEach(
      (c) => (c.textContent = "Fresh weather. A warm voice. A little music."),
    );
  selectCity(selected);
  updateButtons();
  status(
    voices[voice].split(" · ")[0] +
      " is ready. Generate a fresh edition to hear this voice.",
  );
}
async function toggleCity(slug) {
  if (generation?.slug === slug) {
    cancelGeneration();
    return;
  }
  selectCity(slug);
  if (player.record) {
    player.toggle();
    return;
  }
  await generate();
}
async function generate() {
  cancelGeneration();
  player.audio.pause();
  const city = location(),
    capturedVoice = voice,
    item = {
      slug: selected,
      abort: new AbortController(),
      message: "Checking fresh local weather…",
      started: Date.now(),
    };
  generation = item;
  player.generating(true);
  $("player-title").textContent = city.city;
  $("player-meta").textContent =
    "Weather → radio writing → cloud narration → original music";
  updateButtons();
  const progress = (text) => {
    if (generation === item) {
      item.message = text;
      status(text);
    }
  };
  item.timer = setInterval(() => {
    if (generation === item)
      status(
        item.message +
          " · " +
          Math.floor((Date.now() - item.started) / 1000) +
          "s",
      );
  }, 1000);
  progress(item.message);
  try {
    const fresh = await liveWeather(city, item.abort.signal);
    if (generation !== item) return;
    reports.set(city.slug, fresh);
    renderCard(city);
    updateAtmosphere();
    const context = pacificContext();
    progress("Writing your " + context.phase + " edition…");
    const broadcast = await createBroadcast(
      fresh,
      context,
      ++nonce,
      item.abort.signal,
    );
    if (generation !== item) return;
    const clip = await window.CaliforniaNeuralVoice.generate(
      broadcast.script,
      capturedVoice,
      progress,
    );
    if (generation !== item) return;
    const old = recordings.get(city.slug);
    if (old?.objectURL) URL.revokeObjectURL(old.url);
    const record = {
      url: URL.createObjectURL(clip.blob),
      objectURL: true,
      city: city.city,
      meta:
        context.phase +
        " edition · " +
        context.localTime +
        " Pacific · " +
        voices[capturedVoice].split(" · ")[0] +
        " · " +
        (broadcast.mode === "AI-written"
          ? "AI-personalized writing"
          : "Time-aware fallback writing"),
      filename: city.slug + "-" + fresh.date + "-" + capturedVoice + ".wav",
    };
    recordings.set(city.slug, record);
    player.load(record);
    status(
      "Your " +
        city.city +
        " edition is ready. Press Play for a little California.",
    );
    renderCard(city);
  } catch (error) {
    if (generation !== item) return;
    status(
      "Your edition could not be created: " +
        (error?.message || "Please try again") +
        ". You can retry when the service is available.",
    );
  } finally {
    if (generation === item) {
      generation = null;
      clearInterval(item.timer);
      player.generating(false);
      updateButtons();
    }
  }
}
async function refreshCity(city) {
  try {
    reports.set(city.slug, await liveWeather(city));
  } catch {
    reports.set(city.slug, null);
  }
  renderCard(city);
  updateAtmosphere();
}
$("cancel-generation").onclick = cancelGeneration;
$("update-edition").onclick = generate;
for (const city of LOCATIONS) renderCard(city);
updateAtmosphere();
Promise.allSettled(LOCATIONS.map(refreshCity)).then(async () => {
  status(
    "Choose your city and voice. Your weather radio edition is made fresh, just for you.",
  );
  // Retain the existing scheduled MP3 editions when the daily workflow supplies them.
  try {
    const response = await fetch("/data.json", { cache: "no-store" });
    if (!response.ok) return;
    const manifest = await response.json();
    for (const r of manifest.reports || []) {
      if (
        manifest.date !== reports.get(r.slug)?.date ||
        !/^audio\/[\w.-]+\.mp3$/.test(r.audio)
      )
        continue;
      if (recordings.has(r.slug) || generation || voice !== "af_nicole")
        continue;
      recordings.set(r.slug, {
        url: "/" + r.audio,
        city: LOCATIONS.find((c) => c.slug === r.slug)?.city,
        meta: "Scheduled morning edition · Heart · Recorded earlier today",
        filename: r.audio.split("/").pop(),
      });
      renderCard(LOCATIONS.find((c) => c.slug === r.slug));
    }
  } catch {}
});
setInterval(() => {
  updateAtmosphere();
}, 60000);
setInterval(() => {
  if (!document.hidden) LOCATIONS.forEach(refreshCity);
}, 600000);
document.addEventListener("visibilitychange", () => {
  document.body.classList.toggle("page-hidden", document.hidden);
  if (!document.hidden) {
    updateAtmosphere();
    LOCATIONS.forEach((c) => {
      const r = reports.get(c.slug);
      if (!r || Date.now() / 1000 - r.observed > 1200) refreshCity(c);
    });
  }
});
window.addEventListener("pagehide", (event) => {
  cancelGeneration();
  if (!event.persisted)
    for (const r of recordings.values())
      if (r.objectURL) URL.revokeObjectURL(r.url);
});
const observer = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("revealed");
        observer.unobserve(e.target);
      }
    }),
  { threshold: 0.15 },
);
document
  .querySelectorAll(".weather-strip,.signoff")
  .forEach((n) => observer.observe(n));
