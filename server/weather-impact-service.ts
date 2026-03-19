import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { isAppActive } from "./activity-tracker";

export async function refreshCallDaily(): Promise<void> {
  try {
    const result = await db.execute(sql`
      SELECT 
        d.date,
        COUNT(c.id) as inbound_calls
      FROM call_log_days d
      LEFT JOIN call_logs c ON c.day_id = d.id
      GROUP BY d.date
    `);
    
    for (const row of result.rows as any[]) {
      await storage.upsertCallDaily(row.date, Number(row.inbound_calls));
    }
    
    console.log(`[WeatherImpact] Refreshed call_daily with ${result.rows.length} days`);
  } catch (error) {
    console.error("[WeatherImpact] Error refreshing call_daily:", error);
  }
}

export async function refreshWeatherDaily(): Promise<void> {
  try {
    const cache = await storage.getWeatherCache();
    if (!cache?.hourlyJson?.properties?.periods) {
      console.log("[WeatherImpact] No hourly weather data available");
      return;
    }

    const periods = cache.hourlyJson.properties.periods;
    const dailyData: Record<string, { temps: number[] }> = {};

    for (const period of periods) {
      const date = period.startTime?.split("T")[0];
      if (!date) continue;
      
      if (!dailyData[date]) {
        dailyData[date] = { temps: [] };
      }
      
      if (typeof period.temperature === "number") {
        dailyData[date].temps.push(period.temperature);
      }
    }

    let daysUpdated = 0;
    for (const [date, data] of Object.entries(dailyData)) {
      if (data.temps.length === 0) continue;
      
      const avgTemp = data.temps.reduce((a, b) => a + b, 0) / data.temps.length;
      const maxTemp = Math.max(...data.temps);
      const minTemp = Math.min(...data.temps);
      
      await storage.upsertWeatherDaily(date, avgTemp, maxTemp, minTemp);
      daysUpdated++;
    }

    console.log(`[WeatherImpact] Refreshed weather_daily with ${daysUpdated} days`);
  } catch (error) {
    console.error("[WeatherImpact] Error refreshing weather_daily:", error);
  }
}

let weatherImpactInterval: NodeJS.Timeout | null = null;

export function scheduleWeatherImpactJobs(): void {
  if (weatherImpactInterval) {
    clearInterval(weatherImpactInterval);
  }

  const runJobs = async () => {
    await refreshCallDaily();
    await refreshWeatherDaily();
  };

  runJobs().catch(console.error);

  weatherImpactInterval = setInterval(() => {
    if (!isAppActive()) {
      console.log("[WeatherImpact] App idle, skipping jobs");
      return;
    }
    runJobs().catch(console.error);
  }, 6 * 60 * 60 * 1000);

  console.log("[WeatherImpact] Jobs scheduled (every 6 hours)");
}
