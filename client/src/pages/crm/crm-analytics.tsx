import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  RefreshCw, Droplets, AlertTriangle, WifiOff, Building2, Settings2,
  CheckCircle2, MapPin, Cpu, ShieldCheck, Thermometer,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { CrmUser } from "@shared/schema";
import {
  SensorCard, SensorTrendChart, RiskBadge, AlertsList, SensorMappingDialog,
  type SensorView, type SensorAlert,
} from "@/components/analytics/sensor-widgets";

interface Summary {
  total: number;
  normal: number;
  watch: number;
  high: number;
  critical: number;
  offline: number;
  propertiesNeedingInspection: number;
  openAlerts: number;
}

interface DeviceRow {
  device: string;
  sku: string;
  deviceName: string | null;
  mapped: boolean;
  sensorId: string | null;
}

const SEGMENTS = [
  { key: "normal", label: "Normal", color: "#16a34a" },
  { key: "watch", label: "Watch", color: "#d97706" },
  { key: "high", label: "High", color: "#ea580c" },
  { key: "critical", label: "Critical", color: "#b91c1c" },
  { key: "offline", label: "Offline", color: "#64748b" },
] as const;

export default function CrmAnalytics() {
  const { toast } = useToast();
  const [detail, setDetail] = useState<SensorView | null>(null);
  const [mapping, setMapping] = useState<SensorView | null>(null);

  const { data: currentUser } = useQuery<CrmUser>({ queryKey: ["/api/crm/auth/me"] });
  const { data: sensorsData, isLoading: sensorsLoading } = useQuery<{ sensors: SensorView[] }>({
    queryKey: ["/api/crm/sensors"],
    refetchInterval: 60000,
  });
  const { data: summary } = useQuery<Summary>({ queryKey: ["/api/crm/analytics/summary"], refetchInterval: 60000 });
  const { data: alertsData } = useQuery<{ alerts: SensorAlert[] }>({ queryKey: ["/api/crm/sensors/alerts"], refetchInterval: 60000 });
  const { data: devicesData } = useQuery<{ configured: boolean; devices: DeviceRow[] }>({ queryKey: ["/api/crm/govee/devices"] });

  const sensors = sensorsData?.sensors || [];
  const unmappedDevices = (devicesData?.devices || []).filter((d) => !d.mapped);
  const alerts = alertsData?.alerts || [];

  const sync = useMutation({
    mutationFn: () => apiRequest("POST", "/api/crm/govee/sync"),
    onSuccess: () => {
      toast({ title: "Synced", description: "Pulled the latest sensor readings from Govee." });
      ["/api/crm/sensors", "/api/crm/analytics/summary", "/api/crm/sensors/alerts", "/api/crm/govee/devices"].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      );
    },
    onError: (e: any) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  });

  const createWorkOrder = useMutation({
    mutationFn: (sensorId: string) => apiRequest("POST", `/api/crm/sensors/${sensorId}/create-work-order`),
    onSuccess: () => toast({ title: "Work order created", description: "A service work order was added to the dispatch queue." }),
    onError: (e: any) => toast({ title: "Couldn't create work order", description: e.message, variant: "destructive" }),
  });

  // Group sensors by property address, then customer name, then "Unassigned".
  const groups = useMemo(() => {
    const map = new Map<string, { title: string; sensors: SensorView[] }>();
    for (const s of sensors) {
      const key = s.propertyAddress || s.customerName || "Unassigned sensors";
      if (!map.has(key)) map.set(key, { title: key, sensors: [] });
      map.get(key)!.sensors.push(s);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.title === "Unassigned sensors") return 1;
      if (b.title === "Unassigned sensors") return -1;
      return a.title.localeCompare(b.title);
    });
  }, [sensors]);

  // Overall system status from the worst active state.
  const status = useMemo(() => {
    if (!summary) return { label: "—", color: "#64748b", icon: ShieldCheck };
    if (summary.critical > 0) return { label: `${summary.critical} critical`, color: "#b91c1c", icon: AlertTriangle };
    if (summary.high > 0) return { label: `${summary.high} high`, color: "#ea580c", icon: AlertTriangle };
    if (summary.watch > 0) return { label: `${summary.watch} to watch`, color: "#d97706", icon: AlertTriangle };
    if (summary.offline > 0 && summary.total > 0) return { label: `${summary.offline} offline`, color: "#64748b", icon: WifiOff };
    return { label: "All normal", color: "#16a34a", icon: CheckCircle2 };
  }, [summary]);

  if (!currentUser) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="w-full space-y-5 pb-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Environment Monitoring</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Live humidity &amp; temperature from your Govee sensors.</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: `${status.color}15`, color: status.color }}
            >
              <status.icon className="h-3.5 w-3.5" /> {status.label}
            </span>
            <Button onClick={() => sync.mutate()} disabled={sync.isPending} variant="outline" size="sm">
              <RefreshCw className={cn("mr-1.5 h-4 w-4", sync.isPending && "animate-spin")} />
              Sync now
            </Button>
          </div>
        </div>

        {devicesData && !devicesData.configured && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 text-sm text-amber-800">
              Govee API key not configured on the server. Set <code>GOVEE_API_KEY</code> to enable sensor monitoring.
            </CardContent>
          </Card>
        )}

        {/* System-health hero */}
        {summary && summary.total > 0 && (
          <Card className="overflow-hidden rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sensors monitored</p>
                  <p className="mt-0.5 text-4xl font-bold leading-none tabular-nums text-foreground">{summary.total}</p>
                </div>
                {summary.propertiesNeedingInspection > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                    <Building2 className="h-3.5 w-3.5" /> {summary.propertiesNeedingInspection} propert{summary.propertiesNeedingInspection === 1 ? "y" : "ies"} need inspection
                  </span>
                )}
              </div>

              {/* Segmented health bar */}
              <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                {SEGMENTS.map((seg) => {
                  const v = (summary as any)[seg.key] as number;
                  const pct = summary.total > 0 ? (v / summary.total) * 100 : 0;
                  return pct > 0 ? <div key={seg.key} style={{ width: `${pct}%`, backgroundColor: seg.color }} /> : null;
                })}
              </div>

              {/* Legend */}
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                {SEGMENTS.map((seg) => (
                  <span key={seg.key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seg.color }} />
                    <span className="font-semibold tabular-nums text-foreground">{(summary as any)[seg.key]}</span> {seg.label}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Open alerts — prominent when present */}
        {alerts.length > 0 && (
          <Card className="rounded-2xl border-red-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-red-700">
                <AlertTriangle className="h-4 w-4" /> Open alerts ({alerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AlertsList alerts={alerts} onCreateWorkOrder={(id) => createWorkOrder.mutate(id)} />
            </CardContent>
          </Card>
        )}

        {/* Sensors — the main event */}
        {sensorsLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[0, 1].map((i) => <div key={i} className="h-64 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : sensors.length === 0 ? (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#711419]/10">
                <Thermometer className="h-7 w-7 text-[#711419]" />
              </span>
              <h3 className="text-lg font-semibold text-foreground">No sensors yet</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Add a Govee H5103 to your account, then click <span className="font-medium">Sync now</span> to discover it here.
              </p>
              <Button onClick={() => sync.mutate()} disabled={sync.isPending} className="mt-5 bg-[#711419] hover:bg-[#5a1014]">
                <RefreshCw className={cn("mr-1.5 h-4 w-4", sync.isPending && "animate-spin")} /> Sync now
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {groups.map((g) => {
              if (g.title === "Unassigned sensors") {
                return (
                  <div key={g.title}>
                    <div className="mb-2 flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-amber-500" />
                      <h2 className="text-sm font-semibold text-foreground">Unassigned sensors</h2>
                      <span className="text-xs text-muted-foreground">({g.sensors.length})</span>
                    </div>
                    <Card className="rounded-2xl border-dashed">
                      <CardContent className="p-3">
                        <p className="mb-2 px-1 text-xs text-muted-foreground">Map these to a property to start tracking them.</p>
                        <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
                          {g.sensors.map((s) => (
                            <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">{s.label || s.deviceName || "Unnamed sensor"}</p>
                                <p className="text-xs tabular-nums text-muted-foreground">
                                  {s.humidity != null ? `${Math.round(s.humidity)}% humidity` : "—"} ·{" "}
                                  {s.temperatureF != null ? `${Math.round(s.temperatureF)}°F` : "—"}
                                </p>
                              </div>
                              <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => setMapping(s)}>
                                Map sensor
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              }
              return (
                <div key={g.title}>
                  <div className="mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-[#711419]" />
                    <h2 className="truncate text-sm font-semibold text-foreground">{g.title}</h2>
                    <span className="text-xs text-muted-foreground">
                      {g.sensors.length} sensor{g.sensors.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {g.sensors.map((s) => (
                      <SensorCard key={s.id} sensor={s} onClick={() => setDetail(s)} />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Manage devices */}
            {sensors.length > 0 && (
              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Settings2 className="h-4 w-4 text-muted-foreground" /> Manage devices
                    {unmappedDevices.length > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        {unmappedDevices.length} unmapped
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {sensors.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                      <span className="truncate">
                        {s.label || s.deviceName}
                        {!s.customerId && <span className="ml-1 text-[10px] font-medium text-amber-600">unmapped</span>}
                      </span>
                      <Button size="sm" variant="ghost" className="h-7 shrink-0 text-xs" onClick={() => setMapping(s)}>Map</Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Sensor detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail.label || detail.deviceName}
                  <RiskBadge risk={detail.risk} />
                </DialogTitle>
              </DialogHeader>
              <div className="mb-2 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[#711419]/5 p-4">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#711419]">
                    <Droplets className="h-4 w-4" /> Humidity
                  </div>
                  <p className="mt-1 text-4xl font-bold tabular-nums text-[#711419]">
                    {detail.humidity != null ? `${Math.round(detail.humidity)}%` : "—"}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <Thermometer className="h-4 w-4" /> Temperature
                  </div>
                  <p className="mt-1 text-4xl font-bold tabular-nums text-slate-800">
                    {detail.temperatureF != null ? `${Math.round(detail.temperatureF)}°F` : "—"}
                  </p>
                </div>
              </div>
              <div className="mb-3 flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => { setMapping(detail); setDetail(null); }}>
                  Edit mapping
                </Button>
                <Button
                  size="sm"
                  className="bg-[#711419] hover:bg-[#5a1014]"
                  onClick={() => createWorkOrder.mutate(detail.id)}
                  disabled={!detail.customerId || createWorkOrder.isPending}
                >
                  Create Work Order
                </Button>
              </div>
              <SensorTrendChart readingsUrl={`/api/crm/sensors/${detail.id}/readings`} thresholds={detail.thresholds} />
            </>
          )}
        </DialogContent>
      </Dialog>

      <SensorMappingDialog sensor={mapping} open={!!mapping} onOpenChange={(o) => !o && setMapping(null)} />
    </CrmLayout>
  );
}
