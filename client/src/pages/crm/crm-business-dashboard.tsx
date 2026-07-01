import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Target,
  TrendingUp,
  DollarSign,
  Percent,
  Wrench,
  HardHat,
  ShieldCheck,
  Users,
  FolderKanban,
  ClipboardList,
  Receipt,
  Trophy,
  CheckCircle2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CrmLayout } from "@/components/crm/crm-layout";
import { PageHeader, StatCard, SectionCard, EmptyState } from "@/components/crm/ui-kit";
import { PerformanceGauge } from "@/components/ui/performance-gauge";
import { cn } from "@/lib/utils";
import type { CrmUser } from "@shared/schema";

type TimeRange = "day" | "week" | "month" | "rolling12";

interface DashboardAnalytics {
  range: string;
  companyOverview: {
    totalQuoted: number;
    totalSold: number;
    closeRate: number;
    companyGoal: number;
    goalProgress: number;
    rolling12Month: number;
  };
  revenueByDepartment: {
    SERVICE: { today: number; mtd: number; ytd: number; goal: number; goalProgress: number };
    INSTALL: { today: number; mtd: number; ytd: number; goal: number; goalProgress: number };
    MAINTENANCE: { today: number; mtd: number; ytd: number; goal: number; goalProgress: number };
  };
  monthlyRevenue: Array<{ month: string; revenue: number }>;
  projectsOverview: { open: number; completed: number; recent: any[] };
  workOrdersOverview: { scheduled: number; completed: number; recent: any[] };
  invoicesOverview: { created: number; sent: number; pending: number; recent: any[] };
  techPerformance: Array<{
    id: string;
    name: string;
    serviceRevenue: number;
    quotedAmount: number;
    serviceJobs: number;
    perTicketAvg: number;
    maintenanceAgreements: number;
    goal: number;
    goalTarget: number;
    goalProgress: number;
    goalMet: boolean;
  }>;
  salesPerformance: Array<{
    id: string;
    name: string;
    leadsReceived: number;
    salesVisits: number;
    quotesGenerated: number;
    averageSale: number;
    closingRate: number;
    pipeline: { won: number; negotiating: number; lost: number };
  }>;
}

const num = (v: unknown) => Number(v) || 0;
const fmtCurrency = (v: number) =>
  num(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtPct = (v: number) => `${Math.round(num(v))}%`;
const clampPct = (v: number) => Math.max(0, Math.min(100, num(v)));

function GoalBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${clampPct(value)}%` }} />
    </div>
  );
}

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "12 mo", value: "rolling12" },
];

export default function CrmBusinessDashboard() {
  usePageTitle("Dashboard");
  const [, navigate] = useLocation();
  const [timeRange, setTimeRange] = useState<TimeRange>("month");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: analytics, isLoading } = useQuery<DashboardAnalytics>({
    queryKey: ["/api/crm/dashboard/analytics", timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/crm/dashboard/analytics?range=${timeRange}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    enabled: !!currentUser,
  });

  useEffect(() => {
    if (!authLoading && !currentUser) navigate("/crm/login");
  }, [authLoading, currentUser, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen space-y-6 p-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-44 w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      </div>
    );
  }
  if (!currentUser) return null;

  const co = analytics?.companyOverview;
  const remaining = Math.max(0, num(co?.companyGoal) - num(co?.totalSold));
  const depts: { key: keyof DashboardAnalytics["revenueByDepartment"]; label: string; icon: any }[] = [
    { key: "SERVICE", label: "Service", icon: Wrench },
    { key: "INSTALL", label: "Install", icon: HardHat },
    { key: "MAINTENANCE", label: "Maintenance", icon: ShieldCheck },
  ];
  const techs = (analytics?.techPerformance || []).slice().sort((a, b) => num(b.serviceRevenue) - num(a.serviceRevenue));
  const reps = analytics?.salesPerformance || [];
  const monthly = analytics?.monthlyRevenue || [];
  const hasRevenue = monthly.some((m) => num(m.revenue) > 0);

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <PageHeader
          title={<span data-testid="text-business-dashboard-title">Dashboard</span>}
          description="Real-time performance metrics and insights"
          actions={
            <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1" role="tablist">
              {TIME_RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setTimeRange(r.value)}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm font-medium transition-all",
                    timeRange === r.value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={`range-${r.value}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          }
        />

        {/* Signature hero: company goal progress + revenue trend */}
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-5">
            <div className="relative border-b border-border p-6 lg:col-span-2 lg:border-b-0 lg:border-r">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.07] to-transparent" />
              <div className="relative">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Target className="h-4 w-4 text-primary" /> Company goal
                </div>
                {isLoading ? (
                  <Skeleton className="mt-3 h-10 w-48" />
                ) : (
                  <>
                    <p className="mt-2 font-display text-4xl font-semibold tracking-tight tabular-nums" data-testid="value-total-sold">
                      {fmtCurrency(num(co?.totalSold))}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      of {fmtCurrency(num(co?.companyGoal))} sold
                    </p>
                    <div className="mt-4">
                      <div className="mb-1 flex items-center justify-between text-xs font-medium">
                        <span className="text-primary">{fmtPct(co?.goalProgress)} to goal</span>
                        <span className="text-muted-foreground">{fmtCurrency(remaining)} to go</span>
                      </div>
                      <GoalBar value={num(co?.goalProgress)} />
                    </div>
                    <div className="mt-4 flex gap-6">
                      <div>
                        <p className="text-xs text-muted-foreground">Close rate</p>
                        <p className="text-lg font-semibold tabular-nums">{fmtPct(co?.closeRate)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Rolling 12-mo</p>
                        <p className="text-lg font-semibold tabular-nums" data-testid="value-rolling-12">{fmtCurrency(num(co?.rolling12Month))}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="p-5 lg:col-span-3">
              <p className="mb-2 text-sm font-medium text-muted-foreground">Revenue — last 12 months</p>
              {isLoading ? (
                <Skeleton className="h-44 w-full" />
              ) : !hasRevenue ? (
                <div className="flex h-[184px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-center">
                  <TrendingUp className="h-7 w-7 text-muted-foreground/40" />
                  <p className="mt-2 text-sm font-medium text-foreground">No revenue this period</p>
                  <p className="text-xs text-muted-foreground">Sold quotes will chart here as revenue comes in.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={184}>
                  <AreaChart data={monthly} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="bizRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#711419" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#711419" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                    <XAxis dataKey="month" fontSize={11} stroke="#a8a29e" tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} stroke="#a8a29e" tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)} />
                    <RTooltip formatter={(v: any) => [fmtCurrency(Number(v)), "Revenue"]} />
                    <Area type="monotone" dataKey="revenue" stroke="#711419" strokeWidth={2} fill="url(#bizRev)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total Quoted" value={fmtCurrency(num(co?.totalQuoted))} hint={`${timeRange} range`} icon={DollarSign} tone="primary" />
          <StatCard label="Total Sold" value={fmtCurrency(num(co?.totalSold))} hint={`${timeRange} range`} icon={TrendingUp} tone="success" />
          <StatCard label="Close Rate" value={fmtPct(co?.closeRate)} hint="Quoted → sold" icon={Percent} tone="warning" />
          <StatCard label="Rolling 12-Month" value={fmtCurrency(num(co?.rolling12Month))} hint="Trailing year" icon={Target} tone="neutral" />
        </div>

        {/* Revenue by department */}
        <SectionCard title="Revenue by department" description="Month-to-date vs goal">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {depts.map(({ key, label, icon: Icon }) => {
              const d = analytics?.revenueByDepartment?.[key];
              return (
                <div key={key}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-primary" />{label}</span>
                    <span className="text-xs text-muted-foreground">{fmtPct(d?.goalProgress)}</span>
                  </div>
                  <p className="mb-2 text-xl font-semibold tabular-nums">{fmtCurrency(num(d?.mtd))}</p>
                  <GoalBar value={num(d?.goalProgress)} />
                  <p className="mt-1 text-xs text-muted-foreground">Goal {fmtCurrency(num(d?.goal))}</p>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* Technician performance — speedometers (sold vs quoted vs goal) */}
        <SectionCard title="Technician performance" description="Sold vs pipeline against goal" action={<Trophy className="h-4 w-4 text-amber-500" />}>
          {techs.length === 0 ? (
            <EmptyState icon={Users} title="No technician data" message="Each tech's speedometer appears here as service jobs are logged this period." />
          ) : (
            <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
              {techs.map((t) => (
                <div key={t.id} className="flex flex-col items-center rounded-lg border border-border bg-muted/20 p-4">
                  <PerformanceGauge
                    label={t.name}
                    sold={num(t.serviceRevenue)}
                    quoted={num(t.quotedAmount)}
                    goal={num(t.goalTarget ?? t.goal)}
                    size={210}
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{num(t.serviceJobs)} jobs</span>
                    <span>·</span>
                    <span>{fmtCurrency(num(t.perTicketAvg))}/ticket</span>
                    {t.goalMet && (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-3 w-3" /> Goal met
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Sales performance — activity + pipeline */}
        <SectionCard title="Sales performance" noBodyPadding>
          {reps.length === 0 ? (
            <EmptyState icon={Users} title="No sales data" message="Rep activity, pipeline, and closing rates appear here as quotes are created." />
          ) : (
            <ul className="divide-y divide-border">
              {reps.map((r) => (
                <li key={r.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {r.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {num(r.leadsReceived)} leads · {num(r.salesVisits)} visits · {num(r.quotesGenerated)} quotes
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium">
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700">{num(r.pipeline?.won)} won</span>
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">{num(r.pipeline?.negotiating)} neg</span>
                      <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">{num(r.pipeline?.lost)} lost</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{fmtPct(r.closingRate)}</p>
                      <p className="text-[11px] text-muted-foreground">{fmtCurrency(num(r.averageSale))} avg</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Operations */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Open Projects" value={num(analytics?.projectsOverview?.open)} hint={`${num(analytics?.projectsOverview?.completed)} completed`} icon={FolderKanban} tone="primary" />
          <StatCard label="Scheduled Work Orders" value={num(analytics?.workOrdersOverview?.scheduled)} hint={`${num(analytics?.workOrdersOverview?.completed)} completed`} icon={ClipboardList} tone="warning" />
          <StatCard label="Pending Invoices" value={num(analytics?.invoicesOverview?.pending)} hint={`${num(analytics?.invoicesOverview?.sent)} sent`} icon={Receipt} tone="neutral" />
        </div>
      </div>
    </CrmLayout>
  );
}
