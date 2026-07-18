import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { format, isToday } from "date-fns";
import { getLocalStartOfDay, getLocalEndOfDay, formatLocal, toLocalTime } from "@/lib/timezone";
import { MapPin, Clock, ClipboardList, WifiOff, CloudOff, LogIn, User, DollarSign, TrendingUp, Wrench, FileText, Users, Target, CheckCircle, XCircle, MessageSquare, Phone, Navigation, ChevronRight, Thermometer, Droplets, Wind, Settings, AlertTriangle, Calendar, Bell, Monitor } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import MobileShell from "./mobile-shell";
import { useOnlineStatus, OfflineIndicator, usePendingChanges } from "@/hooks/use-online-status";
import { PerformanceGauge } from "@/components/ui/performance-gauge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CrmWorkOrder, CrmCustomer, CrmProperty, CrmUser } from "@shared/schema";

interface WorkOrderWithDetails extends CrmWorkOrder {
  customer: CrmCustomer | null;
  property: CrmProperty | null;
}

interface TechPerformance {
  role: "tech";
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

function greetingForHour(h: number): string {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function ProfileHeader({ user }: { user: CrmUser }) {
  const [, navigate] = useLocation();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const { data: unread } = useQuery<{ count: number }>({
    queryKey: ["/api/crm/notifications/unread-count"],
    refetchInterval: 60 * 1000,
  });
  const unreadCount = unread?.count || 0;
  const initials = user.name
    ? user.name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")
    : null;
  const showDesktopLink = user.role !== "tech";

  return (
    <div className="flex items-center justify-between" data-testid="profile-header">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100" data-testid="text-greeting">
          {greetingForHour(now.getHours())}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{format(now, "EEEE, MMM d")}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate("/crm/notifications")}
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-900/10 bg-white/85 text-slate-600 shadow-sm backdrop-blur-xl transition-transform active:scale-95 dark:bg-slate-800"
          data-testid="button-notifications"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-900/10 bg-white/85 text-sm font-bold text-[#711419] shadow-sm backdrop-blur-xl transition-transform active:scale-95 dark:bg-slate-800"
              data-testid="button-profile-menu"
              aria-label="Profile menu"
            >
              {initials || <User className="h-5 w-5" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild data-testid="menu-profile">
              <Link href="/mobile/profile" className="flex items-center">
                <User className="mr-2 h-4 w-4" /> My Profile
              </Link>
            </DropdownMenuItem>
            {showDesktopLink && (
              <DropdownMenuItem asChild data-testid="menu-desktop">
                <Link href="/crm" className="flex items-center">
                  <Monitor className="mr-2 h-4 w-4" /> Desktop CRM
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
  // Users with view-all permission can toggle between viewing all techs or just their own work orders
  const [viewAllTechs, setViewAllTechs] = useState<boolean | null>(null);

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

  // Supervisor, tech, and sales can toggle between viewing all jobs or just their own
  const canToggleView = currentUser?.role === 'supervisor' || currentUser?.role === 'tech' || currentUser?.role === 'sales';
  // Owner/admin always see all jobs without needing a toggle
  const isOwnerOrAdmin = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  // Set default: supervisors default to All Techs, tech/sales default to My Jobs
  const effectiveViewAll = viewAllTechs ?? (currentUser?.role === 'supervisor');
  // Determine if we should filter by tech ID
  // Owner/admin never filter, toggle users filter based on their selection
  const shouldFilterByTech = isOwnerOrAdmin ? false : (canToggleView ? !effectiveViewAll : true);

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

  // Fetch all technicians when viewing all techs
  const { data: technicians = [] } = useQuery<{ id: string; name: string; role: string }[]>({
    queryKey: ["/api/crm/users", "technicians-for-agenda"],
    queryFn: async () => {
      const res = await fetch("/api/crm/users", { credentials: "include" });
      if (!res.ok) return [];
      const users = await res.json();
      // Filter to tech, sales, supervisor roles that can have work orders assigned
      return users.filter((u: CrmUser) => 
        ['tech', 'sales', 'supervisor', 'owner', 'admin'].includes(u.role) && u.isActive
      );
    },
    enabled: (canToggleView && effectiveViewAll) || isOwnerOrAdmin,
    staleTime: 5 * 60 * 1000,
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

  // Group work orders by technician when viewing all techs
  const showGroupedView = isOwnerOrAdmin || (canToggleView && effectiveViewAll);
  const groupedByTech = showGroupedView 
    ? todaysOrders.reduce((acc, wo) => {
        const techId = wo.assignedTechId || 'unassigned';
        if (!acc[techId]) {
          acc[techId] = [];
        }
        acc[techId].push(wo);
        return acc;
      }, {} as Record<string, WorkOrderWithDetails[]>)
    : null;

  // Sort work orders within each tech group by scheduled start time
  if (groupedByTech) {
    Object.keys(groupedByTech).forEach((techId) => {
      groupedByTech[techId].sort((a, b) => {
        const aTime = a.scheduledStart ? new Date(a.scheduledStart).getTime() : Infinity;
        const bTime = b.scheduledStart ? new Date(b.scheduledStart).getTime() : Infinity;
        return aTime - bTime;
      });
    });
  }

  // Get tech name by ID
  const getTechName = (techId: string): string => {
    if (techId === 'unassigned') return 'Unassigned';
    const tech = technicians.find(t => t.id === techId);
    return tech?.name || 'Unknown';
  };

  // Sort technicians: those with work orders first, alphabetically within each group
  const sortedTechIds = groupedByTech 
    ? Object.keys(groupedByTech).sort((a, b) => {
        if (a === 'unassigned') return 1;
        if (b === 'unassigned') return -1;
        return getTechName(a).localeCompare(getTechName(b));
      })
    : [];

  const showCacheWarning = !isOnline || isFromCache;

  return (
    <MobileShell>
      <OfflineIndicator />
      
      <div className="p-4 space-y-4 pb-24" data-testid="mobile-agenda">
        {currentUser && <ProfileHeader user={currentUser} />}
        
        <div className="text-center bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800/50 rounded-xl p-4 shadow-sm" data-testid="agenda-date-header">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Calendar className="w-5 h-5 text-slate-500" />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">
              {formatLocal(today, "EEEE")}
            </h2>
          </div>
          <p className="text-slate-500 dark:text-slate-400">
            {formatLocal(today, "MMMM d, yyyy")}
          </p>
          
          {canToggleView && (
            <div className="mt-3 flex items-center justify-center gap-2" data-testid="view-toggle">
              <button
                onClick={() => setViewAllTechs(true)}
                className={`px-3 py-1.5 text-xs font-medium rounded-l-full transition-colors ${
                  effectiveViewAll 
                    ? "bg-[#711419] text-white" 
                    : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-300"
                }`}
                data-testid="btn-view-all-techs"
              >
                <Users className="h-3 w-3 inline mr-1" />
                All Techs
              </button>
              <button
                onClick={() => setViewAllTechs(false)}
                className={`px-3 py-1.5 text-xs font-medium rounded-r-full transition-colors ${
                  !effectiveViewAll 
                    ? "bg-[#711419] text-white" 
                    : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-300"
                }`}
                data-testid="btn-view-my-orders"
              >
                <User className="h-3 w-3 inline mr-1" />
                My Jobs
              </button>
            </div>
          )}
          
          {showCacheWarning && workOrders && workOrders.length > 0 && (
            <div 
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 rounded-full font-medium"
              data-testid="cache-warning"
            >
              <WifiOff className="h-3 w-3" />
              Showing cached data
            </div>
          )}
          <GlobalPendingChangesIndicator />
        </div>

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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                  {showGroupedView ? "All Technicians" : "Today's Jobs"}
                </h3>
                <Badge variant="secondary" className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold">
                  {todaysOrders.length}
                </Badge>
              </div>
              {todaysOrders.length === 0 ? (
                <div 
                  className="flex flex-col items-center justify-center py-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-lg"
                  data-testid="agenda-empty"
                >
                  <ClipboardList className="h-10 w-10 text-slate-300 mb-2" />
                  <h3 className="text-sm font-medium text-slate-600 mb-1">No Jobs Today</h3>
                  <p className="text-slate-400 text-xs">
                    {showGroupedView 
                      ? "No work orders scheduled for any technician today." 
                      : "You have no work orders scheduled for today."}
                  </p>
                </div>
              ) : showGroupedView && groupedByTech ? (
                <div className="space-y-4" data-testid="agenda-grouped-list">
                  {sortedTechIds.map((techId) => {
                    const techOrders = groupedByTech[techId];
                    const techName = getTechName(techId);
                    const tech = technicians.find(t => t.id === techId);
                    const roleConfig = tech ? roleLabels[tech.role] : null;
                    
                    return (
                      <div key={techId} data-testid={`tech-section-${techId}`}>
                        <div className="flex items-center gap-2 mb-2 px-1">
                          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                            <User className="w-4 h-4 text-slate-500" />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{techName}</p>
                            {roleConfig && (
                              <Badge className={`text-xs ${roleConfig.className}`}>
                                {roleConfig.label}
                              </Badge>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {techOrders.length} job{techOrders.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                        <div className="space-y-2 ml-2 pl-4 border-l-2 border-slate-200 dark:border-slate-700">
                          {techOrders.map((workOrder) => (
                            <WorkOrderCard 
                              key={workOrder.id} 
                              workOrder={workOrder} 
                              showCacheWarning={showCacheWarning} 
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3" data-testid="agenda-list">
                  {todaysOrders.map((workOrder) => (
                    <WorkOrderCard 
                      key={workOrder.id} 
                      workOrder={workOrder} 
                      showCacheWarning={showCacheWarning} 
                    />
                  ))}
                </div>
              )}
            </div>

            {performanceData && (
              <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                  My Performance (MTD)
                </h3>
                {isLoadingPerformance ? (
                  <div className="space-y-3">
                    <Skeleton className="h-32 w-full" />
                    <div className="grid grid-cols-2 gap-3">
                      <Skeleton className="h-20" />
                      <Skeleton className="h-20" />
                      <Skeleton className="h-20" />
                      <Skeleton className="h-20" />
                    </div>
                  </div>
                ) : performanceData.role === "tech" ? (
                  <TechPerformanceSection performance={performanceData as TechPerformance} />
                ) : performanceData.role === "sales" || performanceData.role === "owner" || performanceData.role === "admin" ? (
                  <SalesPerformanceSection performance={performanceData as SalesPerformance} />
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </MobileShell>
  );
}
