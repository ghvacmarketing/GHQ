import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, BellOff, BellRing, ExternalLink, Loader2, RefreshCw, Thermometer } from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  SensorMappingDialog,
  prettyLocation,
  type SensorView,
} from "@/components/analytics/sensor-widgets";
import { SENSOR_NOTIFY_ROLE_OPTIONS, type SensorAlertSettings } from "@shared/govee";

/** Settings → Sensors — everything about environment monitoring in one place:
 *  which devices are watched, per-sensor thresholds/mapping, who gets alert
 *  notifications, and the anti-spam timing (offline grace + cooldowns). */

type AlertHistoryRow = {
  id: string;
  sensorId: string;
  type: string;
  severity: "watch" | "high" | "critical";
  message: string;
  status: "open" | "acknowledged" | "resolved";
  openedAt: string | null;
  resolvedAt: string | null;
  sensorLabel: string | null;
  notified: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  supervisor: "Supervisor",
  sales: "Sales",
  tech: "Tech",
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  offline: "Offline",
  humidity_critical: "Humidity critical",
  humidity_high_sustained: "Humidity high (2h)",
  temp_low: "Temp low",
  temp_high: "Temp high",
};

const severityChip: Record<AlertHistoryRow["severity"], string> = {
  watch: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const statusChip: Record<AlertHistoryRow["status"], string> = {
  open: "bg-red-100 text-red-700",
  acknowledged: "bg-blue-100 text-blue-700",
  resolved: "bg-slate-100 text-slate-500",
};

export default function CrmSettingsSensors() {
  usePageTitle("Sensors");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [editing, setEditing] = useState<SensorView | null>(null);

  // ── Alert policy form ──
  const [roles, setRoles] = useState<string[]>([]);
  const [offlineOpen, setOfflineOpen] = useState("30");
  const [offlineResolve, setOfflineResolve] = useState("10");
  const [offlineCooldown, setOfflineCooldown] = useState("6");
  const [thresholdCooldown, setThresholdCooldown] = useState("1");
  const [seeded, setSeeded] = useState(false);

  const { data: settingsData } = useQuery<{ configured: boolean; settings: SensorAlertSettings }>({
    queryKey: ["/api/crm/sensor-settings"],
    queryFn: async () => {
      const res = await fetch("/api/crm/sensor-settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load sensor settings");
      return res.json();
    },
  });

  useEffect(() => {
    if (settingsData?.settings && !seeded) {
      setSeeded(true);
      setRoles(settingsData.settings.notifyRoles);
      setOfflineOpen(String(settingsData.settings.offlineOpenMinutes));
      setOfflineResolve(String(settingsData.settings.offlineResolveMinutes));
      setOfflineCooldown(String(settingsData.settings.offlineCooldownHours));
      setThresholdCooldown(String(settingsData.settings.thresholdCooldownHours));
    }
  }, [settingsData, seeded]);

  const { data: sensorsData, isLoading: sensorsLoading } = useQuery<{ sensors: SensorView[] }>({
    queryKey: ["/api/crm/sensors"],
    queryFn: async () => {
      const res = await fetch("/api/crm/sensors", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load sensors");
      return res.json();
    },
  });

  const { data: alertsData } = useQuery<{ alerts: AlertHistoryRow[] }>({
    queryKey: ["/api/crm/sensors/alerts/history"],
    queryFn: async () => {
      const res = await fetch("/api/crm/sensors/alerts/history?limit=30", { credentials: "include" });
      if (!res.ok) return { alerts: [] };
      return res.json();
    },
  });

  const saveSettings = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/crm/sensor-settings", {
        notifyRoles: roles,
        offlineOpenMinutes: Number(offlineOpen),
        offlineResolveMinutes: Number(offlineResolve),
        offlineCooldownHours: Number(offlineCooldown),
        thresholdCooldownHours: Number(thresholdCooldown),
      });
      return res.json() as Promise<{ settings: SensorAlertSettings }>;
    },
    onSuccess: (d) => {
      // Re-seed from the server's sanitized values so clamped inputs snap back.
      setRoles(d.settings.notifyRoles);
      setOfflineOpen(String(d.settings.offlineOpenMinutes));
      setOfflineResolve(String(d.settings.offlineResolveMinutes));
      setOfflineCooldown(String(d.settings.offlineCooldownHours));
      setThresholdCooldown(String(d.settings.thresholdCooldownHours));
      queryClient.invalidateQueries({ queryKey: ["/api/crm/sensor-settings"] });
      toast({ title: "Alert settings saved", description: "The poller picks them up within a minute." });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't save settings", variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/crm/sensors/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/crm/sensors"] }),
    onError: (e: any) => toast({ title: e?.message || "Couldn't update the sensor", variant: "destructive" }),
  });

  const sync = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/crm/govee/sync", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/sensors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/sensors/alerts/history"] });
      toast({ title: "Sync complete" });
    },
    onError: (e: any) => toast({ title: e?.message || "Sync failed", variant: "destructive" }),
  });

  const sensors = sensorsData?.sensors ?? [];
  const alerts = alertsData?.alerts ?? [];
  const online = sensors.filter((s) => s.isActive && s.online === true).length;
  const offline = sensors.filter((s) => s.isActive && s.online === false).length;
  const openAlerts = alerts.filter((a) => a.status === "open").length;

  const toggleRole = (role: string) =>
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));

  const thresholdSummary = (s: SensorView) => {
    const t = s.thresholds;
    const rh = t.humidityHigh != null || t.humidityCritical != null
      ? `RH ${t.humidityHigh ?? "—"}/${t.humidityCritical ?? "—"}%`
      : "RH off";
    const low = t.tempLowF != null ? `${t.tempLowF}°` : "—";
    const high = t.tempHighF != null ? `${t.tempHighF}°` : "—";
    const temp = t.tempLowF == null && t.tempHighF == null ? "temp off" : `${low}–${high}F`;
    return `${rh} · ${temp}`;
  };

  return (
    <CrmLayout>
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/crm/settings")} data-testid="button-back-settings">
            <ArrowLeft className="mr-1 h-4 w-4" /> Settings
          </Button>
        </div>

        {/* ── Overview ── */}
        <Card className="rounded-[4px] border-slate-300/70 shadow-none">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Thermometer className="h-5 w-5 text-[#711419]" /> Environment Sensors
              </CardTitle>
              <CardDescription className="mt-1">
                Govee temp/humidity sensors polled every minute, around the clock. Live dashboard:{" "}
                <Link href="/crm/analytics" className="inline-flex items-center gap-0.5 font-medium text-[#711419] hover:underline">
                  Environment Monitoring <ExternalLink className="h-3 w-3" />
                </Link>
              </CardDescription>
            </div>
            <Button
              onClick={() => sync.mutate()}
              disabled={sync.isPending || settingsData?.configured === false}
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              data-testid="button-sensors-sync"
            >
              {sync.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              Sync now
            </Button>
          </CardHeader>
          <CardContent>
            {settingsData?.configured === false && (
              <p className="mb-3 rounded-[3px] border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                GOVEE_API_KEY isn't set on the server — add it in the Render environment and redeploy to enable polling.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Sensors", sensors.length],
                ["Online", online],
                ["Offline", offline],
                ["Open alerts", openAlerts],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-[4px] border border-slate-300/70 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Alert notifications ── */}
        <Card className="rounded-[4px] border-slate-300/70 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Alert notifications</CardTitle>
            <CardDescription>
              Who gets notified and how aggressively. Alerts always appear on the dashboard — these settings only
              control notifications (in-app + phone push).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Notify these roles</Label>
              <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2">
                {SENSOR_NOTIFY_ROLE_OPTIONS.map((role) => (
                  <label key={role} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <Checkbox
                      checked={roles.includes(role)}
                      onCheckedChange={() => toggleRole(role)}
                      data-testid={`notify-role-${role}`}
                    />
                    {ROLE_LABELS[role] ?? role}
                  </label>
                ))}
              </div>
              {roles.length === 0 ? (
                <p className="mt-2 flex items-center gap-1.5 rounded-[3px] border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <BellOff className="h-3.5 w-3.5 shrink-0" /> No one will receive sensor alert notifications.
                </p>
              ) : (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <BellRing className="h-3 w-3" /> Active users with these roles get every sensor alert.
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label className="text-xs text-muted-foreground">Offline after (min)</Label>
                <Input value={offlineOpen} onChange={(e) => setOfflineOpen(e.target.value.replace(/[^0-9]/g, ""))} data-testid="input-offline-open" />
                <p className="mt-1 text-[11px] text-muted-foreground">Continuously offline this long before an alert opens.</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Back online after (min)</Label>
                <Input value={offlineResolve} onChange={(e) => setOfflineResolve(e.target.value.replace(/[^0-9]/g, ""))} data-testid="input-offline-resolve" />
                <p className="mt-1 text-[11px] text-muted-foreground">Continuously online this long before the alert clears.</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Offline cooldown (hrs)</Label>
                <Input value={offlineCooldown} onChange={(e) => setOfflineCooldown(e.target.value.replace(/[^0-9]/g, ""))} data-testid="input-offline-cooldown" />
                <p className="mt-1 text-[11px] text-muted-foreground">Max one offline notification per sensor per window. 0 = every alert.</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Temp/RH cooldown (hrs)</Label>
                <Input value={thresholdCooldown} onChange={(e) => setThresholdCooldown(e.target.value.replace(/[^0-9]/g, ""))} data-testid="input-threshold-cooldown" />
                <p className="mt-1 text-[11px] text-muted-foreground">Same, for temperature and humidity alerts.</p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-[11px] leading-relaxed text-slate-600">
              <p className="text-xs font-semibold text-slate-700">How alerting works</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>Brief offline blips are ignored — only a sustained outage alerts, and one good reading mid-outage won't close it.</li>
                <li>Temp/humidity thresholds are set per sensor (button on each row below); a blank threshold turns that alert off.</li>
                <li>Threshold alerts clear only after the reading moves 2 points past the line, so hovering at the limit can't re-alert repeatedly.</li>
                <li>Acknowledging an alert on the dashboard silences it without closing it; it resolves itself once the condition clears.</li>
              </ul>
            </div>

            <div className="flex justify-end">
              <Button
                className="bg-[#711419] hover:bg-[#8a1a1f]"
                onClick={() => saveSettings.mutate()}
                disabled={saveSettings.isPending || !seeded}
                data-testid="button-save-alert-settings"
              >
                {saveSettings.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Save alert settings
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Sensors ── */}
        <Card className="rounded-[4px] border-slate-300/70 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Sensors</CardTitle>
            <CardDescription>
              Every discovered device. Paused sensors aren't polled and never alert. "Settings" edits the name,
              location, customer mapping, thresholds, and calibration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sensorsLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : sensors.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                No sensors discovered yet — add the device in the Govee app, then "Sync now".
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sensor</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Reading</TableHead>
                    <TableHead>Thresholds</TableHead>
                    <TableHead>Monitoring</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sensors.map((s) => (
                    <TableRow key={s.id} className={cn(!s.isActive && "opacity-55")} data-testid={`sensor-row-${s.id}`}>
                      <TableCell>
                        <p className="text-sm font-medium text-slate-900">{s.label || s.deviceName || "Unnamed sensor"}</p>
                        <p className="text-[11px] text-slate-400">{s.sku}</p>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{prettyLocation(s.locationType) || "—"}</TableCell>
                      <TableCell className="text-sm">
                        {s.customerName || <span className="text-[11px] font-medium uppercase text-amber-600">unmapped</span>}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm tabular-nums text-slate-800">
                          {s.temperatureF != null ? `${Math.round(s.temperatureF)}°F` : "—"}
                          {s.humidity != null ? ` · ${Math.round(s.humidity)}%` : ""}
                        </span>
                        <span
                          className={cn(
                            "ml-2 inline-block h-2 w-2 rounded-full align-middle",
                            s.online === true ? "bg-emerald-500" : s.online === false ? "bg-red-500" : "bg-slate-300",
                          )}
                          title={s.online === true ? "Online" : s.online === false ? "Offline" : "No data"}
                        />
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-slate-500">{thresholdSummary(s)}</TableCell>
                      <TableCell>
                        <Switch
                          checked={s.isActive}
                          onCheckedChange={(v) => toggleActive.mutate({ id: s.id, isActive: v })}
                          data-testid={`sensor-active-${s.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setEditing(s)}
                          data-testid={`sensor-settings-${s.id}`}
                        >
                          Settings
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ── Recent alerts ── */}
        <Card className="rounded-[4px] border-slate-300/70 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Recent alerts</CardTitle>
            <CardDescription>
              The last 30 alerts and whether each one sent a notification or was muted by a cooldown.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No alerts yet — that's a good thing.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">When</TableHead>
                    <TableHead>Sensor</TableHead>
                    <TableHead>Alert</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Notified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.map((a) => (
                    <TableRow key={a.id} data-testid={`alert-row-${a.id}`}>
                      <TableCell className="whitespace-nowrap text-xs text-slate-500">
                        {a.openedAt ? format(new Date(a.openedAt), "MMM d, h:mm a") : "—"}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{a.sensorLabel || "Unknown"}</TableCell>
                      <TableCell>
                        <p className="text-sm text-slate-800">{ALERT_TYPE_LABELS[a.type] || a.type}</p>
                        <p className="text-[11px] text-slate-500">{a.message}</p>
                      </TableCell>
                      <TableCell>
                        <span className={cn("rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", severityChip[a.severity])}>
                          {a.severity}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={cn("rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", statusChip[a.status])}>
                          {a.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {a.notified ? (
                          <span className="font-medium text-emerald-600">sent</span>
                        ) : (
                          <span className="text-slate-400">muted</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <SensorMappingDialog sensor={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </CrmLayout>
  );
}
