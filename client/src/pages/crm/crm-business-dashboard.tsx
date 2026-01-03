import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Target,
  TrendingUp,
  DollarSign,
  Users,
  Wrench,
  HardHat,
  Settings2,
  CheckCircle,
  AlertTriangle,
  FolderOpen,
  ClipboardList,
  FileText,
  Calendar,
  Clock,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CrmLayout } from "@/components/crm/crm-layout";
import { PerformanceGauge } from "@/components/ui/performance-gauge";
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
  projectsOverview: {
    open: number;
    completed: number;
    recent: Array<{
      id: string;
      name: string;
      status: string;
      projectType: string;
      createdAt: string;
    }>;
  };
  workOrdersOverview: {
    scheduled: number;
    completed: number;
    recent: Array<{
      id: string;
      visitType: string;
      status: string;
      scheduledStart: string | null;
      createdAt: string;
    }>;
  };
  invoicesOverview: {
    created: number;
    sent: number;
    pending: number;
  };
  techPerformance: Array<{
    id: string;
    name: string;
    serviceRevenue: number;
    quotedAmount: number;
    serviceJobs: number;
    perTicketAvg: number;
    maintenanceAgreements: number;
    goal: number;
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
    pipeline: {
      won: number;
      negotiating: number;
      lost: number;
    };
  }>;
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatCurrencyFull(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function CrmBusinessDashboard() {
  const [, navigate] = useLocation();
  const [timeRange, setTimeRange] = useState<TimeRange>("month");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: analytics, isLoading: analyticsLoading, error } = useQuery<DashboardAnalytics>({
    queryKey: ["/api/crm/dashboard/analytics", timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/crm/dashboard/analytics?range=${timeRange}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch analytics");
      return response.json();
    },
    enabled: !!currentUser,
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const timeRanges: { label: string; value: TimeRange }[] = [
    { label: "Day", value: "day" },
    { label: "Week", value: "week" },
    { label: "Month", value: "month" },
    { label: "Rolling 12", value: "rolling12" },
  ];

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-[#711419] to-[#8b1a20] text-white p-6 rounded-xl shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2" data-testid="text-business-dashboard-title">
                <Target className="h-7 w-7" />
                Business Dashboard
              </h1>
              <p className="text-white/80 mt-1">Real-time performance metrics and insights</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {timeRanges.map((range) => (
                <Button
                  key={range.value}
                  variant={timeRange === range.value ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setTimeRange(range.value)}
                  className={
                    timeRange === range.value
                      ? "bg-white text-[#711419] hover:bg-white/90"
                      : "text-white border border-white/30 hover:bg-white/20"
                  }
                  data-testid={`btn-range-${range.value}`}
                >
                  {range.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {error ? (
          <Card className="border-destructive">
            <CardContent className="p-6 text-center text-destructive">
              Failed to load analytics. Please try again.
            </CardContent>
          </Card>
        ) : analyticsLoading ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </>
        ) : analytics ? (
          <>
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl font-bold text-slate-800 border-b-2 border-[#711419] pb-2">
                  Company Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-gradient-to-br from-[#711419] to-[#8b1a20] rounded-xl p-5 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <p className="text-sm opacity-90 mb-2">Total Quoted</p>
                    <p className="text-3xl font-bold" data-testid="value-total-quoted">
                      {formatCurrency(analytics.companyOverview.totalQuoted)}
                    </p>
                    <p className="text-xs opacity-75 mt-1">
                      {timeRange === "month" ? "Month to Date" : timeRange === "day" ? "Today" : timeRange === "week" ? "This Week" : "Rolling 12 Months"}
                    </p>
                    <Progress value={Math.min((analytics.companyOverview.totalQuoted / analytics.companyOverview.companyGoal) * 100, 100)} className="mt-3 h-2 bg-white/20" />
                  </div>

                  <div className="bg-gradient-to-br from-[#711419] to-[#8b1a20] rounded-xl p-5 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <p className="text-sm opacity-90 mb-2">Total Sold</p>
                    <p className="text-3xl font-bold" data-testid="value-total-sold">
                      {formatCurrency(analytics.companyOverview.totalSold)}
                    </p>
                    <p className="text-xs opacity-75 mt-1">
                      {analytics.companyOverview.closeRate.toFixed(0)}% Close Rate
                    </p>
                    <Progress value={analytics.companyOverview.closeRate} className="mt-3 h-2 bg-white/20" />
                  </div>

                  <div className="bg-gradient-to-br from-[#711419] to-[#8b1a20] rounded-xl p-5 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <p className="text-sm opacity-90 mb-2">Company Goal</p>
                    <p className="text-3xl font-bold" data-testid="value-company-goal">
                      {formatCurrency(analytics.companyOverview.companyGoal)}
                    </p>
                    <p className="text-xs opacity-75 mt-1">
                      {analytics.companyOverview.goalProgress.toFixed(0)}% Complete
                    </p>
                    <Progress value={Math.min(analytics.companyOverview.goalProgress, 100)} className="mt-3 h-2 bg-white/20" />
                  </div>

                  <div className="bg-gradient-to-br from-[#711419] to-[#8b1a20] rounded-xl p-5 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <p className="text-sm opacity-90 mb-2">Rolling 12-Month</p>
                    <p className="text-3xl font-bold" data-testid="value-rolling-12">
                      {formatCurrency(analytics.companyOverview.rolling12Month)}
                    </p>
                    <p className="text-xs opacity-75 mt-1">Total Revenue</p>
                    <Progress value={Math.min((analytics.companyOverview.rolling12Month / (analytics.companyOverview.companyGoal * 12)) * 100, 100)} className="mt-3 h-2 bg-white/20" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl font-bold text-slate-800 border-b-2 border-[#711419] pb-2">
                  Revenue by Department
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-cyan-50 border-2 border-cyan-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Wrench className="h-5 w-5 text-cyan-600" />
                      <span className="text-lg font-bold text-cyan-800">Service</span>
                    </div>
                    <p className="text-3xl font-bold mb-3 text-cyan-900" data-testid="value-service-mtd">
                      {formatCurrency(analytics.revenueByDepartment.SERVICE.mtd)}
                    </p>
                    <div className="text-sm text-cyan-700 space-y-1">
                      <p>Today: {formatCurrency(analytics.revenueByDepartment.SERVICE.today)}</p>
                      <p>MTD: {formatCurrency(analytics.revenueByDepartment.SERVICE.mtd)}</p>
                      <p>YTD: {formatCurrency(analytics.revenueByDepartment.SERVICE.ytd)}</p>
                      <p>Goal: {formatCurrency(analytics.revenueByDepartment.SERVICE.goal)}/mo ({analytics.revenueByDepartment.SERVICE.goalProgress.toFixed(0)}%)</p>
                    </div>
                  </div>

                  <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <HardHat className="h-5 w-5 text-yellow-600" />
                      <span className="text-lg font-bold text-yellow-800">Install</span>
                    </div>
                    <p className="text-3xl font-bold mb-3 text-yellow-900" data-testid="value-install-mtd">
                      {formatCurrency(analytics.revenueByDepartment.INSTALL.mtd)}
                    </p>
                    <div className="text-sm text-yellow-700 space-y-1">
                      <p>Today: {formatCurrency(analytics.revenueByDepartment.INSTALL.today)}</p>
                      <p>MTD: {formatCurrency(analytics.revenueByDepartment.INSTALL.mtd)}</p>
                      <p>YTD: {formatCurrency(analytics.revenueByDepartment.INSTALL.ytd)}</p>
                      <p>Goal: {formatCurrency(analytics.revenueByDepartment.INSTALL.goal)}/mo ({analytics.revenueByDepartment.INSTALL.goalProgress.toFixed(0)}%)</p>
                    </div>
                  </div>

                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Settings2 className="h-5 w-5 text-green-600" />
                      <span className="text-lg font-bold text-green-800">Maintenance</span>
                    </div>
                    <p className="text-3xl font-bold mb-3 text-green-900" data-testid="value-maintenance-mtd">
                      {formatCurrency(analytics.revenueByDepartment.MAINTENANCE.mtd)}
                    </p>
                    <div className="text-sm text-green-700 space-y-1">
                      <p>Today: {formatCurrency(analytics.revenueByDepartment.MAINTENANCE.today)}</p>
                      <p>MTD: {formatCurrency(analytics.revenueByDepartment.MAINTENANCE.mtd)}</p>
                      <p>YTD: {formatCurrency(analytics.revenueByDepartment.MAINTENANCE.ytd)}</p>
                      <p>Goal: {formatCurrency(analytics.revenueByDepartment.MAINTENANCE.goal)}/mo ({analytics.revenueByDepartment.MAINTENANCE.goalProgress.toFixed(0)}%)</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl font-bold text-slate-800 border-b-2 border-[#711419] pb-2">
                  Monthly Revenue Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.monthlyRevenue}>
                      <defs>
                        <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#711419" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#711419" stopOpacity={0.05}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12 }} />
                      <YAxis 
                        tickFormatter={(value) => formatCurrency(value)}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                      />
                      <Tooltip 
                        formatter={(value: number) => [formatCurrencyFull(value), "Revenue"]}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="#711419" 
                        strokeWidth={2}
                        fill="url(#revenueGradient)"
                        dot={{ fill: '#711419', strokeWidth: 2, r: 4 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <FolderOpen className="h-5 w-5 text-[#711419]" />
                    Projects
                  </CardTitle>
                  <p className="text-xs text-slate-500">Last 30 days</p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-blue-800">{analytics.projectsOverview.open}</p>
                      <p className="text-xs text-blue-600">Open</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-green-800">{analytics.projectsOverview.completed}</p>
                      <p className="text-xs text-green-600">Completed</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Recent Projects</p>
                    {analytics.projectsOverview.recent.length > 0 ? (
                      analytics.projectsOverview.recent.map((project) => (
                        <div key={project.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                          <div className="truncate flex-1">
                            <p className="text-sm font-medium text-slate-800 truncate">{project.name}</p>
                            <p className="text-xs text-slate-500">{project.projectType}</p>
                          </div>
                          <Badge className="text-xs ml-2" variant="outline">{project.status}</Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500 text-center py-2">No recent projects</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-[#711419]" />
                    Work Orders
                  </CardTitle>
                  <p className="text-xs text-slate-500">Last 30 days</p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-amber-800">{analytics.workOrdersOverview.scheduled}</p>
                      <p className="text-xs text-amber-600">Scheduled</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-green-800">{analytics.workOrdersOverview.completed}</p>
                      <p className="text-xs text-green-600">Completed</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Recent Work Orders</p>
                    {analytics.workOrdersOverview.recent.length > 0 ? (
                      analytics.workOrdersOverview.recent.map((wo) => (
                        <div key={wo.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                          <div className="truncate flex-1">
                            <p className="text-sm font-medium text-slate-800">{wo.visitType}</p>
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {wo.scheduledStart ? new Date(wo.scheduledStart).toLocaleDateString() : "Not scheduled"}
                            </p>
                          </div>
                          <Badge className="text-xs ml-2" variant="outline">{wo.status}</Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500 text-center py-2">No recent work orders</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-[#711419]" />
                    Invoices
                  </CardTitle>
                  <p className="text-xs text-slate-500">Last 30 days</p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-slate-800">{analytics.invoicesOverview.created}</p>
                      <p className="text-xs text-slate-600">Created</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-blue-800">{analytics.invoicesOverview.sent}</p>
                      <p className="text-xs text-blue-600">Sent</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-amber-800">{analytics.invoicesOverview.pending}</p>
                      <p className="text-xs text-amber-600">Pending</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {analytics.techPerformance.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl font-bold text-slate-800 border-b-2 border-[#711419] pb-2">
                    Technician Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {analytics.techPerformance.map((tech) => (
                    <div key={tech.id} className="border-2 border-slate-200 rounded-lg p-5" data-testid={`tech-card-${tech.id}`}>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-4 border-b border-slate-200">
                        <h3 className="text-lg font-bold text-slate-800">{tech.name}</h3>
                        <div className="flex gap-2">
                          {tech.goalMet ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Goal Met
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {tech.goalProgress.toFixed(0)}% to Goal
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col lg:flex-row gap-6">
                        <div className="flex-shrink-0 flex justify-center">
                          <PerformanceGauge
                            sold={tech.serviceRevenue}
                            quoted={tech.quotedAmount}
                            goal={tech.goal}
                            size={200}
                          />
                        </div>
                        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-slate-50 border-l-4 border-blue-500 p-3 rounded">
                            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Service Revenue</p>
                            <p className="text-xl font-bold text-slate-800">{formatCurrencyFull(tech.serviceRevenue)}</p>
                            <p className={`text-xs ${tech.goalMet ? "text-green-600" : "text-slate-500"}`}>
                              Goal: {formatCurrency(tech.goal)} ({tech.goalProgress.toFixed(0)}%)
                            </p>
                          </div>
                          <div className="bg-slate-50 border-l-4 border-green-500 p-3 rounded">
                            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Per Ticket Avg</p>
                            <p className="text-xl font-bold text-slate-800">{formatCurrencyFull(tech.perTicketAvg)}</p>
                          </div>
                          <div className="bg-slate-50 border-l-4 border-purple-500 p-3 rounded">
                            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Service Jobs</p>
                            <p className="text-xl font-bold text-slate-800">{tech.serviceJobs}</p>
                            <p className="text-xs text-slate-500">MTD</p>
                          </div>
                          <div className="bg-slate-50 border-l-4 border-amber-500 p-3 rounded">
                            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Maint. Agreements</p>
                            <p className="text-xl font-bold text-slate-800">{tech.maintenanceAgreements}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {analytics.techPerformance.length === 0 && (
                    <p className="text-slate-500 text-center py-8">No technicians found</p>
                  )}
                </CardContent>
              </Card>
            )}

            {analytics.salesPerformance.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl font-bold text-slate-800 border-b-2 border-[#711419] pb-2">
                    Sales Team Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {analytics.salesPerformance.map((salesperson) => (
                    <div key={salesperson.id} className="border-2 border-slate-200 rounded-lg p-5" data-testid={`sales-card-${salesperson.id}`}>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-4 border-b border-slate-200">
                        <h3 className="text-lg font-bold text-slate-800">{salesperson.name}</h3>
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100 w-fit">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          {salesperson.closingRate.toFixed(0)}% Close Rate
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
                        <div className="bg-slate-50 border-l-4 border-blue-500 p-3 rounded">
                          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Leads Received</p>
                          <p className="text-xl font-bold text-slate-800">{salesperson.leadsReceived}</p>
                        </div>
                        <div className="bg-slate-50 border-l-4 border-green-500 p-3 rounded">
                          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Sales Visits</p>
                          <p className="text-xl font-bold text-slate-800">{salesperson.salesVisits}</p>
                        </div>
                        <div className="bg-slate-50 border-l-4 border-purple-500 p-3 rounded">
                          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Quotes Generated</p>
                          <p className="text-xl font-bold text-slate-800">{salesperson.quotesGenerated}</p>
                        </div>
                        <div className="bg-slate-50 border-l-4 border-amber-500 p-3 rounded">
                          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Average Sale</p>
                          <p className="text-xl font-bold text-slate-800">{formatCurrencyFull(salesperson.averageSale)}</p>
                        </div>
                        <div className="bg-slate-50 border-l-4 border-rose-500 p-3 rounded">
                          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Closing Rate</p>
                          <p className="text-xl font-bold text-slate-800">{salesperson.closingRate.toFixed(0)}%</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1 bg-green-50 border-l-4 border-green-500 p-3 rounded text-center">
                          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Won</p>
                          <p className="text-2xl font-bold text-green-700">{salesperson.pipeline.won}</p>
                        </div>
                        <div className="flex-1 bg-amber-50 border-l-4 border-amber-500 p-3 rounded text-center">
                          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Negotiating</p>
                          <p className="text-2xl font-bold text-amber-700">{salesperson.pipeline.negotiating}</p>
                        </div>
                        <div className="flex-1 bg-red-50 border-l-4 border-red-500 p-3 rounded text-center">
                          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Lost</p>
                          <p className="text-2xl font-bold text-red-700">{salesperson.pipeline.lost}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {analytics.salesPerformance.length === 0 && (
                    <p className="text-slate-500 text-center py-8">No sales team members found</p>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
    </CrmLayout>
  );
}
