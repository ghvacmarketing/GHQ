import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { format } from "date-fns";
import { Droplets, Thermometer, Wifi, WifiOff, MapPin, Wrench, Check, Bell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RISK_META, type RiskLevel } from "@shared/govee";

export interface SensorView {
  id: string;
  device: string;
  sku: string;
  deviceName: string | null;
  label: string | null;
  locationType: string | null;
  propertyId: string | null;
  customerId: string | null;
  isActive: boolean;
  temperatureF: number | null;
  humidity: number | null;
  online: boolean | null;
  lastReadingAt: string | null;
  risk: RiskLevel;
  thresholds: {
    humidityWatch: number | null;
    humidityHigh: number | null;
    humidityCritical: number | null;
    tempLowF: number | null;
    tempHighF: number | null;
  };
  calibration?: {
    tempOffsetF: number;
    humidityOffset: number;
  };
  propertyAddress: string | null;
  customerName: string | null;
}

export interface SensorAlert {
  id: string;
  sensorId: string;
  type: string;
  severity: "watch" | "high" | "critical";
  message: string;
  recommendedAction: string | null;
  sensorLabel: string | null;
  openedAt: string | null;
}

const LOCATION_OPTIONS = [
  "crawlspace",
  "attic",
  "living_room",
  "basement",
  "garage",
  "kitchen",
  "bedroom",
  "mechanical_room",
  "other",
] as const;

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function prettyLocation(loc: string | null): string {
  if (!loc) return "";
  return loc.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RiskBadge({ risk, className }: { risk: RiskLevel; className?: string }) {
  const meta = RISK_META[risk];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", meta.bg, meta.text, className)}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

export function SensorCard({ sensor, onClick }: { sensor: SensorView; onClick?: () => void }) {
  const meta = RISK_META[sensor.risk];
  const offline = sensor.online === false;
  const hum = sensor.humidity;
  const humPct = hum != null ? Math.max(0, Math.min(100, hum)) : null;
  const t = sensor.thresholds;
  // Threshold ticks drawn over the humidity bar so the reading's distance from
  // each danger zone is visible at a glance.
  const markers = [t.humidityWatch, t.humidityHigh, t.humidityCritical].filter(
    (v): v is number => v != null,
  );
  const subtitle = [prettyLocation(sensor.locationType), sensor.propertyAddress || sensor.customerName]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card
      onClick={onClick}
      className={cn(
        "cursor-pointer transition-all hover:shadow-md hover:border-[#711419]/20 rounded-xl overflow-hidden",
        sensor.risk === "critical" && "border-red-300",
      )}
      data-testid={`sensor-card-${sensor.id}`}
    >
      <div className="h-1" style={{ backgroundColor: meta.color }} />
      <CardContent className="p-4">
        {/* Header */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-slate-900">
                {sensor.label || sensor.deviceName || "Unnamed sensor"}
              </p>
              {sensor.sku && (
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  {sensor.sku}
                </span>
              )}
            </div>
            {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0",
              offline ? "bg-slate-100 text-slate-400" : "bg-green-50 text-green-600",
            )}
          >
            {offline ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
            {offline ? "Offline" : "Online"}
          </span>
        </div>

        {/* Big readings */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Humidity — the hero reading */}
          <div className="rounded-xl p-3" style={{ backgroundColor: `${meta.color}12` }}>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: meta.color }}>
              <Droplets className="h-3.5 w-3.5" /> Humidity
            </div>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-4xl font-bold leading-none tabular-nums" style={{ color: meta.color }}>
                {hum != null ? Math.round(hum) : "—"}
              </span>
              <span className="text-xl font-semibold" style={{ color: meta.color }}>%</span>
            </div>
          </div>
          {/* Temperature */}
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <Thermometer className="h-3.5 w-3.5" /> Temp
            </div>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-4xl font-bold leading-none tabular-nums text-slate-800">
                {sensor.temperatureF != null ? Math.round(sensor.temperatureF) : "—"}
              </span>
              <span className="text-xl font-semibold text-slate-400">°F</span>
            </div>
          </div>
        </div>

        {/* Humidity gauge with safe→danger zones + a live marker */}
        <div className="mt-4">
          <div className="relative h-3 overflow-hidden rounded-full bg-gradient-to-r from-emerald-300 via-amber-300 to-red-400">
            {markers.map((v, i) => (
              <span key={i} className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${Math.max(0, Math.min(100, v))}%` }} />
            ))}
            {humPct != null && (
              <div
                className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-900 shadow-md ring-2 ring-white"
                style={{ left: `${humPct}%` }}
                title={`${Math.round(hum!)}% humidity`}
              />
            )}
          </div>
          <div className="mt-1 flex justify-between text-[10px] font-medium text-slate-400">
            <span>Dry</span>
            <span>Ideal 30–50%</span>
            <span>Damp</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t pt-2.5">
          <RiskBadge risk={sensor.risk} />
          <p className="text-[11px] text-slate-400">Updated {timeAgo(sensor.lastReadingAt)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

interface ReadingPoint {
  t: string;
  temperatureF: number | null;
  humidity: number | null;
}

export function SensorTrendChart({
  readingsUrl,
  thresholds,
}: {
  readingsUrl: string;
  thresholds?: SensorView["thresholds"];
}) {
  const [range, setRange] = useState<"24h" | "7d" | "30d">("24h");
  const { data, isLoading } = useQuery<{ range: string; points: ReadingPoint[] }>({
    queryKey: [readingsUrl, range],
    queryFn: async () => {
      const res = await fetch(`${readingsUrl}?range=${range}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load readings");
      return res.json();
    },
  });

  const points = (data?.points || []).map((p) => ({
    ...p,
    ts: p.t ? new Date(p.t).getTime() : 0,
  }));
  const fmtTick = (ts: number) => (range === "24h" ? format(ts, "ha") : format(ts, "M/d"));

  return (
    <div>
      <div className="flex items-center justify-end gap-1 mb-3">
        {(["24h", "7d", "30d"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-lg transition-all",
              range === r ? "bg-[#711419] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {r}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="h-56 flex items-center justify-center text-sm text-slate-400">Loading…</div>
      ) : points.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center px-6 text-center">
          <p className="text-sm font-medium text-slate-600">No trend data yet</p>
          <p className="mt-1 max-w-xs text-xs text-slate-400">
            Sync will build humidity and temperature history over time.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1">Humidity %</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={points} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="humGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#711419" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#711419" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="ts" tickFormatter={fmtTick} fontSize={11} stroke="#94a3b8" />
                <YAxis domain={[0, 100]} fontSize={11} stroke="#94a3b8" />
                <RTooltip
                  labelFormatter={(ts) => format(Number(ts), "MMM d, h:mm a")}
                  formatter={(v: any) => [`${Math.round(Number(v))}%`, "Humidity"]}
                />
                {thresholds?.humidityHigh != null && (
                  <ReferenceLine y={thresholds.humidityHigh} stroke="#ea580c" strokeDasharray="4 4" />
                )}
                {thresholds?.humidityCritical != null && (
                  <ReferenceLine y={thresholds.humidityCritical} stroke="#b91c1c" strokeDasharray="4 4" />
                )}
                <Area type="monotone" dataKey="humidity" stroke="#711419" strokeWidth={2} fill="url(#humGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1">Temperature °F</p>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={points} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="ts" tickFormatter={fmtTick} fontSize={11} stroke="#94a3b8" />
                <YAxis fontSize={11} stroke="#94a3b8" />
                <RTooltip
                  labelFormatter={(ts) => format(Number(ts), "MMM d, h:mm a")}
                  formatter={(v: any) => [`${Math.round(Number(v))}°F`, "Temp"]}
                />
                <Line type="monotone" dataKey="temperatureF" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

export function AlertsList({
  alerts,
  onCreateWorkOrder,
}: {
  alerts: SensorAlert[];
  onCreateWorkOrder?: (sensorId: string) => void;
}) {
  const ack = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/crm/sensors/alerts/${id}/ack`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/crm/sensors/alerts"] }),
  });

  if (alerts.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-slate-400">
        <Check className="h-8 w-8 mx-auto mb-2 text-green-400" />
        No open alerts — all sensors within range.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {alerts.map((a) => {
        const meta = RISK_META[a.severity];
        return (
          <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl border bg-white" data-testid={`alert-${a.id}`}>
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${meta.color}1a` }}>
              <Bell className="h-4 w-4" style={{ color: meta.color }} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-slate-900 truncate">{a.sensorLabel || "Sensor"}</span>
                <RiskBadge risk={a.severity} />
              </div>
              <p className="text-xs text-slate-600 mt-0.5">{a.message}</p>
              {a.recommendedAction && (
                <p className="text-xs text-[#711419] font-medium mt-1">→ {a.recommendedAction}</p>
              )}
              <div className="flex gap-2 mt-2">
                {onCreateWorkOrder && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onCreateWorkOrder(a.sensorId)}>
                    <Wrench className="h-3 w-3 mr-1" /> Create Work Order
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500" onClick={() => ack.mutate(a.id)} disabled={ack.isPending}>
                  Acknowledge
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface CustomerHit {
  id: string;
  name: string;
}
interface PropertyHit {
  id: string;
  address1: string;
  city: string;
  state: string;
}

export function SensorMappingDialog({
  sensor,
  open,
  onOpenChange,
}: {
  sensor: SensorView | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [label, setLabel] = useState("");
  const [locationType, setLocationType] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const [propertyId, setPropertyId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [humidityHigh, setHumidityHigh] = useState("");
  const [humidityCritical, setHumidityCritical] = useState("");
  const [tempHighF, setTempHighF] = useState("");
  const [tempOffsetF, setTempOffsetF] = useState("");
  const [humidityOffset, setHumidityOffset] = useState("");

  // Seed form when the sensor changes
  const seededFor = sensor?.id;
  const [seeded, setSeeded] = useState<string | undefined>();
  if (sensor && seededFor !== seeded) {
    setSeeded(seededFor);
    setLabel(sensor.label || "");
    setLocationType(sensor.locationType || "");
    setCustomerId(sensor.customerId || "");
    setCustomerName(sensor.customerName || "");
    setPropertyId(sensor.propertyId || "");
    setHumidityHigh(sensor.thresholds.humidityHigh != null ? String(sensor.thresholds.humidityHigh) : "");
    setHumidityCritical(sensor.thresholds.humidityCritical != null ? String(sensor.thresholds.humidityCritical) : "");
    setTempHighF(sensor.thresholds.tempHighF != null ? String(sensor.thresholds.tempHighF) : "");
    setTempOffsetF(sensor.calibration?.tempOffsetF ? String(sensor.calibration.tempOffsetF) : "");
    setHumidityOffset(sensor.calibration?.humidityOffset ? String(sensor.calibration.humidityOffset) : "");
    setSearch("");
  }

  const { data: customerData } = useQuery<{ customers: CustomerHit[] }>({
    queryKey: ["/api/crm/customers/merged", "sensormap", search],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/merged?search=${encodeURIComponent(search)}&limit=8`, { credentials: "include" });
      if (!res.ok) throw new Error("search failed");
      return res.json();
    },
    enabled: search.trim().length >= 2,
  });

  const { data: propData } = useQuery<PropertyHit[]>({
    queryKey: [`/api/crm/customers/${customerId}/properties`],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${customerId}/properties`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!customerId && !customerId.startsWith("fieldedge-"),
  });

  const save = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/crm/sensors/${sensor!.id}`, {
        label: label || null,
        locationType: locationType || null,
        customerId: customerId || null,
        propertyId: propertyId || null,
        humidityHigh: humidityHigh === "" ? null : humidityHigh,
        humidityCritical: humidityCritical === "" ? null : humidityCritical,
        tempHighF: tempHighF === "" ? null : tempHighF,
        tempOffsetF: tempOffsetF === "" ? "0" : tempOffsetF,
        humidityOffset: humidityOffset === "" ? "0" : humidityOffset,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/sensors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/govee/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/analytics/summary"] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sensor settings — {sensor?.deviceName || sensor?.device}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Sensor name</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Crawlspace Sensor" />
            <p className="mt-1 text-[11px] text-muted-foreground">Shown on the sensor card and in the customer portal.</p>
          </div>
          <div>
            <Label className="text-xs">Location type</Label>
            <Select value={locationType} onValueChange={setLocationType}>
              <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
              <SelectContent>
                {LOCATION_OPTIONS.map((l) => (
                  <SelectItem key={l} value={l}>{prettyLocation(l)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Customer</Label>
            {customerId ? (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span className="truncate">{customerName || "Selected customer"}</span>
                <button className="text-xs text-[#711419]" onClick={() => { setCustomerId(""); setCustomerName(""); setPropertyId(""); }}>
                  Change
                </button>
              </div>
            ) : (
              <>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers…" />
                {customerData?.customers && customerData.customers.length > 0 && (
                  <div className="mt-1 border rounded-lg max-h-40 overflow-y-auto">
                    {customerData.customers.map((c) => (
                      <button
                        key={c.id}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                        onClick={() => { setCustomerId(c.id); setCustomerName(c.name); }}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              This sensor will appear in this customer's portal under Environment Monitoring.
            </p>
          </div>
          {customerId && !customerId.startsWith("fieldedge-") && propData && propData.length > 0 && (
            <div>
              <Label className="text-xs">Property</Label>
              <Select value={propertyId} onValueChange={setPropertyId}>
                <SelectTrigger><SelectValue placeholder="Select property (optional)" /></SelectTrigger>
                <SelectContent>
                  {propData.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.address1}, {p.city} {p.state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">High RH%</Label>
              <Input value={humidityHigh} onChange={(e) => setHumidityHigh(e.target.value)} placeholder="65" />
            </div>
            <div>
              <Label className="text-xs">Critical RH%</Label>
              <Input value={humidityCritical} onChange={(e) => setHumidityCritical(e.target.value)} placeholder="75" />
            </div>
            <div>
              <Label className="text-xs">Temp high °F</Label>
              <Input value={tempHighF} onChange={(e) => setTempHighF(e.target.value)} placeholder="—" />
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-xs font-semibold text-slate-700">Calibration</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Govee returns the raw reading; the Govee app can show a calibrated value. If they differ,
              set the offset (app value − CRM value) so they match. E.g. app 5°, CRM 7° → temp offset −2.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Temp offset °F</Label>
                <Input value={tempOffsetF} onChange={(e) => setTempOffsetF(e.target.value.replace(/[^0-9.-]/g, ""))} placeholder="0" data-testid="input-temp-offset" />
              </div>
              <div>
                <Label className="text-xs">Humidity offset %</Label>
                <Input value={humidityOffset} onChange={(e) => setHumidityOffset(e.target.value.replace(/[^0-9.-]/g, ""))} placeholder="0" data-testid="input-humidity-offset" />
              </div>
            </div>
            {sensor?.temperatureF != null && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Current CRM reading: {Math.round(sensor.temperatureF)}°F{sensor.humidity != null ? ` · ${Math.round(sensor.humidity)}%` : ""} (already includes any saved offset).
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#711419] hover:bg-[#5a1014]" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
