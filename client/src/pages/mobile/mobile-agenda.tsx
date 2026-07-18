import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import { format, isToday, formatDistanceToNow } from "date-fns";
import { getLocalStartOfDay, getLocalEndOfDay, formatLocal, toLocalTime } from "@/lib/timezone";
import { MapPin, Clock, ClipboardList, WifiOff, CloudOff, LogIn, User, DollarSign, TrendingUp, Wrench, FileText, Users, Target, CheckCircle, XCircle, MessageSquare, Phone, Navigation, ChevronRight, Thermometer, Droplets, Wind, Settings, AlertTriangle, Calendar, Bell, Monitor } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import MobileShell from "./mobile-shell";
import { useOnlineStatus, OfflineIndicator, usePendingChanges } from "@/hooks/use-online-status";
import { PerformanceGauge } from "@/components/ui/performance-gauge";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { statusDotColor } from "@/components/ui/status-dot";
import type { CrmWorkOrder, CrmCustomer, CrmProperty, CrmUser } from "@shared/schema";

interface WorkOrderWithDetails extends CrmWorkOrder {
  customer: CrmCustomer | null;
  property: CrmProperty | null;
}

type WeeklyRevenue = { label: string; revenue: number; current: boolean };
type InvoicingSummary = { collected: number; outstanding: number; openCount: number };

interface TechPerformance {
  role: "tech";
  weeklyRevenue?: WeeklyRevenue[];
  invoicing?: InvoicingSummary;
  dayOfMonth?: number;
  daysInMonth?: number;
  serviceRevenue: number;
  quotedAmount: number;
  serviceJobs: number;
  perTicketAvg: number;
  maintenanceAgreements: number;
  goal: number;
  goalTarget: number;
}

interface SalesPerformance {
  role: "sales";
  weeklyRevenue?: WeeklyRevenue[];
  dayOfMonth?: number;
  daysInMonth?: number;
  leadsReceived: number;
  salesVisits: number;
  quotesGenerated: number;
  averageSale: number;
  closingRate: number;
  wonCount: number;
  negotiatingCount: number;
  lostCount: number;
  sold: number;
  quoted: number;
  goal: number;
}

type PerformanceData = TechPerformance | SalesPerformance | { role: string; message?: string };

const statusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-slate-100 text-slate-700 border-slate-300" },
  dispatched: { label: "Dispatched", className: "bg-blue-100 text-blue-700 border-blue-300" },
  en_route: { label: "Traveling", className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  on_site: { label: "Working", className: "bg-green-100 text-green-700 border-green-300" },
  completed: { label: "Completed", className: "bg-slate-200 text-slate-600 border-slate-400" },
};

const roleLabels: Record<string, { label: string; className: string }> = {
  owner: { label: "Owner", className: "bg-purple-100 text-purple-700" },
  admin: { label: "Admin", className: "bg-blue-100 text-blue-700" },
  supervisor: { label: "Supervisor", className: "bg-indigo-100 text-indigo-700" },
  sales: { label: "Sales", className: "bg-green-100 text-green-700" },
  tech: { label: "Technician", className: "bg-orange-100 text-orange-700" },
};

function formatScheduledTime(start: string | Date | null, end: string | Date | null): string {
  if (!start) return "Not scheduled";
  const startTime = formatLocal(start, "h:mm a");
  if (!end) return startTime;
  const endTime = formatLocal(end, "h:mm a");
  return `${startTime} - ${endTime}`;
}

function getPropertyAddress(property: CrmProperty | null): string {
  if (!property) return "No address";
  const parts = [property.address1, property.city, property.state].filter(Boolean);
  return parts.join(", ") || "No address";
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function GlobalPendingChangesIndicator() {
  const pendingCount = usePendingChanges();
  
  if (pendingCount === 0) return null;
  
  return (
    <div 
      className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-full"
      data-testid="global-pending-changes"
    >
      <CloudOff className="h-3 w-3" />
      {pendingCount} change{pendingCount !== 1 ? 's' : ''} pending sync
    </div>
  );
}

function RingStat({ pct, center, label, sub, color = "#711419" }: {
  pct: number; center: string; label: string; sub?: string; color?: string;
}) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div className="flex flex-col items-center rounded-2xl bg-white px-2 py-4 shadow-sm">
      <div className="relative h-16 w-16">
        <svg viewBox="0 0 60 60" className="h-16 w-16 -rotate-90">
          <circle cx="30" cy="30" r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
          <circle
            cx="30" cy="30" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${c * clamped} ${c}`}
            className="transition-[stroke-dasharray] duration-700"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-900">{center}</span>
      </div>
      <p className="mt-1.5 text-center text-xs font-semibold text-slate-700">{label}</p>
      {sub && <p className="text-center text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function WeeklyBars({ weeks }: { weeks: WeeklyRevenue[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.revenue));
  const best = weeks.reduce((b, w) => (w.revenue > (b?.revenue ?? -1) && !w.current ? w : b), null as WeeklyRevenue | null);
  const fmtK = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`);
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm" data-testid="perf-weekly">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#711419]">Revenue by Week</p>
        {best && best.revenue > 0 && (
          <p className="text-[11px] font-semibold text-[#711419]">best: {best.label.toLowerCase()}</p>
        )}
      </div>
      <div className="mt-3 flex items-end gap-2" style={{ height: 96 }}>
        {weeks.map((w) => {
          const h = Math.max(10, Math.round((w.revenue / max) * 64));
          const isBest = best && w.label === best.label && w.revenue > 0;
          return (
            <div key={w.label} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-xs font-bold text-slate-700">{fmtK(w.revenue)}</span>
              <div
                className={`w-full rounded-lg ${
                  w.current
                    ? "bg-[repeating-linear-gradient(45deg,#e9d5c8,#e9d5c8_5px,#f6ede6_5px,#f6ede6_10px)]"
                    : isBest
                      ? "bg-[#711419]"
                      : "bg-slate-200"
                }`}
                style={{ height: h }}
              />
              <span className={`text-[10px] font-semibold ${w.current ? "text-[#711419]" : "text-slate-400"}`}>{w.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InvoicingBar({ inv }: { inv: InvoicingSummary }) {
  const total = inv.collected + inv.outstanding;
  const pct = total > 0 ? Math.round((inv.collected / total) * 100) : 100;
  const fmt = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm" data-testid="perf-invoicing">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#711419]">Invoicing</p>
        <p className="text-xs font-bold text-green-600">{pct}% collected</p>
      </div>
      <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        <span className="rounded-l-full bg-green-600" style={{ width: `${pct}%` }} />
        <span className="bg-amber-500" style={{ width: `${100 - pct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">{fmt(inv.collected)} collected</span>
        <span className="font-semibold text-amber-600">
          {fmt(inv.outstanding)} outstanding{inv.openCount > 0 ? ` · ${inv.openCount} invoice${inv.openCount === 1 ? "" : "s"}` : ""}
        </span>
      </div>
    </div>
  );
}

function greetingForHour(h: number): string {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

type NotificationItem = {
  id: string;
  title: string;
  preview: string | null;
  entityType: string | null;
  isRead: boolean;
  createdAt: string | null;
};

function ProfileHeader({ user }: { user: CrmUser }) {
  const [, navigate] = useLocation();
  const [now, setNow] = useState(new Date());
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Field-relevant notifications only: things that touch the technician's
  // day (job assignments, schedule changes, tasks) - not CRM admin noise.
  const { data: notifications } = useQuery<NotificationItem[]>({
    queryKey: ["/api/crm/notifications", "mobile-bell"],
    queryFn: async () => {
      const res = await fetch("/api/crm/notifications?limit=30", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load notifications");
      return res.json();
    },
    refetchInterval: 60 * 1000,
  });
  const fieldNotifs = (notifications || []).filter((n) =>
    n.entityType === "work_order" || n.entityType === "task",
  );
  const unreadField = fieldNotifs.filter((n) => !n.isRead);
  const unreadCount = unreadField.length;

  const markAllRead = async () => {
    await Promise.all(
      unreadField.map((n) =>
        fetch(`/api/crm/notifications/${n.id}/read`, { method: "PATCH", credentials: "include" }),
      ),
    );
    queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications", "mobile-bell"] });
    queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications/unread-count"] });
  };

  const initials = user.name
    ? user.name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")
    : null;
  const roleConfig = roleLabels[user.role] || roleLabels.tech;

  return (
    <div className="flex items-center justify-between" data-testid="profile-header">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100" data-testid="text-greeting">
          {greetingForHour(now.getHours())}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{format(now, "EEEE, MMM d")}</p>
      </div>

      {/* Bell + avatar share one frosted bubble */}
      <div className="flex items-center rounded-full border border-slate-900/10 bg-white/85 shadow-sm backdrop-blur-xl dark:bg-slate-800">
        <button
          onClick={() => setNotifOpen(true)}
          className="relative flex h-11 w-12 items-center justify-center rounded-l-full text-slate-600 outline-none transition-transform focus:outline-none active:scale-95"
          style={{ WebkitTapHighlightColor: "transparent" }}
          data-testid="button-notifications"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        <span className="h-6 w-px bg-slate-200 dark:bg-slate-600" aria-hidden />
        <button
          onClick={() => navigate("/mobile/profile")}
          className="flex h-11 w-12 items-center justify-center rounded-r-full outline-none transition-transform focus:outline-none active:scale-95"
          style={{ WebkitTapHighlightColor: "transparent" }}
          data-testid="button-profile-menu"
          aria-label="Profile menu"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#711419] text-xs font-bold text-white shadow-sm">
            {initials || <User className="h-4 w-4" />}
          </span>
        </button>
      </div>

      {/* Notifications sheet */}
      <DraggableSheet open={notifOpen} onOpenChange={setNotifOpen} title="Notifications" testid="sheet-notifications">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-base font-semibold text-slate-800">Notifications</span>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs font-medium text-[#711419]" data-testid="button-mark-all-read">
              Mark all read
            </button>
          )}
        </div>
        <div className="-mx-5 max-h-[55vh] overflow-y-auto px-5">
          {fieldNotifs.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">You&apos;re all caught up.</p>
          ) : (
            fieldNotifs.map((n) => (
              <div
                key={n.id}
                className="border-b border-slate-100 py-3 last:border-b-0"
                data-testid={`notification-${n.id}`}
              >
                <div className="flex items-start gap-2">
                  {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#711419]" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug text-slate-800">{n.title}</p>
                    {n.preview && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.preview}</p>}
                    {n.createdAt && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </DraggableSheet>

    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  subtitle, 
  borderColor,
  icon: Icon 
}: { 
  label: string; 
  value: string | number; 
  subtitle?: string; 
  borderColor: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div 
      className={`bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm border-l-4 ${borderColor}`}
      data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" />}
        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{value}</p>
      {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
    </div>
  );
}

function TechPerformanceSection({ performance }: { performance: TechPerformance }) {
  return (
    <div className="space-y-4" data-testid="tech-performance-section">
      <div className="flex justify-center">
        <PerformanceGauge
          sold={performance.serviceRevenue}
          quoted={performance.quotedAmount}
          goal={performance.goal}
          goalTarget={performance.goalTarget}
          size={200}
        />
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Service Revenue"
          value={formatCurrency(performance.serviceRevenue)}
          subtitle={`Goal: ${formatCurrency(performance.goal)}`}
          borderColor="border-blue-500"
          icon={DollarSign}
        />
        <StatCard
          label="Per Ticket Avg"
          value={formatCurrency(performance.perTicketAvg)}
          borderColor="border-purple-500"
          icon={TrendingUp}
        />
        <StatCard
          label="Service Jobs"
          value={performance.serviceJobs}
          subtitle="MTD"
          borderColor="border-orange-500"
          icon={Wrench}
        />
        <StatCard
          label="Maint. Agreements"
          value={performance.maintenanceAgreements}
          borderColor="border-yellow-500"
          icon={FileText}
        />
      </div>
    </div>
  );
}

function SalesPerformanceSection({ performance }: { performance: SalesPerformance }) {
  return (
    <div className="space-y-4" data-testid="sales-performance-section">
      <div className="flex justify-center">
        <PerformanceGauge
          sold={performance.sold}
          quoted={performance.quoted}
          goal={performance.goal}
          size={200}
        />
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Leads Received"
          value={performance.leadsReceived}
          borderColor="border-blue-500"
          icon={Users}
        />
        <StatCard
          label="Sales Visits"
          value={performance.salesVisits}
          borderColor="border-purple-500"
          icon={MapPin}
        />
        <StatCard
          label="Quotes Generated"
          value={performance.quotesGenerated}
          borderColor="border-orange-500"
          icon={FileText}
        />
        <StatCard
          label="Average Sale"
          value={formatCurrency(performance.averageSale)}
          borderColor="border-green-500"
          icon={DollarSign}
        />
        <div className="col-span-2">
          <StatCard
            label="Closing Rate"
            value={`${performance.closingRate.toFixed(1)}%`}
            borderColor="border-teal-500"
            icon={Target}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm" data-testid="sales-pipeline">
        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Pipeline</p>
        <div className="flex gap-2">
          <div className="flex-1 bg-green-100 dark:bg-green-900/30 rounded-lg p-2 text-center" data-testid="pipeline-won">
            <div className="flex items-center justify-center gap-1 mb-1">
              <CheckCircle className="w-3.5 h-3.5 text-green-600" />
              <span className="text-xs text-green-700 dark:text-green-400 font-medium">Won</span>
            </div>
            <p className="text-lg font-bold text-green-700 dark:text-green-400">{performance.wonCount}</p>
          </div>
          <div className="flex-1 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg p-2 text-center" data-testid="pipeline-negotiating">
            <div className="flex items-center justify-center gap-1 mb-1">
              <MessageSquare className="w-3.5 h-3.5 text-yellow-600" />
              <span className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">Negotiating</span>
            </div>
            <p className="text-lg font-bold text-yellow-700 dark:text-yellow-400">{performance.negotiatingCount}</p>
          </div>
          <div className="flex-1 bg-red-100 dark:bg-red-900/30 rounded-lg p-2 text-center" data-testid="pipeline-lost">
            <div className="flex items-center justify-center gap-1 mb-1">
              <XCircle className="w-3.5 h-3.5 text-red-600" />
              <span className="text-xs text-red-700 dark:text-red-400 font-medium">Lost</span>
            </div>
            <p className="text-lg font-bold text-red-700 dark:text-red-400">{performance.lostCount}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Get icon for work type
function getWorkTypeIcon(visitType: string | null, workSubtype: string | null) {
  const subtype = (workSubtype || "").toLowerCase();
  if (subtype.includes("heat") || subtype.includes("furnace")) return Thermometer;
  if (subtype.includes("cool") || subtype.includes("ac") || subtype.includes("air")) return Wind;
  if (subtype.includes("water") || subtype.includes("leak") || subtype.includes("plumb")) return Droplets;
  if (subtype.includes("maintenance") || subtype.includes("pm")) return Settings;
  if (visitType === "SALES") return Users;
  if (visitType === "INSTALL") return Wrench;
  return Wrench;
}

// Get status accent color
function getStatusAccentColor(status: string): string {
  switch (status) {
    case "on_site": return "border-l-green-500 bg-green-50/50 dark:bg-green-900/10";
    case "en_route": return "border-l-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10";
    case "dispatched": return "border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/10";
    case "completed": return "border-l-slate-400 bg-slate-50/50 dark:bg-slate-800/50";
    default: return "border-l-slate-300";
  }
}

function WorkOrderCard({ workOrder, showCacheWarning }: { workOrder: WorkOrderWithDetails; showCacheWarning: boolean }) {
  const status = statusConfig[workOrder.status] || statusConfig.scheduled;
  const customerName = workOrder.customer?.name || "Unknown Customer";
  const customerPhone = workOrder.customer?.phone;
  const address = getPropertyAddress(workOrder.property);
  const pendingCount = usePendingChanges(workOrder.id);
  const WorkTypeIcon = getWorkTypeIcon(workOrder.visitType, workOrder.workSubtype);
  const accentColor = getStatusAccentColor(workOrder.status);
  
  const handleCall = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (customerPhone) {
      window.location.href = `tel:${customerPhone}`;
    }
  };

  const handleNavigate = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const fullAddress = [workOrder.property?.address1, workOrder.property?.city, workOrder.property?.state, workOrder.property?.zip].filter(Boolean).join(", ");
    if (fullAddress) {
      window.open(`https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`, '_blank');
    }
  };

  // Combine visual indicators for cache/offline state
  const hasCacheOrPendingWarning = showCacheWarning || pendingCount > 0;
  
  return (
    <Link
      href={`/mobile/job/${workOrder.id}`}
      data-testid={`work-order-card-${workOrder.id}`}
    >
      <Card 
        className={`cursor-pointer hover:shadow-lg transition-all active:scale-[0.98] border-l-4 overflow-hidden ${accentColor} ${
          hasCacheOrPendingWarning ? 'ring-2 ring-amber-400/50 ring-offset-1' : ''
        }`}
      >
        <CardContent className="p-0">
          {/* Main content area */}
          <div className="p-4">
            {/* Header row: Customer name + Status */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  workOrder.status === 'on_site' ? 'bg-green-100 text-green-600' :
                  workOrder.status === 'en_route' ? 'bg-yellow-100 text-yellow-600' :
                  workOrder.status === 'dispatched' ? 'bg-blue-100 text-blue-600' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  <WorkTypeIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 
                    className="font-semibold text-slate-800 dark:text-slate-200 text-base truncate"
                    data-testid={`customer-name-${workOrder.id}`}
                  >
                    {customerName}
                  </h3>
                  {workOrder.workSubtype && (
                    <p className="text-xs text-slate-500 truncate">
                      {workOrder.visitType} • {workOrder.workSubtype}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {pendingCount > 0 && (
                  <span 
                    className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded-full"
                    data-testid={`pending-badge-${workOrder.id}`}
                  >
                    <CloudOff className="h-3 w-3" />
                    {pendingCount}
                  </span>
                )}
                <Badge 
                  variant="outline" 
                  className={`font-medium ${status.className}`}
                  data-testid={`status-badge-${workOrder.id}`}
                >
                  {status.label}
                </Badge>
              </div>
            </div>

            {/* Time row - prominent display */}
            <div className="flex items-center gap-2 mb-2 p-2 bg-slate-100/80 dark:bg-slate-700/50 rounded-lg">
              <Clock className="h-4 w-4 text-slate-500 shrink-0" />
              <span className="font-medium text-slate-700 dark:text-slate-300" data-testid={`time-${workOrder.id}`}>
                {formatScheduledTime(workOrder.scheduledStart, workOrder.scheduledEnd)}
              </span>
            </div>

            {/* Address row */}
            <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
              <MapPin className="h-4 w-4 mt-0.5 text-slate-400 shrink-0" />
              <span className="line-clamp-2" data-testid={`address-${workOrder.id}`}>
                {address}
              </span>
            </div>
          </div>

          {/* Quick action buttons */}
          <div className="flex border-t border-slate-200 dark:border-slate-700 divide-x divide-slate-200 dark:divide-slate-700">
            {customerPhone && (
              <button
                onClick={handleCall}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors active:bg-blue-100"
                data-testid={`call-button-${workOrder.id}`}
              >
                <Phone className="h-4 w-4" />
                Call
              </button>
            )}
            <button
              onClick={handleNavigate}
              className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors active:bg-green-100"
              data-testid={`navigate-button-${workOrder.id}`}
            >
              <Navigation className="h-4 w-4" />
              Navigate
            </button>
            <div className="flex-1 flex items-center justify-center gap-1 py-3 text-sm font-medium text-slate-500">
              <span>Details</span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function MobileAgenda() {
  const today = new Date();
  const todayStart = getLocalStartOfDay(today).toISOString();
  const todayEnd = getLocalEndOfDay(today).toISOString();
  const { isOnline } = useOnlineStatus();
  const [isFromCache, setIsFromCache] = useState(false);
  const { data: currentUser, isLoading: isLoadingUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });

  const [, navigateMain] = useLocation();

  // Agenda is strictly YOUR day; the all-technicians roster lives on the
  // Jobs tab now.
  const shouldFilterByTech = true;

  const { data: workOrders, isLoading: isLoadingOrders, error, isError } = useQuery<WorkOrderWithDetails[]>({
    queryKey: ["/api/crm/work-orders", { dateFrom: todayStart, dateTo: todayEnd, techId: shouldFilterByTech ? currentUser?.id : undefined }],
    queryFn: async () => {
      const params = new URLSearchParams({
        dateFrom: todayStart,
        dateTo: todayEnd,
      });
      // Tech and sales users see only their assigned work orders on mobile
      // Supervisors can toggle between all or their own
      if (shouldFilterByTech && currentUser?.id) {
        params.set('techId', currentUser.id);
      }
      const res = await fetch(`/api/crm/work-orders?${params}`);
      
      const fromCache = res.headers.get('X-From-Cache') === 'true';
      setIsFromCache(fromCache);
      
      if (res.status === 401 || res.status === 403) {
        throw new Error("AUTH_REQUIRED");
      }
      if (!res.ok) throw new Error("Failed to fetch work orders");
      const data = await res.json();
      return data.workOrders || [];
    },
    enabled: !!currentUser,
    staleTime: 5 * 1000, // near-live: dispatcher changes reach techs within ~10s
    gcTime: 24 * 60 * 60 * 1000,
    refetchInterval: isOnline ? 10 * 1000 : false, // Auto-refresh every 10 seconds when online
    refetchOnWindowFocus: true, // Refresh when app comes back to foreground
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === "AUTH_REQUIRED") return false;
      if (!isOnline) return false;
      return failureCount < 3;
    },
  });

  const { data: performanceData, isLoading: isLoadingPerformance } = useQuery<PerformanceData>({
    queryKey: ["/api/crm/mobile/my-performance"],
    queryFn: async () => {
      const res = await fetch("/api/crm/mobile/my-performance", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch performance data");
      return res.json();
    },
    enabled: !!currentUser,
    staleTime: 60 * 1000, // Data considered fresh for 60 seconds
    gcTime: 24 * 60 * 60 * 1000,
    refetchInterval: isOnline ? 60 * 1000 : false, // Auto-refresh every 60 seconds when online
    refetchOnWindowFocus: true,
  });

  const isLoading = isLoadingUser || isLoadingOrders;

  const isAuthError = isError && error instanceof Error && error.message === "AUTH_REQUIRED";

  const todaysOrders = (workOrders?.filter((wo) => {
    if (!wo.scheduledStart) return false;
    const localStart = toLocalTime(wo.scheduledStart);
    return isToday(localStart);
  }) ?? []).sort((a, b) => {
    // Sort by scheduled start time (earliest first)
    const aTime = a.scheduledStart ? new Date(a.scheduledStart).getTime() : Infinity;
    const bTime = b.scheduledStart ? new Date(b.scheduledStart).getTime() : Infinity;
    return aTime - bTime;
  });

  const myJobs = todaysOrders;
  const IN_PROGRESS = ["dispatched", "en_route", "on_site"];
  const notDone = myJobs.filter((j) => j.status !== "completed" && j.status !== "cancelled");
  const upNext = notDone.find((j) => IN_PROGRESS.includes(j.status)) || notDone[0] || null;
  const laterToday = notDone.filter((j) => j.id !== upNext?.id);
  const wrappedUp = myJobs.filter((j) => j.status === "completed");
  const mapsUrl = (j: WorkOrderWithDetails) =>
    `https://maps.google.com/?q=${encodeURIComponent(getPropertyAddress(j.property))}`;

  const showCacheWarning = !isOnline || isFromCache;

  return (
    <MobileShell>
      <OfflineIndicator />
      
      <div className="p-4 space-y-6 pb-24" data-testid="mobile-agenda">
        {currentUser && <ProfileHeader user={currentUser} />}
        
        {(showCacheWarning && workOrders && workOrders.length > 0) && (
          <div className="text-center" data-testid="agenda-date-header">
            <div
              className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 rounded-full font-medium"
              data-testid="cache-warning"
            >
              <WifiOff className="h-3 w-3" />
              Showing cached data
            </div>
          </div>
        )}
        <GlobalPendingChangesIndicator />

        {isAuthError ? (
          <div 
            className="flex flex-col items-center justify-center py-16 text-center"
            data-testid="agenda-auth-required"
          >
            <LogIn className="h-16 w-16 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-600 mb-1">Login Required</h3>
            <p className="text-slate-400 text-sm mb-4">Please log in to the CRM to view your work orders.</p>
            <Button asChild data-testid="button-login">
              <Link href="/crm/login">Go to Login</Link>
            </Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-3" data-testid="agenda-loading">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            {/* Up Next — hero card */}
            {(
              <>
                {!upNext && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Up Next</h3>
                    <div
                      className="flex flex-col items-center justify-center rounded-2xl bg-white py-8 text-center shadow-sm"
                      data-testid="agenda-empty"
                    >
                      <ClipboardList className="mb-2 h-8 w-8 text-slate-300" />
                      <p className="text-sm font-medium text-slate-600">Nothing on deck</p>
                      <p className="text-xs text-slate-400">No jobs scheduled right now.</p>
                    </div>
                  </div>
                )}
                {upNext && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Up Next</h3>
                    <div
                      onClick={() => navigateMain(`/mobile/job/${upNext.id}`)}
                      className="cursor-pointer rounded-3xl bg-gradient-to-b from-[#7d1720] to-[#5e1015] p-4 text-white shadow-[0_12px_32px_rgba(113,20,25,0.35)] transition-transform active:scale-[0.99]"
                      data-testid="agenda-up-next"
                    >
                      <div className="flex items-start justify-between">
                        <p className="text-3xl font-bold tracking-tight">
                          {upNext.scheduledStart ? formatLocal(upNext.scheduledStart, "h:mm") : "—"}
                          <span className="ml-1 text-base font-semibold text-white/70">
                            {upNext.scheduledStart ? formatLocal(upNext.scheduledStart, "a") : ""}
                          </span>
                        </p>
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-white/90">
                          <span className={`h-2 w-2 rounded-full ${statusDotColor(statusConfig[upNext.status]?.className)}`} />
                          {statusConfig[upNext.status]?.label || upNext.status}
                        </span>
                      </div>
                      <p className="mt-2 text-xl font-bold" data-testid="up-next-name">
                        {upNext.customer?.name || upNext.title || "Job"}
                      </p>
                      <p className="mt-0.5 text-sm text-white/70">
                        {upNext.property?.address1 || getPropertyAddress(upNext.property)}
                        {upNext.title && upNext.customer?.name ? ` — ${upNext.title}` : ""}
                      </p>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <a
                          href={mapsUrl(upNext)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center justify-center gap-1.5 rounded-2xl bg-white py-3 text-sm font-bold text-[#711419] transition-transform active:scale-[0.97]"
                          data-testid="up-next-navigate"
                        >
                          <Navigation className="h-4 w-4" /> Navigate
                        </a>
                        {upNext.customer?.phone ? (
                          <a
                            href={`tel:${upNext.customer.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/30 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.97]"
                            data-testid="up-next-call"
                          >
                            <Phone className="h-4 w-4" /> Call
                          </a>
                        ) : (
                          <span className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/20 py-3 text-sm font-semibold text-white/40">
                            <Phone className="h-4 w-4" /> Call
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Later Today</h3>
                  {laterToday.length === 0 ? (
                    <p className="rounded-2xl bg-white px-4 py-5 text-center text-xs text-slate-400 shadow-sm" data-testid="agenda-later-empty">
                      Nothing else scheduled today.
                    </p>
                  ) : (
                    <div className="space-y-2" data-testid="agenda-later-today">
                      {laterToday.map((job) => (
                        <button
                          key={job.id}
                          onClick={() => navigateMain(`/mobile/job/${job.id}`)}
                          className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm transition-transform active:scale-[0.99]"
                          data-testid={`agenda-job-${job.id}`}
                        >
                          <div className="w-11 shrink-0 text-center">
                            <p className="text-base font-bold leading-tight text-slate-900">
                              {job.scheduledStart ? formatLocal(job.scheduledStart, "h:mm") : "—"}
                            </p>
                            <p className="text-[11px] font-medium text-slate-400">
                              {job.scheduledStart ? formatLocal(job.scheduledStart, "a") : ""}
                            </p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-900">{job.customer?.name || job.title || "Job"}</p>
                            <p className="truncate text-xs text-slate-500">{job.property?.address1 || getPropertyAddress(job.property)}</p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                              <span className={`h-1.5 w-1.5 rounded-full ${statusDotColor(statusConfig[job.status]?.className)}`} />
                              {statusConfig[job.status]?.label || job.status}
                              {job.title && job.customer?.name && <span className="truncate text-slate-400">· {job.title}</span>}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {wrappedUp.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Wrapped Up</h3>
                    <div className="space-y-2" data-testid="agenda-wrapped-up">
                      {wrappedUp.map((job) => (
                        <button
                          key={job.id}
                          onClick={() => navigateMain(`/mobile/job/${job.id}`)}
                          className="flex w-full items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 text-left shadow-sm transition-transform active:scale-[0.99]"
                          data-testid={`agenda-job-${job.id}`}
                        >
                          <div className="w-11 shrink-0 text-center">
                            <p className="text-base font-bold leading-tight text-slate-500">
                              {job.scheduledStart ? formatLocal(job.scheduledStart, "h:mm") : "—"}
                            </p>
                            <p className="text-[11px] font-medium text-slate-400">
                              {job.scheduledStart ? formatLocal(job.scheduledStart, "a") : ""}
                            </p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-600">{job.customer?.name || job.title || "Job"}</p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                              Completed
                            </p>
                          </div>
                          <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* My Performance */}
            {performanceData && (performanceData.role === "tech" || performanceData.role === "sales" || performanceData.role === "owner" || performanceData.role === "admin") && (() => {
              const pd = performanceData as any;
              const isTech = pd.role === "tech";
              const revenue = isTech ? pd.serviceRevenue : pd.sold;
              const goalTarget = isTech ? pd.goalTarget : pd.goal;
              const pct = goalTarget > 0 ? Math.round((revenue / goalTarget) * 100) : 0;
              const monthPace = pd.daysInMonth ? (pd.dayOfMonth || 0) / pd.daysInMonth : 0;
              const paceTarget = isTech ? goalTarget : goalTarget * monthPace;
              const onPace = revenue >= paceTarget;
              const fmt = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
              return (
                <div className="space-y-2.5 border-t border-slate-200 pt-4" data-testid="perf-section">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">My Performance</h3>
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 shadow-sm">
                      {format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "MMM d")}–{format(new Date(), "d")}
                    </span>
                  </div>

                  {/* Revenue generated */}
                  <div className="rounded-2xl bg-white p-4 pb-3 shadow-sm" data-testid="perf-revenue">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#711419]">Revenue Generated</p>
                    {isLoadingPerformance ? (
                      <Skeleton className="mt-3 h-28 w-full" />
                    ) : (
                      <>
                        <div className="mt-1 flex justify-center">
                          <PerformanceGauge sold={revenue} quoted={isTech ? pd.quotedAmount : pd.quoted} goal={isTech ? pd.goal : pd.goal} goalTarget={goalTarget} />
                        </div>
                        <p className="text-center text-3xl font-bold tracking-tight text-slate-900" data-testid="perf-revenue-value">
                          {fmt(revenue)}
                        </p>
                        {goalTarget > 0 && (
                          <p className="mt-0.5 text-center text-sm text-slate-500">
                            {pct}% of {fmt(goalTarget)} {isTech ? "goal to date" : "monthly goal"} ·{" "}
                            <span className={onPace ? "font-semibold text-green-600" : "font-semibold text-amber-600"}>
                              {onPace ? "on pace" : "behind pace"}
                            </span>
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Ring tiles */}
                  <div className="grid grid-cols-3 gap-2">
                    {isTech ? (
                      <>
                        <RingStat pct={goalTarget > 0 ? revenue / goalTarget : 0} center={String(pd.serviceJobs)} label="Jobs closed" sub="paid this month" />
                        <RingStat pct={Math.min(1, pd.perTicketAvg / 1000)} center={`$${Math.round(pd.perTicketAvg)}`} label="Avg ticket" color="#16a34a" />
                        <RingStat pct={Math.min(1, pd.maintenanceAgreements / 5)} center={String(pd.maintenanceAgreements)} label="Maintenance" sub="visits done" color="#334e8f" />
                      </>
                    ) : (
                      <>
                        <RingStat pct={pd.closingRate / 100} center={`${Math.round(pd.closingRate)}%`} label="Close rate" sub={`${pd.wonCount} won`} />
                        <RingStat pct={Math.min(1, pd.averageSale / 15000)} center={pd.averageSale >= 1000 ? `$${(pd.averageSale / 1000).toFixed(1)}k` : `$${Math.round(pd.averageSale)}`} label="Avg sale" color="#16a34a" />
                        <RingStat pct={Math.min(1, pd.quotesGenerated / 20)} center={String(pd.quotesGenerated)} label="Quotes" sub={`${pd.leadsReceived} leads`} color="#334e8f" />
                      </>
                    )}
                  </div>

                  {/* Weekly revenue */}
                  {pd.weeklyRevenue && pd.weeklyRevenue.length > 0 && <WeeklyBars weeks={pd.weeklyRevenue} />}

                  {/* Invoicing (techs) */}
                  {isTech && pd.invoicing && (pd.invoicing.collected > 0 || pd.invoicing.outstanding > 0) && (
                    <InvoicingBar inv={pd.invoicing} />
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </MobileShell>
  );
}
