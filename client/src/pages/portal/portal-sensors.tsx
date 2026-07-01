import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Building2, Droplets, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PortalLayout } from "./portal-layout";
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
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/portal/dashboard")} className="text-slate-500">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-[#711419]" />
            <h1 className="text-2xl font-bold text-slate-900">Environment Monitoring</h1>
          </div>
        </div>
        <p className="text-sm text-slate-500">
          Live humidity and temperature from the sensors at your property.
        </p>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : sensors.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-slate-500">
              No sensors are set up for your property yet. Contact us if you'd like remote humidity
              monitoring installed.
            </CardContent>
          </Card>
        ) : (
          groups.map((g) => (
            <div key={g.title}>
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-700">{g.title}</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {g.sensors.map((s) => (
                  <SensorCard key={s.id} sensor={s} onClick={() => setDetail(s)} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

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
              </div>
              <SensorTrendChart readingsUrl={`/api/portal/sensors/${detail.id}/readings`} thresholds={detail.thresholds} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
