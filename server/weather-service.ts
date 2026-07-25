import { storage } from "./storage";
import { isAppActive } from "./activity-tracker";

// Default to the shop's home base — Wrens, GA (PO Box 917, Wrens, GA 30833) —
// so weather imports work out of the box; WEATHER_LAT/LON env vars override.
const WEATHER_LAT = process.env.WEATHER_LAT || "33.2071";
const WEATHER_LON = process.env.WEATHER_LON || "-82.3915";
const WEATHER_UA = process.env.WEATHER_UA || "GiesbrechHVAC-CRM/1.0 (contact@ghvac.com)";

async function fetchWithUA(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent": WEATHER_UA,
      "Accept": "application/geo+json",
    },
  });
}

export async function refreshWeather(): Promise<{ success: boolean; error?: string }> {
  try {
    const pointsUrl = `https://api.weather.gov/points/${WEATHER_LAT},${WEATHER_LON}`;
    const pointsResponse = await fetchWithUA(pointsUrl);
    
    if (!pointsResponse.ok) {
      return { success: false, error: `Points API failed: ${pointsResponse.status}` };
    }

    const pointsData = await pointsResponse.json();
    const forecastUrl = pointsData.properties?.forecast;
    const hourlyUrl = pointsData.properties?.forecastHourly;

    if (!forecastUrl || !hourlyUrl) {
      return { success: false, error: "Could not get forecast URLs from points response" };
    }

    const [forecastResponse, hourlyResponse, alertsResponse] = await Promise.all([
      fetchWithUA(forecastUrl),
      fetchWithUA(hourlyUrl),
      fetchWithUA(`https://api.weather.gov/alerts/active?point=${WEATHER_LAT},${WEATHER_LON}`),
    ]);

    const forecastJson = forecastResponse.ok ? await forecastResponse.json() : null;
    const hourlyJson = hourlyResponse.ok ? await hourlyResponse.json() : null;
    const alertsJson = alertsResponse.ok ? await alertsResponse.json() : null;

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await storage.upsertWeatherCache({
      id: 1,
      lat: WEATHER_LAT,
      lon: WEATHER_LON,
      forecastJson,
      hourlyJson,
      alertsJson,
      expiresAt,
    });

    console.log(`[Weather] Cache refreshed at ${new Date().toISOString()}`);
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

  weatherRefreshInterval = setInterval(() => {
    if (!isAppActive()) {
      console.log("[Weather] App idle, skipping refresh");
      return;
    }
    refreshWeather().catch(console.error);
  }, 24 * 60 * 60 * 1000);

  console.log("[Weather] Daily refresh scheduled");
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
