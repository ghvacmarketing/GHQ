import { storage } from "./storage";
import { isAppActive } from "./activity-tracker";

// Weather source: weatherapi.com (swapped from the National Weather Service).
// The fetched payload is adapted into the NWS-like shape the dashboard widgets
// and the weather-impact job already consume, so only this file knows the
// provider. Override the key/coords via env; defaults keep it working out of
// the box (coords = the shop's home base in Wrens, GA).
const WEATHERAPI_KEY = process.env.WEATHERAPI_KEY || "bf49aa77a7794369be0143857262507";
const WEATHER_LAT = process.env.WEATHER_LAT || "33.2071";
const WEATHER_LON = process.env.WEATHER_LON || "-82.3915";

type AdaptedPeriod = {
  name: string;
  isDaytime: boolean;
  temperature: number;
  shortForecast: string;
  startTime?: string;
};

export async function refreshWeather(): Promise<{ success: boolean; error?: string }> {
  try {
    const q = `${WEATHER_LAT},${WEATHER_LON}`;
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHERAPI_KEY}&q=${encodeURIComponent(q)}&days=7&aqi=no&alerts=yes`;
    const res = await fetch(url);
    const data: any = await res.json().catch(() => null);
    if (!res.ok || !data?.forecast?.forecastday?.length) {
      const detail = data?.error?.message || `WeatherAPI HTTP ${res.status}`;
      console.error("[Weather] Refresh failed:", detail);
      return { success: false, error: detail };
    }

    // Day/night forecast periods (the weekly strip merges them by day name).
    const periods: AdaptedPeriod[] = [];
    data.forecast.forecastday.forEach((fd: any, idx: number) => {
      const name =
        idx === 0
          ? "Today"
          : new Date(`${fd.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
      const condition = fd.day?.condition?.text || "";
      periods.push({
        name,
        isDaytime: true,
        temperature: Math.round(fd.day?.maxtemp_f ?? 0),
        shortForecast: condition,
        startTime: `${fd.date}T12:00:00`,
      });
      periods.push({
        name: idx === 0 ? "Tonight" : `${name} Night`,
        isDaytime: false,
        temperature: Math.round(fd.day?.mintemp_f ?? 0),
        shortForecast: condition,
        startTime: `${fd.date}T20:00:00`,
      });
    });

    // True current conditions — the dashboard's big number should be the
    // temperature right now, not today's forecast high.
    const current: AdaptedPeriod | null = data.current
      ? {
          name: "Now",
          isDaytime: data.current.is_day === 1,
          temperature: Math.round(data.current.temp_f ?? 0),
          shortForecast: data.current.condition?.text || "",
          startTime: (data.current.last_updated || "").replace(" ", "T") || undefined,
        }
      : null;

    // Hourly periods feed the weather-impact daily aggregation. forecastday[0]
    // includes all 24 hours of today (past hours included), so daily
    // avg/min/max are real, not forecast-only.
    const hourlyPeriods = data.forecast.forecastday.flatMap((fd: any) =>
      (fd.hour || []).map((h: any) => ({
        startTime: (h.time || "").replace(" ", "T"),
        temperature: Math.round(h.temp_f ?? 0),
        isDaytime: h.is_day === 1,
        shortForecast: h.condition?.text || "",
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

    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);

    await storage.upsertWeatherCache({
      id: 1,
      lat: WEATHER_LAT,
      lon: WEATHER_LON,
      forecastJson: { properties: { periods }, current } as any,
      hourlyJson: { properties: { periods: hourlyPeriods } } as any,
      alertsJson: { features: alertFeatures } as any,
      expiresAt,
    });

    console.log(`[Weather] WeatherAPI cache refreshed for ${q} at ${new Date().toISOString()}`);
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

  // Current conditions + forecast shift during the day — refresh every hour.
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
