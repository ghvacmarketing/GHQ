import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Activity, RefreshCw, Droplets, AlertTriangle, WifiOff, Building2, Settings2 } from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CrmUser } from "@shared/schema";
import {
  SensorCard,
  SensorTrendChart,
  RiskBadge,
  AlertsList,
  SensorMappingDialog,
  type SensorView,
  type SensorAlert,
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

function SummaryStat({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: any }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}1a` }}>
            <Icon className="h-4 w-4" style={{ color }} />
          </span>
        </div>
        <p className="mt-2 text-3xl font-semibold leading-none tabular-nums text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

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

  if (!currentUser) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="w-full space-y-5 pb-8">
        {/* Header — title + subheading · action (icon lives in the nav) */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Analytics</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Humidity &amp; temperature monitoring · Govee H5103</p>
          </div>
          <Button onClick={() => sync.mutate()} disabled={sync.isPending} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-1.5 ${sync.isPending ? "animate-spin" : ""}`} />
            Sync now
          </Button>
        </div>

        {devicesData && !devicesData.configured && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 text-sm text-amber-800">
              Govee API key not configured on the server. Set <code>GOVEE_API_KEY</code> to enable sensor monitoring.
            </CardContent>
          </Card>
        )}

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryStat label="Sensors" value={summary.total} color="#711419" icon={Droplets} />
            <SummaryStat label="Watch" value={summary.watch} color="#d97706" icon={Activity} />
            <SummaryStat label="High" value={summary.high} color="#ea580c" icon={AlertTriangle} />
            <SummaryStat label="Critical" value={summary.critical} color="#b91c1c" icon={AlertTriangle} />
            <SummaryStat label="Offline" value={summary.offline} color="#64748b" icon={WifiOff} />
            <SummaryStat label="Need inspection" value={summary.propertiesNeedingInspection} color="#0ea5e9" icon={Building2} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Sensors grouped by property */}
          <div className="lg:col-span-2 space-y-5">
            {sensorsLoading ? (
              <div className="text-sm text-slate-400 py-10 text-center">Loading sensors…</div>
            ) : sensors.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-sm text-slate-500">
                  No sensors yet. Click <span className="font-medium">Sync now</span> to discover your Govee devices,
                  then map them below.
                </CardContent>
              </Card>
            ) : (
              groups.map((g) => {
                const isUnassigned = g.title === "Unassigned sensors";
                if (isUnassigned) {
                  return (
                    <Card key={g.title} className="rounded-xl border-dashed">
                      <CardContent className="p-4">
                        <p className="text-sm font-semibold text-slate-700">Unassigned sensors ({g.sensors.length})</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          These sensors aren&apos;t mapped to a property yet. Map one to start tracking it.
                        </p>
                        <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
                          {g.sensors.map((s) => (
                            <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">
                                  {s.label || s.deviceName || "Unnamed sensor"}
                                </p>
                                <p className="text-xs tabular-nums text-muted-foreground">
                                  {s.humidity != null ? `${Math.round(s.humidity)}%` : "—"} ·{" "}
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
                  );
                }
                return (
                  <div key={g.title}>
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="h-4 w-4 text-slate-400" />
                      <h2 className="text-sm font-semibold text-slate-700">{g.title}</h2>
                      <span className="text-xs text-slate-400">({g.sensors.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {g.sensors.map((s) => (
                        <SensorCard key={s.id} sensor={s} onClick={() => setDetail(s)} />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right column: alerts + devices to map */}
          <div className="space-y-4">
            <Card className="rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-[#711419]" /> Open alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AlertsList alerts={alertsData?.alerts || []} onCreateWorkOrder={(id) => createWorkOrder.mutate(id)} />
              </CardContent>
            </Card>

            <Card className="rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-[#711419]" /> Devices
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {unmappedDevices.length > 0 && (
                  <p className="text-xs text-amber-600 mb-1">{unmappedDevices.length} device(s) not yet mapped</p>
                )}
                {sensors.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">
                      {s.label || s.deviceName}
                      {!s.customerId && <span className="ml-1 text-[10px] text-amber-600">unmapped</span>}
                    </span>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setMapping(s)}>
                      Map
                    </Button>
                  </div>
                ))}
                {sensors.length === 0 && <p className="text-xs text-slate-400">No devices discovered yet.</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Sensor detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail.label || detail.deviceName}
                  <RiskBadge risk={detail.risk} />
                </DialogTitle>
              </DialogHeader>
              <div className="flex items-center gap-6 mb-2">
                <div>
                  <p className="text-3xl font-bold tabular-nums" style={{ color: "#711419" }}>
                    {detail.humidity != null ? `${Math.round(detail.humidity)}%` : "—"}
                  </p>
                  <p className="text-xs text-slate-500">Humidity</p>
                </div>
                <div>
                  <p className="text-3xl font-bold tabular-nums text-sky-600">
                    {detail.temperatureF != null ? `${Math.round(detail.temperatureF)}°F` : "—"}
                  </p>
                  <p className="text-xs text-slate-500">Temperature</p>
                </div>
                <div className="ml-auto flex gap-2">
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
