import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Building2, ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PortalLayout, PortalHeader } from "./portal-layout";
import {
  SensorCard,
  SensorTrendChart,
  RiskBadge,
  type SensorView,
} from "@/components/analytics/sensor-widgets";

export default function PortalSensors() {
  const [, setLocation] = useLocation();
  const [detail, setDetail] = useState<SensorView | null>(null);

  const { data: customer, error: customerError } = useQuery<{ id: string; name: string }>({
    queryKey: ["/api/portal/auth/me"],
    retry: false,
  });
  const { data, isLoading } = useQuery<{ sensors: SensorView[] }>({
    queryKey: ["/api/portal/sensors"],
    enabled: !!customer,
    retry: false,
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (customerError) setLocation("/portal/login");
  }, [customerError, setLocation]);

  const sensors = data?.sensors || [];
  const groups = useMemo(() => {
    const map = new Map<string, { title: string; sensors: SensorView[] }>();
    for (const s of sensors) {
      const key = s.propertyAddress || "My property";
      if (!map.has(key)) map.set(key, { title: key, sensors: [] });
      map.get(key)!.sensors.push(s);
    }
    return Array.from(map.values());
  }, [sensors]);

  return (
    <PortalLayout>
      {/* Not a tab — a frosted back bubble returns Home, like the app's sub-pages */}
      <button
        onClick={() => setLocation("/portal/dashboard")}
        className="liquid-glass mb-4 flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-transform active:scale-95"
        aria-label="Back to dashboard"
        data-testid="button-back"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <PortalHeader
        title="Environment Monitoring"
        subtitle="Live humidity and temperature from the sensors at your property"
      />

      <div className="space-y-5">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="skeleton-shimmer h-40 rounded-[4px] bg-slate-200" />
            <div className="skeleton-shimmer h-40 rounded-[4px] bg-slate-200" style={{ "--shimmer-delay": "0.08s" } as React.CSSProperties} />
          </div>
        ) : sensors.length === 0 ? (
          <div className="rounded-[4px] border border-slate-300/70 bg-white p-8 text-center text-sm text-slate-500">
            No sensors are set up for your property yet. Contact us if you'd like remote humidity
            monitoring installed.
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.title}>
              <div className="mb-2 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-400" />
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.title}</h2>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {g.sensors.map((s) => (
                  <SensorCard key={s.id} sensor={s} onClick={() => setDetail(s)} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

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
              <div className="mb-2 flex items-center gap-6">
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
              </div>
              <SensorTrendChart readingsUrl={`/api/portal/sensors/${detail.id}/readings`} thresholds={detail.thresholds} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
