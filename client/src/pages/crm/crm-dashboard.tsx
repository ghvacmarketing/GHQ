import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  CheckCircle2,
  Briefcase,
  Receipt,
  TrendingUp,
  Calendar,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser } from "@shared/schema";

export default function CrmDashboard() {
  const [, navigate] = useLocation();

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
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
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const today = new Date();
  const dateDisplay = today.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const kpiCards = [
    {
      title: "Total Revenue",
      value: "—",
      subtitle: "This month",
      icon: DollarSign,
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
      trend: null,
    },
    {
      title: "Projects Completed",
      value: "—",
      subtitle: "This month",
      icon: CheckCircle2,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      trend: null,
    },
    {
      title: "Open Projects",
      value: "—",
      subtitle: "Active",
      icon: Briefcase,
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      trend: null,
    },
    {
      title: "Pending Invoices",
      value: "—",
      subtitle: "Awaiting payment",
      icon: Receipt,
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600",
      trend: null,
    },
  ];

  const recentJobs = [
    { status: "—", date: "—", customer: "—", technician: "—" },
    { status: "—", date: "—", customer: "—", technician: "—" },
    { status: "—", date: "—", customer: "—", technician: "—" },
    { status: "—", date: "—", customer: "—", technician: "—" },
    { status: "—", date: "—", customer: "—", technician: "—" },
  ];

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-dashboard-title">
              Dashboard
            </h1>
            <p className="text-slate-500 text-sm flex items-center gap-2 mt-1">
              <Calendar className="h-4 w-4" />
              {dateDisplay}
            </p>
          </div>
          <Badge variant="outline" className="w-fit text-slate-600">
            Last updated: Just now
          </Badge>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="kpi-grid">
          {kpiCards.map((kpi) => (
            <Card
              key={kpi.title}
              className="bg-white border shadow-sm hover:shadow-md transition-shadow"
              data-testid={`kpi-card-${kpi.title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-start justify-between">
                  <div className={`p-2.5 rounded-lg ${kpi.iconBg}`}>
                    <kpi.icon className={`h-5 w-5 ${kpi.iconColor}`} />
                  </div>
                  {kpi.trend && (
                    <span className="text-xs text-emerald-600 font-medium flex items-center gap-0.5">
                      <TrendingUp className="h-3 w-3" />
                      {kpi.trend}
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <p
                    className="text-2xl lg:text-3xl font-bold text-slate-900"
                    data-testid={`kpi-value-${kpi.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {kpi.value}
                  </p>
                  <p className="text-sm font-medium text-slate-600 mt-0.5">{kpi.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{kpi.subtitle}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-white border shadow-sm" data-testid="card-sales-performance">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-indigo-600" />
                Sales Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 flex items-center justify-center bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                <div className="text-center">
                  <TrendingUp className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 font-medium">Chart Coming Soon</p>
                  <p className="text-xs text-slate-400 mt-1">Sales data will appear here</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border shadow-sm" data-testid="card-recent-jobs">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-indigo-600" />
                Recent Projects
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-2 font-medium text-slate-600">Status</th>
                      <th className="text-left py-3 px-2 font-medium text-slate-600">Date</th>
                      <th className="text-left py-3 px-2 font-medium text-slate-600">Customer</th>
                      <th className="text-left py-3 px-2 font-medium text-slate-600 hidden sm:table-cell">
                        Technician
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentJobs.map((job, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-slate-100 last:border-0"
                        data-testid={`recent-job-row-${idx}`}
                      >
                        <td className="py-3 px-2">
                          <Badge variant="outline" className="text-slate-400 border-slate-200">
                            {job.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-slate-500">{job.date}</td>
                        <td className="py-3 px-2 text-slate-700 font-medium">{job.customer}</td>
                        <td className="py-3 px-2 text-slate-500 hidden sm:table-cell">
                          {job.technician}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                <p className="text-xs text-slate-400">Job data will appear when available</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white border shadow-sm" data-testid="card-activity">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold text-slate-900">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((_, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0"
                  data-testid={`activity-item-${idx}`}
                >
                  <div className="w-2 h-2 rounded-full bg-slate-300" />
                  <div className="flex-1">
                    <p className="text-sm text-slate-400">—</p>
                  </div>
                  <span className="text-xs text-slate-400">—</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-400">Activity feed coming soon</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </CrmLayout>
  );
}
