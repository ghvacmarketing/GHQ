import { useEffect } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Wrench,
  HardHat,
  Settings2,
  Target,
  TrendingUp,
  TrendingDown,
  Calendar,
  RefreshCw,
  DollarSign,
  Users,
  User,
} from "lucide-react";
import { PageHeader } from "@/components/crm/ui-kit";
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser } from "@shared/schema";

type CategoryData = {
  dailyGoal: number;
  dailyActual: number;
  mtdGoal: number;
  mtdActual: number;
  difference: number;
  percentComplete: number;
};

type SalesData = {
  mtdGoal: number;
  mtdActual: number;
  difference: number;
  percentComplete: number;
};

type TechMetric = {
  dailyGoal: number;
  mtdGoal: number;
  mtdActual: number;
  difference: number;
  percentComplete: number;
};

type TechnicianData = {
  id: string;
  name: string;
  service: TechMetric;
  install: TechMetric;
  maintenance: TechMetric;
  total: TechMetric;
};

type TrackerData = {
  month: string;
  year: number;
  dayOfMonth: number;
  daysInMonth: number;
  hasGoals: boolean;
  service: CategoryData;
  install: CategoryData;
  maintenance: CategoryData;
  total: CategoryData;
  sales: SalesData;
  technicians: TechnicianData[];
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function GoalCard({
  title,
  icon: Icon,
  iconBg,
  cardBg,
  data,
}: {
  title: string;
  icon: typeof Wrench;
  iconBg: string;
  cardBg: string;
  data: CategoryData;
}) {
  const isAhead = data.difference >= 0;
  
  return (
    <Card className={`border-2 shadow-sm hover:shadow-md transition-shadow ${cardBg}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-600">{title}</CardTitle>
          <div className={`p-2 rounded-lg ${iconBg}`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-500 mb-1">Daily Goal</p>
            <p className="text-lg font-bold text-slate-900" data-testid={`text-${title.toLowerCase()}-daily-goal`}>
              {formatCurrency(data.dailyGoal)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Today Actual</p>
            <p className="text-lg font-bold text-slate-900" data-testid={`text-${title.toLowerCase()}-daily-actual`}>
              {formatCurrency(data.dailyActual)}
            </p>
          </div>
        </div>
        
        <div className="border-t pt-4">
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <p className="text-xs text-slate-500 mb-1">MTD Goal</p>
              <p className="text-base font-semibold text-slate-800" data-testid={`text-${title.toLowerCase()}-mtd-goal`}>
                {formatCurrency(data.mtdGoal)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">MTD Actual</p>
              <p className="text-base font-semibold text-slate-800" data-testid={`text-${title.toLowerCase()}-mtd-actual`}>
                {formatCurrency(data.mtdActual)}
              </p>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Progress</span>
              <span className="text-xs font-medium text-slate-700">{data.percentComplete}%</span>
            </div>
            <Progress 
              value={Math.min(data.percentComplete, 100)} 
              className="h-2"
            />
          </div>
          
          <div className={`flex items-center gap-1 mt-3 ${isAhead ? "text-emerald-600" : "text-red-600"}`}>
            {isAhead ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            <span className="text-sm font-medium" data-testid={`text-${title.toLowerCase()}-difference`}>
              {isAhead ? "+" : ""}{formatCurrency(data.difference)}
            </span>
            <span className="text-xs text-slate-500 ml-1">
              {isAhead ? "ahead of goal" : "behind goal"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CrmGoalsTracker() {
  usePageTitle("Goals Tracker");
  const [, navigate] = useLocation();

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: trackerData, isLoading: trackerLoading, refetch } = useQuery<TrackerData>({
    queryKey: ["/api/crm/goals/tracker"],
    enabled: !!currentUser,
  });


  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  if (authLoading || trackerLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const categories = [
    {
      title: "Service",
      icon: Wrench,
      iconBg: "bg-cyan-500",
      cardBg: "bg-cyan-50 border-cyan-200",
      data: trackerData?.service,
    },
    {
      title: "Install",
      icon: HardHat,
      iconBg: "bg-yellow-500",
      cardBg: "bg-yellow-50 border-yellow-200",
      data: trackerData?.install,
    },
    {
      title: "Maintenance",
      icon: Settings2,
      iconBg: "bg-green-500",
      cardBg: "bg-green-50 border-green-200",
      data: trackerData?.maintenance,
    },
    {
      title: "Total",
      icon: Target,
      iconBg: "bg-[#711419]",
      cardBg: "bg-slate-50 border-slate-200",
      data: trackerData?.total,
    },
  ];

  const defaultData: CategoryData = {
    dailyGoal: 0,
    dailyActual: 0,
    mtdGoal: 0,
    mtdActual: 0,
    difference: 0,
    percentComplete: 0,
  };

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <PageHeader
          title={<span data-testid="text-goals-title">Goals Tracker</span>}
          description={
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {trackerData?.month} {trackerData?.year} — Day {trackerData?.dayOfMonth} of {trackerData?.daysInMonth}
            </span>
          }
          actions={
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2" data-testid="button-refresh-goals">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          }
        />


        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <GoalCard
              key={cat.title}
              title={cat.title}
              icon={cat.icon}
              iconBg={cat.iconBg}
              cardBg={cat.cardBg}
              data={cat.data || defaultData}
            />
          ))}
        </div>

        <Card className="border-2 border-red-200 bg-red-50 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500 rounded-lg">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg text-red-900">Sales Performance</CardTitle>
                <p className="text-sm text-red-600">Monthly sales team performance vs goal</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-xs text-slate-500 mb-1">Monthly Goal</p>
                <p className="text-2xl font-bold text-slate-900" data-testid="text-sales-mtd-goal">
                  {formatCurrency(trackerData?.sales?.mtdGoal || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">MTD Actual</p>
                <p className="text-2xl font-bold text-slate-900" data-testid="text-sales-mtd-actual">
                  {formatCurrency(trackerData?.sales?.mtdActual || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Difference</p>
                <p 
                  className={`text-2xl font-bold ${
                    (trackerData?.sales?.difference || 0) >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                  data-testid="text-sales-difference"
                >
                  {(trackerData?.sales?.difference || 0) >= 0 ? "+" : ""}
                  {formatCurrency(trackerData?.sales?.difference || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">% Complete</p>
                <div className="flex items-center gap-3">
                  <p className="text-2xl font-bold text-slate-900" data-testid="text-sales-percent">
                    {trackerData?.sales?.percentComplete || 0}%
                  </p>
                  {(trackerData?.sales?.difference || 0) >= 0 ? (
                    <TrendingUp className="h-6 w-6 text-emerald-500" />
                  ) : (
                    <TrendingDown className="h-6 w-6 text-red-500" />
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4">
              <Progress 
                value={Math.min(trackerData?.sales?.percentComplete || 0, 100)} 
                className="h-3"
              />
            </div>
          </CardContent>
        </Card>

        {trackerData?.technicians && trackerData.technicians.length > 0 && (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Technician Performance</CardTitle>
                  <p className="text-sm text-slate-500">Individual technician goals (total goal ÷ {trackerData.technicians.length} techs)</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-2 font-semibold text-slate-600">Technician</th>
                      <th className="text-right py-3 px-2 font-semibold text-slate-600">Daily Goal</th>
                      <th className="text-right py-3 px-2 font-semibold text-slate-600">Service</th>
                      <th className="text-right py-3 px-2 font-semibold text-slate-600">Install</th>
                      <th className="text-right py-3 px-2 font-semibold text-slate-600">Maintenance</th>
                      <th className="text-right py-3 px-2 font-semibold text-slate-600">Total MTD</th>
                      <th className="text-right py-3 px-2 font-semibold text-slate-600">% Goal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trackerData.technicians.map((tech) => (
                      <tr key={tech.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`row-tech-${tech.id}`}>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-slate-100 rounded-full">
                              <User className="h-4 w-4 text-slate-500" />
                            </div>
                            <span className="font-medium text-slate-900">{tech.name}</span>
                          </div>
                        </td>
                        <td className="text-right py-3 px-2">
                          <div className="flex flex-col items-end">
                            <span className="font-semibold text-slate-900">{formatCurrency(tech.total.dailyGoal)}</span>
                            <span className="text-xs text-slate-400">per day</span>
                          </div>
                        </td>
                        <td className="text-right py-3 px-2">
                          <span className="font-semibold text-slate-900">{formatCurrency(tech.service.mtdActual)}</span>
                          <span className="text-xs text-slate-500"> / {formatCurrency(tech.service.dailyGoal)}</span>
                        </td>
                        <td className="text-right py-3 px-2">
                          <span className="font-semibold text-slate-900">{formatCurrency(tech.install.mtdActual)}</span>
                          <span className="text-xs text-slate-500"> / {formatCurrency(tech.install.dailyGoal)}</span>
                        </td>
                        <td className="text-right py-3 px-2">
                          <span className="font-semibold text-slate-900">{formatCurrency(tech.maintenance.mtdActual)}</span>
                          <span className="text-xs text-slate-500"> / {formatCurrency(tech.maintenance.dailyGoal)}</span>
                        </td>
                        <td className="text-right py-3 px-2">
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-slate-900">{formatCurrency(tech.total.mtdActual)}</span>
                            <span className="text-xs text-slate-500">/ {formatCurrency(tech.total.mtdGoal)}</span>
                          </div>
                        </td>
                        <td className="text-right py-3 px-2">
                          <div className="flex items-center justify-end gap-2">
                            <span className={`font-bold ${tech.total.percentComplete >= 100 ? 'text-emerald-600' : tech.total.percentComplete >= 75 ? 'text-amber-600' : 'text-red-600'}`}>
                              {tech.total.percentComplete}%
                            </span>
                            {tech.total.difference >= 0 ? (
                              <TrendingUp className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-500" />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </CrmLayout>
  );
}
