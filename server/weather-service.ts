import { storage } from "./storage";
import { isAppActive } from "./activity-tracker";

// Weather source: weatherapi.com. Payloads are adapted server-side into the
// shape the dashboard and the weather-impact job consume, so only this file
// knows the provider. The home base writes through to the weather_cache DB row
// (the impact job aggregates from it); other dispatch-area cities are served
// from an in-memory cache with a 30-minute TTL.
const WEATHERAPI_KEY = process.env.WEATHERAPI_KEY || "bf49aa77a7794369be0143857262507";
const WEATHER_LAT = process.env.WEATHER_LAT || "33.2071";
const WEATHER_LON = process.env.WEATHER_LON || "-82.3915";

export interface WeatherLocation {
  slug: string;
  name: string;
  region: string;
  lat: string;
  lon: string;
  group: "Home Base" | "Augusta Area" | "Wrens Area";
}

// The dispatch service area: Augusta plus ~20 miles in every direction, and
// Wrens plus ~30 miles in every direction.
export const WEATHER_LOCATIONS: WeatherLocation[] = [
  { slug: "wrens", name: "Wrens", region: "GA", lat: WEATHER_LAT, lon: WEATHER_LON, group: "Home Base" },
  { slug: "augusta", name: "Augusta", region: "GA", lat: "33.4735", lon: "-82.0105", group: "Augusta Area" },
  { slug: "north-augusta", name: "North Augusta", region: "SC", lat: "33.5018", lon: "-81.9651", group: "Augusta Area" },
  { slug: "martinez", name: "Martinez", region: "GA", lat: "33.5124", lon: "-82.0776", group: "Augusta Area" },
  { slug: "evans", name: "Evans", region: "GA", lat: "33.5337", lon: "-82.1307", group: "Augusta Area" },
  { slug: "grovetown", name: "Grovetown", region: "GA", lat: "33.4501", lon: "-82.1982", group: "Augusta Area" },
  { slug: "harlem", name: "Harlem", region: "GA", lat: "33.4146", lon: "-82.3123", group: "Augusta Area" },
  { slug: "aiken", name: "Aiken", region: "SC", lat: "33.5604", lon: "-81.7196", group: "Augusta Area" },
  { slug: "thomson", name: "Thomson", region: "GA", lat: "33.4707", lon: "-82.5046", group: "Augusta Area" },
  { slug: "waynesboro", name: "Waynesboro", region: "GA", lat: "33.0899", lon: "-82.0157", group: "Wrens Area" },
  { slug: "louisville", name: "Louisville", region: "GA", lat: "33.0015", lon: "-82.4113", group: "Wrens Area" },
  { slug: "sandersville", name: "Sandersville", region: "GA", lat: "32.9815", lon: "-82.8102", group: "Wrens Area" },
];

type AdaptedPeriod = {
  name: string;
  isDaytime: boolean;
  temperature: number;
  shortForecast: string;
  startTime?: string;
  rainChance?: number;
};

type AdaptedCurrent = AdaptedPeriod & {
  feelslikeF: number;
  humidity: number;
  windMph: number;
  windDir: string;
  precipIn: number;
  uv: number;
};

type AdaptedWeather = {
  forecastJson: { properties: { periods: AdaptedPeriod[] }; current: AdaptedCurrent | null };
  hourlyJson: { properties: { periods: AdaptedPeriod[] } };
  alertsJson: { features: Array<{ properties: Record<string, string> }> };
};

/** Fetch from weatherapi.com and adapt into the NWS-like internal shape. */
async function fetchAndAdaptWeather(lat: string, lon: string): Promise<AdaptedWeather> {
  const q = `${lat},${lon}`;
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHERAPI_KEY}&q=${encodeURIComponent(q)}&days=7&aqi=no&alerts=yes`;
  const res = await fetch(url);
  const data: any = await res.json().catch(() => null);
  if (!res.ok || !data?.forecast?.forecastday?.length) {
    throw new Error(data?.error?.message || `WeatherAPI HTTP ${res.status}`);
  }

  const periods: AdaptedPeriod[] = [];
  data.forecast.forecastday.forEach((fd: any, idx: number) => {
    const name =
      idx === 0
        ? "Today"
        : new Date(`${fd.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
    const condition = fd.day?.condition?.text || "";
    const rainChance = Number(fd.day?.daily_chance_of_rain ?? 0);
    periods.push({
      name,
      isDaytime: true,
      temperature: Math.round(fd.day?.maxtemp_f ?? 0),
      shortForecast: condition,
      startTime: `${fd.date}T12:00:00`,
      rainChance,
    });
    periods.push({
      name: idx === 0 ? "Tonight" : `${name} Night`,
      isDaytime: false,
      temperature: Math.round(fd.day?.mintemp_f ?? 0),
      shortForecast: condition,
      startTime: `${fd.date}T20:00:00`,
      rainChance,
    });
  });

  const current: AdaptedCurrent | null = data.current
    ? {
        name: "Now",
        isDaytime: data.current.is_day === 1,
        temperature: Math.round(data.current.temp_f ?? 0),
        shortForecast: data.current.condition?.text || "",
        startTime: (data.current.last_updated || "").replace(" ", "T") || undefined,
        feelslikeF: Math.round(data.current.feelslike_f ?? data.current.temp_f ?? 0),
        humidity: Number(data.current.humidity ?? 0),
        windMph: Math.round(data.current.wind_mph ?? 0),
        windDir: data.current.wind_dir || "",
        precipIn: Number(data.current.precip_in ?? 0),
        uv: Number(data.current.uv ?? 0),
      }
    : null;

  const hourlyPeriods: AdaptedPeriod[] = data.forecast.forecastday.flatMap((fd: any) =>
    (fd.hour || []).map((h: any) => ({
      startTime: (h.time || "").replace(" ", "T"),
      temperature: Math.round(h.temp_f ?? 0),
      isDaytime: h.is_day === 1,
      shortForecast: h.condition?.text || "",
      name: "",
      rainChance: Number(h.chance_of_rain ?? 0),
    })),
  );

  const rawAlerts = Array.isArray(data.alerts?.alert) ? data.alerts.alert : [];
  const alertFeatures = rawAlerts.map((a: any) => ({
    properties: {
      headline: a.headline || a.event || "Weather alert",
      severity: a.severity || "",
      event: a.event || "",
      description: a.desc || "",
      expires: a.expires || "",
    },
  }));

  return {
    forecastJson: { properties: { periods }, current },
    hourlyJson: { properties: { periods: hourlyPeriods } },
    alertsJson: { features: alertFeatures },
  };
}

export async function refreshWeather(): Promise<{ success: boolean; error?: string }> {
  try {
    const adapted = await fetchAndAdaptWeather(WEATHER_LAT, WEATHER_LON);
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);

    await storage.upsertWeatherCache({
      id: 1,
      lat: WEATHER_LAT,
      lon: WEATHER_LON,
      forecastJson: adapted.forecastJson as any,
      hourlyJson: adapted.hourlyJson as any,
      alertsJson: adapted.alertsJson as any,
      expiresAt,
    });

    console.log(`[Weather] WeatherAPI cache refreshed for home base at ${new Date().toISOString()}`);
    return { success: true };
  } catch (error) {
    console.error("[Weather] Refresh failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

let weatherRefreshInterval: NodeJS.Timeout | null = null;

export function scheduleWeatherRefresh(): void {
  if (weatherRefreshInterval) {
    clearInterval(weatherRefreshInterval);
  }

  refreshWeather().catch(console.error);

  // Current conditions + forecast shift during the day — refresh hourly.
  weatherRefreshInterval = setInterval(() => {
    if (!isAppActive()) {
      console.log("[Weather] App idle, skipping refresh");
      return;
    }
    refreshWeather().catch(console.error);
  }, 60 * 60 * 1000);

  console.log("[Weather] Refresh scheduled (hourly, via weatherapi.com)");
}

export async function getWeatherData() {
  const cache = await storage.getWeatherCache();
  if (!cache) return null;

  // Transform to match frontend expectations
  return {
    lat: cache.lat,
    lon: cache.lon,
    forecast: cache.forecastJson,
    hourly: cache.hourlyJson,
    alerts: cache.alertsJson,
    fetchedAt: cache.fetchedAt?.toISOString(),
    stale: cache.expiresAt ? new Date() > cache.expiresAt : false,
  };
}

let refreshInFlight = false;

/** Self-healing read path: if the cache is missing or expired, kick off a
 *  background refresh so the next request serves fresh data — a stale
 *  forecast must never sit frozen on the dashboard indefinitely. */
export async function getWeatherDataSelfHealing() {
  const data = await getWeatherData();
  if ((!data || data.stale) && !refreshInFlight) {
    refreshInFlight = true;
    refreshWeather()
      .catch(console.error)
      .finally(() => {
        refreshInFlight = false;
      });
  }
  return data;
}

// ── Per-city weather for the dispatch service area ───────────────────────
const LOCATION_TTL_MS = 30 * 60 * 1000;
const locationCache = new Map<string, { payload: AdaptedWeather; fetchedAt: Date }>();

/** Weather for any roster city. Home base reads the DB cache (shared with the
 *  impact job); other cities hit an in-memory cache with a 30-minute TTL. */
export async function getWeatherForLocation(slug: string) {
  const location = WEATHER_LOCATIONS.find((l) => l.slug === slug) || WEATHER_LOCATIONS[0];

  if (location.slug === "wrens") {
    const data = await getWeatherDataSelfHealing();
    return data ? { ...data, location } : null;
  }

  const cached = locationCache.get(location.slug);
  if (cached && Date.now() - cached.fetchedAt.getTime() < LOCATION_TTL_MS) {
    return {
      lat: location.lat,
      lon: location.lon,
      forecast: cached.payload.forecastJson,
      hourly: cached.payload.hourlyJson,
      alerts: cached.payload.alertsJson,
      fetchedAt: cached.fetchedAt.toISOString(),
      stale: false,
      location,
    };
  }

  try {
    const payload = await fetchAndAdaptWeather(location.lat, location.lon);
    const fetchedAt = new Date();
    locationCache.set(location.slug, { payload, fetchedAt });
    return {
      lat: location.lat,
      lon: location.lon,
      forecast: payload.forecastJson,
      hourly: payload.hourlyJson,
      alerts: payload.alertsJson,
      fetchedAt: fetchedAt.toISOString(),
      stale: false,
      location,
    };
  } catch (error) {
    console.error(`[Weather] Fetch failed for ${location.slug}:`, error);
    // Serve the expired cache rather than nothing.
    if (cached) {
      return {
        lat: location.lat,
        lon: location.lon,
        forecast: cached.payload.forecastJson,
        hourly: cached.payload.hourlyJson,
        alerts: cached.payload.alertsJson,
        fetchedAt: cached.fetchedAt.toISOString(),
        stale: true,
        location,
      };
    }
    return null;
  }
}
