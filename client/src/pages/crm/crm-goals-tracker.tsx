import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Wrench,
  HardHat,
  Settings2,
  Target,
  TrendingUp,
  TrendingDown,
  Calendar,
  RefreshCw,
  Upload,
  DollarSign,
} from "lucide-react";
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
  data,
}: {
  title: string;
  icon: typeof Wrench;
  iconBg: string;
  data: CategoryData;
}) {
  const isAhead = data.difference >= 0;
  
  return (
    <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
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
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: trackerData, isLoading: trackerLoading, refetch } = useQuery<TrackerData>({
    queryKey: ["/api/crm/goals/tracker"],
    enabled: !!currentUser,
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/crm/goals/import", { year: new Date().getFullYear() });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Goals Imported",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/goals/tracker"] });
    },
    onError: () => {
      toast({
        title: "Import Failed",
        description: "Failed to import goals from Excel file",
        variant: "destructive",
      });
    },
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
      iconBg: "bg-blue-500",
      data: trackerData?.service,
    },
    {
      title: "Install",
      icon: HardHat,
      iconBg: "bg-amber-500",
      data: trackerData?.install,
    },
    {
      title: "Maintenance",
      icon: Settings2,
      iconBg: "bg-emerald-500",
      data: trackerData?.maintenance,
    },
    {
      title: "Total",
      icon: Target,
      iconBg: "bg-[#711419]",
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-goals-title">
              Goals Tracker
            </h1>
            <p className="text-slate-500 text-sm flex items-center gap-2 mt-1">
              <Calendar className="h-4 w-4" />
              {trackerData?.month} {trackerData?.year} — Day {trackerData?.dayOfMonth} of {trackerData?.daysInMonth}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-2"
              data-testid="button-refresh-goals"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            {currentUser.role !== "tech" && (
              <Button
                size="sm"
                onClick={() => importMutation.mutate()}
                disabled={importMutation.isPending}
                className="gap-2 bg-[#711419] hover:bg-[#8a1a1f]"
                data-testid="button-import-goals"
              >
                <Upload className="h-4 w-4" />
                {importMutation.isPending ? "Importing..." : "Import Goals"}
              </Button>
            )}
          </div>
        </div>

        {!trackerData?.hasGoals && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Target className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium text-amber-800">No Goals Set</p>
                  <p className="text-sm text-amber-600">
                    Click "Import Goals" to load goals from the Excel spreadsheet for {trackerData?.month} {trackerData?.year}.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <GoalCard
              key={cat.title}
              title={cat.title}
              icon={cat.icon}
              iconBg={cat.iconBg}
              data={cat.data || defaultData}
            />
          ))}
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#711419] rounded-lg">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">Sales Performance</CardTitle>
                <p className="text-sm text-slate-500">Monthly sales team performance vs goal</p>
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
      </div>
    </CrmLayout>
  );
}
