import { randomUUID } from "crypto";
import pLimit from "p-limit";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  goveeSensors,
  goveeSensorReadings,
  goveeSensorAlerts,
  crmNotifications,
  crmUsers,
  type GoveeSensor,
} from "@shared/schema";
import {
  GOVEE_API_BASE,
  GOVEE_DEVICES_PATH,
  GOVEE_STATE_PATH,
  parseGoveeState,
  recommendedActions,
  type ParsedSensorState,
  type RiskLevel,
} from "@shared/govee";

interface GoveeDevice {
  sku: string;
  device: string;
  deviceName?: string;
  type?: string;
  capabilities?: unknown[];
}

type AlertType =
  | "humidity_critical"
  | "humidity_high_sustained"
  | "offline"
  | "temp_low"
  | "temp_high";

function numOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

class GoveeService {
  private getApiKey(): string {
    return process.env.GOVEE_API_KEY || process.env.Gove_API_KEY || "";
  }

  isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  private async request(path: string, method: "GET" | "POST", body?: unknown): Promise<any> {
    const res = await fetch(`${GOVEE_API_BASE}${path}`, {
      method,
      headers: {
        "Govee-API-Key": this.getApiKey(),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Govee API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  /** List the user's Govee devices via the Platform API. */
  async listDevices(): Promise<GoveeDevice[]> {
    if (!this.isConfigured()) return [];
    const json = await this.request(GOVEE_DEVICES_PATH, "GET");
    return Array.isArray(json?.data) ? (json.data as GoveeDevice[]) : [];
  }

  /** Fetch the latest temperature/humidity/online state for one device. */
  async getDeviceState(sku: string, device: string): Promise<ParsedSensorState> {
    const json = await this.request(GOVEE_STATE_PATH, "POST", {
      requestId: randomUUID(),
      payload: { sku, device },
    });
    const capabilities = json?.payload?.capabilities;
    const parsed = parseGoveeState(capabilities);
    // If a device returns capabilities but we couldn't read temp OR humidity,
    // log the raw instances so an unrecognized model (e.g. a new H5111 payload
    // shape) can be mapped precisely.
    if (parsed.temperatureF == null && parsed.humidity == null && Array.isArray(capabilities) && capabilities.length > 0) {
      const shapes = capabilities.map((c: any) => `${c?.instance}=${JSON.stringify(c?.state?.value)}`).join(", ");
      console.warn(`[Govee] ${sku}/${device} returned no temp/humidity. Raw capabilities: ${shapes}`);
    }
    return parsed;
  }

  /** Raw device/state response for one device (debugging unrecognized models). */
  async getRawDeviceState(sku: string, device: string): Promise<any> {
    return this.request(GOVEE_STATE_PATH, "POST", {
      requestId: randomUUID(),
      payload: { sku, device },
    });
  }

  /** Debug helper: raw + parsed state for every device, to map new models. */
  async debugAll(): Promise<any[]> {
    const sensors = await db.select().from(goveeSensors);
    const out: any[] = [];
    for (const s of sensors) {
      try {
        const raw = await this.getRawDeviceState(s.sku, s.device);
        out.push({
          label: s.label,
          deviceName: s.deviceName,
          sku: s.sku,
          device: s.device,
          isActive: s.isActive,
          parsed: parseGoveeState(raw?.payload?.capabilities),
          capabilities: (raw?.payload?.capabilities ?? []).map((c: any) => ({
            type: c?.type,
            instance: c?.instance,
            value: c?.state?.value,
          })),
        });
      } catch (e) {
        out.push({ label: s.label, sku: s.sku, device: s.device, isActive: s.isActive, error: (e as Error).message });
      }
    }
    return out;
  }

  /** Discover devices and upsert into govee_sensors WITHOUT clobbering mapping/labels. */
  async syncDevices(): Promise<{ created: number; total: number }> {
    const devices = await this.listDevices();
    let created = 0;
    for (const d of devices) {
      if (!d.device) continue;
      const [existing] = await db
        .select({ id: goveeSensors.id })
        .from(goveeSensors)
        .where(eq(goveeSensors.device, d.device));
      if (existing) {
        await db
          .update(goveeSensors)
          .set({ sku: d.sku, deviceName: d.deviceName ?? null, updatedAt: new Date() })
          .where(eq(goveeSensors.id, existing.id));
      } else {
        await db.insert(goveeSensors).values({
          device: d.device,
          sku: d.sku,
          deviceName: d.deviceName ?? null,
        });
        created++;
      }
    }
    if (created > 0) console.log(`[Govee] Discovered ${created} new device(s) (${devices.length} total)`);
    return { created, total: devices.length };
  }

  /** Poll every active sensor: store a reading, update cache, evaluate alerts. */
  async pollAll(): Promise<void> {
    if (!this.isConfigured()) return;
    await this.syncDevices().catch((e) => console.error("[Govee] device sync error:", e));

    const sensors = await db.select().from(goveeSensors).where(eq(goveeSensors.isActive, true));
    const limit = pLimit(2); // respect Govee rate limits
    await Promise.all(
      sensors.map((sensor) =>
        limit(async () => {
          try {
            const state = await this.getDeviceState(sensor.sku, sensor.device);
            const now = new Date();
            await db.insert(goveeSensorReadings).values({
              sensorId: sensor.id,
              temperatureF: state.temperatureF != null ? String(state.temperatureF) : null,
              humidity: state.humidity != null ? String(state.humidity) : null,
              online: state.online,
            });
            await db
              .update(goveeSensors)
              .set({
                lastTemperatureF: state.temperatureF != null ? String(state.temperatureF) : null,
                lastHumidity: state.humidity != null ? String(state.humidity) : null,
                lastOnline: state.online,
                lastReadingAt: now,
                updatedAt: now,
              })
              .where(eq(goveeSensors.id, sensor.id));
            await this.evaluateAlerts(sensor, state);
          } catch (e) {
            console.error(`[Govee] poll failed for ${sensor.device}:`, (e as Error).message);
          }
        }),
      ),
    );
  }

  // ── Alert engine ──────────────────────────────────────────────────────────
  private async evaluateAlerts(sensor: GoveeSensor, state: ParsedSensorState): Promise<void> {
    const humidity = state.humidity;
    const temp = state.temperatureF;
    const high = numOr(sensor.humidityHigh, 65);
    const critical = numOr(sensor.humidityCritical, 75);
    const tempLow = numOr(sensor.tempLowF, 40);
    const tempHigh = sensor.tempHighF != null ? Number(sensor.tempHighF) : null;

    // Humidity critical — immediate
    if (humidity != null && humidity >= critical) {
      await this.openAlert(sensor, "humidity_critical", "critical", `Humidity ${humidity}% — critical`, humidity);
    } else {
      await this.resolveAlert(sensor.id, "humidity_critical");
    }

    // Humidity high — sustained 2h
    if (humidity != null && humidity >= high && humidity < critical) {
      if (await this.humiditySustained(sensor.id, high, 120)) {
        await this.openAlert(sensor, "humidity_high_sustained", "high", `Humidity ≥ ${high}% sustained 2h`, humidity);
      }
    } else if (humidity == null || humidity < high) {
      await this.resolveAlert(sensor.id, "humidity_high_sustained");
    }

    // Offline (Govee reports online=false)
    if (!state.online) {
      await this.openAlert(sensor, "offline", "watch", "Sensor reporting offline", null);
    } else {
      await this.resolveAlert(sensor.id, "offline");
    }

    // Temperature low
    if (temp != null && temp <= tempLow) {
      await this.openAlert(sensor, "temp_low", "high", `Temperature ${temp}°F below ${tempLow}°F`, temp);
    } else {
      await this.resolveAlert(sensor.id, "temp_low");
    }

    // Temperature high (only if a threshold is configured)
    if (tempHigh != null && temp != null && temp >= tempHigh) {
      await this.openAlert(sensor, "temp_high", "high", `Temperature ${temp}°F above ${tempHigh}°F`, temp);
    } else {
      await this.resolveAlert(sensor.id, "temp_high");
    }
  }

  /** True only when every reading in the last `minutes` window is >= threshold AND we have enough history. */
  private async humiditySustained(sensorId: string, threshold: number, minutes: number): Promise<boolean> {
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const rows = await db
      .select({ humidity: goveeSensorReadings.humidity, recordedAt: goveeSensorReadings.recordedAt })
      .from(goveeSensorReadings)
      .where(and(eq(goveeSensorReadings.sensorId, sensorId), gte(goveeSensorReadings.recordedAt, since)))
      .orderBy(goveeSensorReadings.recordedAt);
    if (rows.length === 0) return false;
    const earliest = rows[0].recordedAt ? new Date(rows[0].recordedAt).getTime() : Date.now();
    const coverageMin = (Date.now() - earliest) / 60000;
    if (coverageMin < minutes - 20) return false; // not enough history collected yet
    return rows.every((r) => r.humidity != null && Number(r.humidity) >= threshold);
  }

  private async openAlert(
    sensor: GoveeSensor,
    type: AlertType,
    severity: "watch" | "high" | "critical",
    message: string,
    value: number | null,
  ): Promise<void> {
    const [existing] = await db
      .select({ id: goveeSensorAlerts.id })
      .from(goveeSensorAlerts)
      .where(
        and(
          eq(goveeSensorAlerts.sensorId, sensor.id),
          eq(goveeSensorAlerts.type, type),
          eq(goveeSensorAlerts.status, "open"),
        ),
      );
    if (existing) return; // already open — dedup

    const risk: RiskLevel = severity;
    const recommendedAction = recommendedActions(risk, sensor.locationType)[0] ?? null;
    const [alert] = await db
      .insert(goveeSensorAlerts)
      .values({
        sensorId: sensor.id,
        type,
        severity,
        message,
        value: value != null ? String(value) : null,
        recommendedAction,
      })
      .returning({ id: goveeSensorAlerts.id });

    const notificationId = await this.notifyStaff(sensor, message, recommendedAction);
    if (notificationId) {
      await db.update(goveeSensorAlerts).set({ notificationId }).where(eq(goveeSensorAlerts.id, alert.id));
    }
    console.log(
      `[Govee] ALERT ${type} (${severity}) for ${sensor.label || sensor.deviceName || sensor.device}: ${message}`,
    );
  }

  private async resolveAlert(sensorId: string, type: AlertType): Promise<void> {
    await db
      .update(goveeSensorAlerts)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(
        and(
          eq(goveeSensorAlerts.sensorId, sensorId),
          eq(goveeSensorAlerts.type, type),
          eq(goveeSensorAlerts.status, "open"),
        ),
      );
  }

  private async notifyStaff(
    sensor: GoveeSensor,
    message: string,
    recommendedAction: string | null,
  ): Promise<string | null> {
    try {
      const recipients = await db
        .select({ id: crmUsers.id })
        .from(crmUsers)
        .where(and(inArray(crmUsers.role, ["owner", "admin"]), eq(crmUsers.isActive, true)));
      if (recipients.length === 0) return null;
      const title = `Sensor alert: ${sensor.label || sensor.deviceName || sensor.device}`;
      const preview = recommendedAction ? `${message} — ${recommendedAction}` : message;
      let firstId: string | null = null;
      for (const r of recipients) {
        const [n] = await db
          .insert(crmNotifications)
          .values({
            userId: r.id,
            type: "system",
            title,
            preview,
            entityType: "govee_sensor",
            entityId: sensor.id,
          })
          .returning({ id: crmNotifications.id });
        if (!firstId) firstId = n.id;
      }
      return firstId;
    } catch (e) {
      console.error("[Govee] notify failed:", (e as Error).message);
      return null;
    }
  }
}

export const goveeService = new GoveeService();

let goveeInterval: NodeJS.Timeout | null = null;

/** Mirror of startBouncieBackgroundSync — initial run after 30s, then every N minutes. */
export function startGoveeBackgroundSync(intervalMinutes = 5): void {
  if (goveeInterval) clearInterval(goveeInterval);
  console.log(`[Govee] Starting background sync every ${intervalMinutes} minutes`);

  setTimeout(async () => {
    try {
      if (goveeService.isConfigured()) {
        console.log("[Govee] Running initial sync...");
        await goveeService.pollAll();
        console.log("[Govee] Initial sync complete");
      } else {
        console.log("[Govee] GOVEE_API_KEY not configured — sensor sync disabled");
      }
    } catch (e) {
      console.error("[Govee] Initial sync failed:", e);
    }
  }, 30000);

  goveeInterval = setInterval(
    async () => {
      // Environmental monitoring must run around the clock — do NOT gate on
      // isAppActive(). Alerts (crawlspace moisture, freeze risk) need to fire
      // when nobody has the CRM open. That's the whole point of remote monitoring.
      try {
        if (goveeService.isConfigured()) await goveeService.pollAll();
      } catch (e) {
        console.error("[Govee] Background sync failed:", e);
      }
    },
    intervalMinutes * 60 * 1000,
  );
}
