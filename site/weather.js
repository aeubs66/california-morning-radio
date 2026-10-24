export const LOCATIONS = [
  {
    city: "Los Angeles",
    slug: "los-angeles",
    lat: 34.0522,
    lon: -118.2437,
    region: "THE SOUTHERN CALIFORNIA EDITION",
  },
  {
    city: "San Francisco",
    slug: "san-francisco",
    lat: 37.7749,
    lon: -122.4194,
    region: "THE CITY BY THE BAY EDITION",
  },
];
export const SKY = {
  0: "Clear skies",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Steady drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Rain showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};
export function weatherKind(code) {
  if (code == null) return "neutral";
  if ([95, 96, 99].includes(code)) return "storm";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([2, 3].includes(code)) return "cloudy";
  return [0, 1].includes(code) ? "clear" : "neutral";
}
export function pacificDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
const number = (v) => {
  if (v == null || !Number.isFinite(Number(v)))
    throw Error("Missing verified weather value");
  return Math.round(Number(v));
};
export function parseWeather(data, city, now = new Date()) {
  const today = pacificDate(now),
    next = new Date(today + "T12:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  const i = data.daily?.time?.indexOf(today),
    j = data.daily?.time?.indexOf(next.toISOString().slice(0, 10));
  if (!(i >= 0 && j >= 0)) throw Error("Forecast dates are unavailable");
  // Unix timestamps avoid ambiguous local times at daylight saving transitions.
  if (
    !Number.isFinite(data.current?.time) ||
    Math.abs(now.getTime() / 1000 - data.current.time) > 5400
  )
    throw Error("Weather observation is stale");
  const code = number(data.current.weather_code),
    desc = (c) => SKY[c] || "Conditions unavailable";
  return {
    ...city,
    date: today,
    current_code: code,
    current_temp: number(data.current.temperature_2m),
    current_desc: desc(code),
    feels: number(data.current.apparent_temperature),
    humidity: number(data.current.relative_humidity_2m),
    wind: number(data.current.wind_speed_10m),
    today_high: number(data.daily.temperature_2m_max[i]),
    today_low: number(data.daily.temperature_2m_min[i]),
    today_desc: desc(data.daily.weather_code[i]),
    tomorrow_high: number(data.daily.temperature_2m_max[j]),
    tomorrow_low: number(data.daily.temperature_2m_min[j]),
    tomorrow_desc: desc(data.daily.weather_code[j]),
    rain: data.daily.precipitation_probability_max?.[i] ?? null,
    sunrise: data.daily.sunrise?.[i],
    sunset: data.daily.sunset?.[i],
    observed: data.current.time,
  };
}
export async function liveWeather(city, signal) {
  const p = new URLSearchParams({
    latitude: city.lat,
    longitude: city.lon,
    timezone: "America/Los_Angeles",
    timeformat: "unixtime",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    forecast_days: "3",
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
    daily:
      "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset",
  });
  const response = await fetch("https://api.open-meteo.com/v1/forecast?" + p, {
    cache: "no-store",
    signal: signal || AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error("Weather provider HTTP " + response.status);
  const data = await response.json();
  // timeformat=unixtime also returns daily dates as epochs; normalize in Pacific time.
  if (data.daily?.time)
    data.daily.time = data.daily.time.map((t) =>
      typeof t === "number" ? pacificDate(new Date(t * 1000)) : t,
    );
  return parseWeather(data, city);
}
export function solarPhase(now, weather) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  if (weather?.sunrise && weather?.sunset) {
    const t = now.getTime() / 1000,
      rise = weather.sunrise,
      set = weather.sunset;
    if (t < rise - 2700 || t > set + 2700) return "night";
    if (t < rise + 4500) return "dawn";
    if (t > set - 4500) return "evening";
    return "day";
  }
  return hour < 5 || hour >= 21
    ? "night"
    : hour < 9
      ? "dawn"
      : hour >= 17
        ? "evening"
        : "day";
}
