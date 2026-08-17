import { randomUUID } from "crypto";
import pLimit from "p-limit";
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  appSettings,
  goveeSensors,
  goveeSensorReadings,
  goveeSensorAlerts,
  crmNotifications,
  crmUsers,
  type CrmUserRole,
  type GoveeSensor,
} from "@shared/schema";
import {
  GOVEE_API_BASE,
  GOVEE_DEVICES_PATH,
  GOVEE_STATE_PATH,
  DEFAULT_SENSOR_ALERT_SETTINGS,
  SENSOR_ALERT_SETTINGS_KEY,
  parseGoveeState,
  recommendedActions,
  sanitizeSensorAlertSettings,
  type ParsedSensorState,
  type RiskLevel,
  type SensorAlertSettings,
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

// ── Alert anti-spam tuning ───────────────────────────────────────────────────
// Sensors (especially inside metal walk-in coolers) blip offline for a poll or
// two all the time, and readings oscillate around thresholds. Guards keep that
// noise from turning into a notification storm on the owners' phones. The
// debounce windows, notification cooldowns, and recipient roles are tunable in
// Settings → Sensors (stored in app_settings; defaults in shared/govee.ts).
const RESOLVE_MARGIN = 2; // °F / %RH a reading must clear its threshold by before the alert resolves
// An alert that still reflects reality — acknowledged rows MUST count here:
// treating them as inactive meant acknowledging a still-offline sensor opened a
// fresh duplicate (and re-notified) on the very next poll, every minute.
const ACTIVE_ALERT_STATUSES = ["open", "acknowledged"];

class GoveeService {
  private getApiKey(): string {
    return process.env.GOVEE_API_KEY || process.env.Gove_API_KEY || "";
  }

  // ── Alert policy (Settings → Sensors) ─────────────────────────────────────
  private settingsCache: { at: number; value: SensorAlertSettings } | null = null;

  /** Current alert policy — cached briefly so each poll cycle reads the DB once. */
  async getAlertSettings(fresh = false): Promise<SensorAlertSettings> {
    if (!fresh && this.settingsCache && Date.now() - this.settingsCache.at < 60_000) {
      return this.settingsCache.value;
    }
    let value = DEFAULT_SENSOR_ALERT_SETTINGS;
    try {
      const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SENSOR_ALERT_SETTINGS_KEY));
      value = sanitizeSensorAlertSettings(row?.value ? JSON.parse(row.value) : null);
    } catch (e) {
      console.error("[Govee] alert settings load failed — using defaults:", (e as Error).message);
    }
    this.settingsCache = { at: Date.now(), value };
    return value;
  }

  invalidateAlertSettings(): void {
    this.settingsCache = null;
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

  // Budget guard: Govee's Platform API allows 10,000 requests/day. At 1-min
  // polling, 6 state reads/min = 8,640/day — running device DISCOVERY on every
  // poll too (+1,440/day) would blow the cap and kill polling until the daily
  // reset. So discovery runs on every 10th poll only, and overlapping polls
  // (interval + manual sync + initial run) are coalesced.
  private pollInFlight = false;
  private pollCount = 0;
  private lastPurgeAt = 0;

  /** Poll every active sensor: store a reading, update cache, evaluate alerts. */
  async pollAll(): Promise<void> {
    if (!this.isConfigured()) return;
    if (this.pollInFlight) return;
    this.pollInFlight = true;
    try {
      await this.pollAllInner();
    } finally {
      this.pollInFlight = false;
    }
  }

  private async pollAllInner(): Promise<void> {
    if (this.pollCount++ % 10 === 0) {
      await this.syncDevices().catch((e) => console.error("[Govee] device sync error:", e));
    }

    // Once a day, trim raw readings older than 90 days (1-min cadence adds
    // ~8.6k rows/day; the sensors page only charts recent history anyway).
    if (Date.now() - this.lastPurgeAt > 24 * 60 * 60 * 1000) {
      this.lastPurgeAt = Date.now();
      db.execute(sql`DELETE FROM govee_sensor_readings WHERE recorded_at < now() - interval '90 days'`)
        .then((r: any) => {
          const n = Number(r?.rowCount ?? 0);
          if (n > 0) console.log(`[Govee] Purged ${n} readings older than 90 days`);
        })
        .catch((e) => console.error("[Govee] readings purge failed:", e));
    }

    const sensors = await db.select().from(goveeSensors).where(eq(goveeSensors.isActive, true));
    const alertCfg = await this.getAlertSettings();
    const limit = pLimit(2); // respect Govee rate limits
    await Promise.all(
      sensors.map((sensor) =>
        limit(async () => {
          try {
            const state = await this.getDeviceState(sensor.sku, sensor.device);
            // Apply per-sensor calibration so stored values match the Govee app.
            const tOff = numOr(sensor.tempOffsetF, 0);
            const hOff = numOr(sensor.humidityOffset, 0);
            if (state.temperatureF != null && tOff !== 0) state.temperatureF = Math.round((state.temperatureF + tOff) * 100) / 100;
            if (state.humidity != null && hOff !== 0) state.humidity = Math.round((state.humidity + hOff) * 100) / 100;
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
            await this.evaluateAlerts(sensor, state, alertCfg);
          } catch (e) {
            console.error(`[Govee] poll failed for ${sensor.device}:`, (e as Error).message);
          }
        }),
      ),
    );
  }

  // ── Alert engine ──────────────────────────────────────────────────────────
  private async evaluateAlerts(sensor: GoveeSensor, state: ParsedSensorState, cfg: SensorAlertSettings): Promise<void> {
    const humidity = state.humidity;
    const temp = state.temperatureF;
    // A blank threshold means "that alert is off" — a walk-in cooler runs
    // below the old hardcoded 40°F floor around the clock, and coercing null
    // to 0 made a cleared humidity threshold fire permanently.
    const high = sensor.humidityHigh != null ? Number(sensor.humidityHigh) : null;
    const critical = sensor.humidityCritical != null ? Number(sensor.humidityCritical) : null;
    const tempLow = sensor.tempLowF != null ? Number(sensor.tempLowF) : null;
    const tempHigh = sensor.tempHighF != null ? Number(sensor.tempHighF) : null;

    // Humidity critical — opens immediately; resolves only after dropping a
    // margin below the threshold so oscillation right at the line doesn't churn.
    if (critical != null && humidity != null && humidity >= critical) {
      await this.openAlert(sensor, "humidity_critical", "critical", `Humidity ${humidity}% — critical`, humidity, cfg);
    } else if (critical == null || humidity == null || humidity < critical - RESOLVE_MARGIN) {
      await this.resolveAlert(sensor.id, "humidity_critical");
    }

    // Humidity high — sustained 2h (the sustained window already debounces re-opens)
    if (high != null && humidity != null && humidity >= high && (critical == null || humidity < critical)) {
      if (await this.humiditySustained(sensor.id, high, 120)) {
        await this.openAlert(sensor, "humidity_high_sustained", "high", `Humidity ≥ ${high}% sustained 2h`, humidity, cfg);
      }
    } else if (high == null || humidity == null || humidity < high) {
      await this.resolveAlert(sensor.id, "humidity_high_sustained");
    }

    // Offline — a single offline poll must NOT alert (hubs blip constantly).
    // Open only after a sustained offline window; resolve only after a
    // sustained online window, so one good poll mid-outage can't close the
    // alert just for the next blip to re-open and re-notify.
    if (!state.online) {
      if (await this.onlineSustained(sensor.id, false, cfg.offlineOpenMinutes)) {
        await this.openAlert(sensor, "offline", "watch", `Sensor offline for ${cfg.offlineOpenMinutes}+ minutes`, null, cfg);
      }
    } else if (await this.findActiveAlert(sensor.id, "offline")) {
      if (await this.onlineSustained(sensor.id, true, cfg.offlineResolveMinutes)) {
        await this.resolveAlert(sensor.id, "offline");
      }
    }

    // Temperature low (only if a threshold is configured) — resolves with margin
    if (tempLow != null && temp != null && temp <= tempLow) {
      await this.openAlert(sensor, "temp_low", "high", `Temperature ${temp}°F below ${tempLow}°F`, temp, cfg);
    } else if (tempLow == null || temp == null || temp > tempLow + RESOLVE_MARGIN) {
      await this.resolveAlert(sensor.id, "temp_low");
    }

    // Temperature high (only if a threshold is configured) — resolves with margin
    if (tempHigh != null && temp != null && temp >= tempHigh) {
      await this.openAlert(sensor, "temp_high", "high", `Temperature ${temp}°F above ${tempHigh}°F`, temp, cfg);
    } else if (tempHigh == null || temp == null || temp < tempHigh - RESOLVE_MARGIN) {
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

  /** True only when every reading in the last `minutes` window matches `wantOnline` AND we have enough history. */
  private async onlineSustained(sensorId: string, wantOnline: boolean, minutes: number): Promise<boolean> {
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const rows = await db
      .select({ online: goveeSensorReadings.online, recordedAt: goveeSensorReadings.recordedAt })
      .from(goveeSensorReadings)
      .where(and(eq(goveeSensorReadings.sensorId, sensorId), gte(goveeSensorReadings.recordedAt, since)))
      .orderBy(goveeSensorReadings.recordedAt);
    if (rows.length === 0) return false;
    const earliest = rows[0].recordedAt ? new Date(rows[0].recordedAt).getTime() : Date.now();
    const coverageMin = (Date.now() - earliest) / 60000;
    if (coverageMin < minutes * 0.8) return false; // not enough history collected yet
    return rows.every((r) => r.online === wantOnline);
  }

  /** The alert of this type that still reflects reality: open OR acknowledged. */
  private async findActiveAlert(sensorId: string, type: AlertType): Promise<{ id: string } | undefined> {
    const [row] = await db
      .select({ id: goveeSensorAlerts.id })
      .from(goveeSensorAlerts)
      .where(
        and(
          eq(goveeSensorAlerts.sensorId, sensorId),
          eq(goveeSensorAlerts.type, type),
          inArray(goveeSensorAlerts.status, ACTIVE_ALERT_STATUSES),
        ),
      );
    return row;
  }

  /** Did a notified alert of this sensor+type open within the cooldown window? */
  private async recentlyNotified(sensorId: string, type: AlertType, cfg: SensorAlertSettings): Promise<boolean> {
    const hours = type === "offline" ? cfg.offlineCooldownHours : cfg.thresholdCooldownHours;
    if (hours <= 0) return false; // cooldown disabled — every alert notifies
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const [row] = await db
      .select({ id: goveeSensorAlerts.id })
      .from(goveeSensorAlerts)
      .where(
        and(
          eq(goveeSensorAlerts.sensorId, sensorId),
          eq(goveeSensorAlerts.type, type),
          isNotNull(goveeSensorAlerts.notificationId),
          gte(goveeSensorAlerts.openedAt, cutoff),
        ),
      )
      .limit(1);
    return !!row;
  }

  private async openAlert(
    sensor: GoveeSensor,
    type: AlertType,
    severity: "watch" | "high" | "critical",
    message: string,
    value: number | null,
    cfg: SensorAlertSettings,
  ): Promise<void> {
    if (await this.findActiveAlert(sensor.id, type)) return; // already open or acknowledged — dedup

    const risk: RiskLevel = severity;
    const recommendedAction = recommendedActions(risk, sensor.locationType)[0] ?? null;
    // Cooldown: if staff were already notified for this sensor+type recently,
    // open the alert row silently — it still shows in the UI, no phone buzz.
    const muted = await this.recentlyNotified(sensor.id, type, cfg);
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

    if (!muted) {
      const notificationId = await this.notifyStaff(sensor, message, recommendedAction, cfg);
      if (notificationId) {
        await db.update(goveeSensorAlerts).set({ notificationId }).where(eq(goveeSensorAlerts.id, alert.id));
      }
    }
    console.log(
      `[Govee] ALERT ${type} (${severity}) for ${sensor.label || sensor.deviceName || sensor.device}: ${message}${muted ? " — notification muted (cooldown)" : ""}`,
    );
  }

  // Resolves acknowledged rows too — otherwise an acknowledged alert lingered
  // as "active" forever and blocked every future alert of that type.
  private async resolveAlert(sensorId: string, type: AlertType): Promise<void> {
    await db
      .update(goveeSensorAlerts)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(
        and(
          eq(goveeSensorAlerts.sensorId, sensorId),
          eq(goveeSensorAlerts.type, type),
          inArray(goveeSensorAlerts.status, ACTIVE_ALERT_STATUSES),
        ),
      );
  }

  /** Recipients come from Settings → Sensors (default: owner + admin only —
   *  techs/sales shouldn't get environmental-monitoring pushes unless the
   *  owner deliberately turns that on). Empty roles = notifications off. */
  private async notifyStaff(
    sensor: GoveeSensor,
    message: string,
    recommendedAction: string | null,
    cfg: SensorAlertSettings,
  ): Promise<string | null> {
    try {
      if (cfg.notifyRoles.length === 0) return null;
      const recipients = await db
        .select({ id: crmUsers.id })
        .from(crmUsers)
        .where(and(inArray(crmUsers.role, cfg.notifyRoles as CrmUserRole[]), eq(crmUsers.isActive, true)));
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
