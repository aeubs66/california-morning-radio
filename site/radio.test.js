import test from "node:test";
import assert from "node:assert/strict";
import {
  parseWeather,
  weatherKind,
  pacificDate,
  solarPhase,
} from "./weather.js";
import {
  pacificContext,
  composeGeminiScript,
  validateGeminiTemplate,
  createBroadcast,
} from "./broadcast-script.js";
import handler from "./api/radio-script.js";
const now = new Date("2026-10-24T19:00:00Z");
const fixture = () => ({
  current: {
    time: now.getTime() / 1000,
    temperature_2m: 72.4,
    apparent_temperature: 71,
    relative_humidity_2m: 45,
    wind_speed_10m: 5,
    weather_code: 0,
  },
  daily: {
    time: ["2026-10-24", "2026-10-25"],
    temperature_2m_max: [77, 75],
    temperature_2m_min: [56, 53],
    weather_code: [0, 2],
    precipitation_probability_max: [0, 10],
    sunrise: [1792850742, 1792937142],
    sunset: [1792890479, 1792976879],
  },
});
const city = { city: "Los Angeles", slug: "los-angeles" };
const template =
  "[GREETING] Take a breath and settle in with us for a little while. [CURRENT] Here is your moment to pause. [TODAY] [TOMORROW] [CLOSING] Carry a little calm into the hours ahead.";
test("weather facts retain verified current and tomorrow values", () => {
  const r = parseWeather(fixture(), city, now);
  assert.equal(r.current_temp, 72);
  assert.equal(r.tomorrow_high, 75);
  assert.equal(r.rain, 0);
});
test("missing temperatures and stale observations fail closed", () => {
  const missing = fixture();
  missing.current.temperature_2m = null;
  assert.throws(() => parseWeather(missing, city, now));
  const stale = fixture();
  stale.current.time -= 7200;
  assert.throws(() => parseWeather(stale, city, now), /stale/);
});
test("missing forecast dates fail closed", () => {
  const f = fixture();
  f.daily.time = ["2020-01-01"];
  assert.throws(() => parseWeather(f, city, now));
});
test("all weather effects correspond to WMO conditions", () => {
  assert.equal(weatherKind(null), "neutral");
  assert.equal(weatherKind(0), "clear");
  assert.equal(weatherKind(3), "cloudy");
  assert.equal(weatherKind(45), "fog");
  assert.equal(weatherKind(61), "rain");
  assert.equal(weatherKind(95), "storm");
  assert.equal(weatherKind(71), "snow");
  assert.equal(weatherKind(123), "neutral");
});
test("Pacific date, DST spring gap and autumn repeated hour", () => {
  assert.equal(pacificDate(new Date("2026-01-01T03:00Z")), "2025-12-31");
  assert.equal(pacificContext(new Date("2026-03-08T09:30Z")).hour, 1);
  assert.equal(pacificContext(new Date("2026-03-08T10:30Z")).hour, 3);
  assert.equal(pacificContext(new Date("2026-11-01T08:30Z")).hour, 1);
  assert.equal(pacificContext(new Date("2026-11-01T09:30Z")).hour, 1);
});
test("solar theme follows city sunrise and sunset", () => {
  const r = parseWeather(fixture(), city, now);
  assert.equal(solarPhase(new Date((r.sunrise - 5000) * 1000), r), "night");
  assert.equal(solarPhase(new Date(r.sunrise * 1000), r), "dawn");
  assert.equal(solarPhase(now, r), "day");
  assert.equal(solarPhase(new Date(r.sunset * 1000), r), "evening");
});
test("Gemini templates reject fabricated numbers, weather claims and duplicate slots", () => {
  assert.ok(validateGeminiTemplate(template));
  assert.ok(
    !validateGeminiTemplate(template.replace("Take a breath", "Expect rain")),
  );
  assert.ok(!validateGeminiTemplate(template + " 99 degrees"));
  assert.ok(!validateGeminiTemplate(template + " [CURRENT]"));
});
test("AI prose uses only application supplied fact slots", () => {
  const r = parseWeather(fixture(), city, now),
    script = composeGeminiScript(r, pacificContext(now), template);
  assert.ok(script.includes("72 degrees"));
  assert.ok(script.includes("high near 75"));
  assert.ok(!script.includes("[CURRENT]"));
});
test("Gemini failure produces a time aware grounded fallback", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false });
  try {
    const r = parseWeather(fixture(), city, now),
      b = await createBroadcast(r, pacificContext(now), 1);
    assert.equal(b.mode, "time-aware");
    assert.ok(b.script.includes("72 degrees"));
  } finally {
    globalThis.fetch = original;
  }
});
test("cancellation is not swallowed by Gemini fallback", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new DOMException("Canceled", "AbortError");
  };
  try {
    await assert.rejects(() => createBroadcast({}, pacificContext(now), 1), {
      name: "AbortError",
    });
  } finally {
    globalThis.fetch = original;
  }
});
const response = () => ({
  headers: {},
  setHeader(k, v) {
    this.headers[k] = v;
  },
  status(s) {
    this.code = s;
    return this;
  },
  json(b) {
    this.body = b;
    return this;
  },
});
test("server rejects cross-origin and invalid method without disclosing secrets", async () => {
  let res = response();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.code, 405);
  res = response();
  await handler(
    {
      method: "POST",
      headers: { host: "radio.example", origin: "https://evil.example" },
      body: {},
    },
    res,
  );
  assert.equal(res.code, 403);
});
