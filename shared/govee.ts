// Shared Govee H5103 sensor helpers — single source of truth for both the
// server (polling/alerts) and the client (risk badges, recommendations).
//
// NOTE: The H5103 is only exposed via Govee's Platform API (openapi.api.govee.com),
// NOT the legacy developer-api.govee.com /v1 endpoints.

export const GOVEE_API_BASE = "https://openapi.api.govee.com";
export const GOVEE_DEVICES_PATH = "/router/api/v1/user/devices";
export const GOVEE_STATE_PATH = "/router/api/v1/device/state";

// Capability `instance` names returned by the Platform API for thermo-hygrometers.
// Models vary: newer hygrometers (e.g. H5111) may report under alternate
// instance names, so each field accepts several aliases.
export const GOVEE_CAP = {
  online: "online",
  temperature: "sensorTemperature",
  humidity: "sensorHumidity",
} as const;

// Accepted instance-name aliases per reading (lower-cased match).
const TEMPERATURE_INSTANCES = ["sensortemperature", "temperature"];
const HUMIDITY_INSTANCES = ["sensorhumidity", "humidity"];
const ONLINE_INSTANCES = ["online"];

// Govee sends the reading value as a plain number, a numeric string, or a
// nested object keyed by e.g. currentTemperature/currentHumidity. Coerce all.
function coerceReading(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["currentTemperature", "currentHumidity", "value", "current", "measurement"]) {
      if (obj[key] != null) {
        const n = coerceReading(obj[key]);
        if (n != null) return n;
      }
    }
  }
  return null;
}

export type RiskLevel = "normal" | "watch" | "high" | "critical";

export interface HumidityThresholds {
  watch?: number | null; // default 60
  high?: number | null; // default 65
  critical?: number | null; // default 75
}

export const DEFAULT_THRESHOLDS = {
  humidityWatch: 60,
  humidityHigh: 65,
  humidityCritical: 75,
  tempLowF: 40,
} as const;

/** Map a humidity reading to a risk band using per-sensor thresholds (or defaults). */
export function riskStatus(humidity: number | null | undefined, t?: HumidityThresholds): RiskLevel {
  if (humidity == null || Number.isNaN(humidity)) return "normal";
  const watch = t?.watch ?? DEFAULT_THRESHOLDS.humidityWatch;
  const high = t?.high ?? DEFAULT_THRESHOLDS.humidityHigh;
  const critical = t?.critical ?? DEFAULT_THRESHOLDS.humidityCritical;
  if (humidity >= critical) return "critical";
  if (humidity >= high) return "high";
  if (humidity >= watch) return "watch";
  return "normal";
}

/** Display metadata for each risk level (brand-aligned). */
export const RISK_META: Record<RiskLevel, { label: string; color: string; bg: string; text: string }> = {
  normal: { label: "Normal", color: "#16a34a", bg: "bg-green-100", text: "text-green-700" },
  watch: { label: "Watch", color: "#d97706", bg: "bg-amber-100", text: "text-amber-700" },
  high: { label: "High", color: "#ea580c", bg: "bg-orange-100", text: "text-orange-700" },
  critical: { label: "Critical", color: "#b91c1c", bg: "bg-red-100", text: "text-red-700" },
};

/** HVAC service recommendations driven by risk + sensor location. */
export function recommendedActions(risk: RiskLevel, locationType?: string | null): string[] {
  if (risk === "normal" || risk === "watch") return [];
  const loc = (locationType || "").toLowerCase();
  const recs: string[] = [];
  if (loc.includes("crawl")) {
    recs.push("Schedule crawlspace inspection");
    recs.push("Recommend vapor barrier / encapsulation inspection");
    recs.push("Recommend crawlspace dehumidifier");
  } else if (loc.includes("attic")) {
    recs.push("Inspect attic ventilation");
    recs.push("Recommend duct inspection");
  } else if (loc.includes("basement")) {
    recs.push("Recommend basement dehumidifier");
    recs.push("Inspect for moisture intrusion");
  } else {
    recs.push("Recommend dehumidifier");
    recs.push("Recommend duct inspection");
  }
  if (risk === "critical") recs.unshift("Dispatch service visit — humidity critical");
  return recs;
}

export interface ParsedSensorState {
  online: boolean;
  temperatureF: number | null;
  humidity: number | null;
}

/** Normalize the Govee Platform API `device/state` capabilities array. */
export function parseGoveeState(
  capabilities: Array<{ instance?: string; state?: { value?: unknown } }> | undefined,
): ParsedSensorState {
  let online = false;
  let sawOnlineCap = false;
  let temperatureF: number | null = null;
  let humidity: number | null = null;
  for (const cap of capabilities ?? []) {
    const instance = String(cap?.instance ?? "").toLowerCase();
    const value = cap?.state?.value;
    if (ONLINE_INSTANCES.includes(instance)) {
      sawOnlineCap = true;
      online = Boolean(value);
    } else if (TEMPERATURE_INSTANCES.includes(instance)) {
      const n = coerceReading(value);
      if (n != null) temperatureF = n;
    } else if (HUMIDITY_INSTANCES.includes(instance)) {
      const n = coerceReading(value);
      if (n != null) humidity = n;
    }
  }
  // Some models omit an explicit online capability; treat a fresh reading as
  // online so the sensor doesn't get flagged offline just for lacking the cap.
  if (!sawOnlineCap && (temperatureF != null || humidity != null)) {
    online = true;
  }
  return { online, temperatureF, humidity };
}
