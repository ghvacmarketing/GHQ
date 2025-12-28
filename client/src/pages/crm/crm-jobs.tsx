import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Plus,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format } from "date-fns";
import type { CrmUser, CrmJob } from "@shared/schema";

type JobWithDetails = CrmJob & {
  customerName: string;
  assignedTechId: string | null;
  assignedTechName: string | null;
};

type JobsResponse = {
  jobs: JobWithDetails[];
  total: number;
  page: number;
  limit: number;
};

const ITEMS_PER_PAGE = 50;

type FilterTab = "all" | "upcoming" | "past" | "completed" | "incomplete" | "cancelled";

const filterTabConfig: Record<FilterTab, { label: string; status?: string; dateFilter?: string }> = {
  all: { label: "All Jobs" },
  upcoming: { label: "Upcoming", dateFilter: "upcoming" },
  past: { label: "Past", dateFilter: "past" },
  completed: { label: "Complete", status: "completed" },
  incomplete: { label: "Incomplete" },
  cancelled: { label: "Canceled", status: "cancelled" },
};

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  new: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
  scheduled: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  dispatched: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  en_route: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  on_site: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  completed: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  invoiced: { bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-200" },
  paid: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  cancelled: { bg: "bg-red-100", text: "text-red-500", border: "border-red-200" },
};

const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  normal: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  high: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  urgent: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
};

const statusLabels: Record<string, string> = {
  new: "New",
  scheduled: "Scheduled",
  dispatched: "Dispatched",
  en_route: "En Route",
  on_site: "On Site",
  completed: "Completed",
  invoiced: "Invoiced",
  paid: "Paid",
  cancelled: "Cancelled",
};

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function CrmJobs() {
  const [, navigate] = useLocation();
  const [searchInput, setSearchInput] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(searchInput, 300);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeTab]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    
    const tabConfig = filterTabConfig[activeTab];
    
    if (tabConfig.status) {
      params.set("status", tabConfig.status);
    } else if (activeTab === "incomplete") {
      params.set("status", "all");
    }
    
    if (tabConfig.dateFilter) {
      params.set("dateFilter", tabConfig.dateFilter);
    }
    
    params.set("page", String(page));
    params.set("limit", String(ITEMS_PER_PAGE));
    return params.toString();
  }, [debouncedSearch, activeTab, page]);

  const { data: jobsData, isLoading: jobsLoading } = useQuery<JobsResponse>({
    queryKey: ["/api/crm/jobs", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/crm/jobs?${queryParams}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const jobs = useMemo(() => {
    let result = jobsData?.jobs || [];
    if (activeTab === "incomplete") {
      result = result.filter(job => !["completed", "invoiced", "paid", "cancelled"].includes(job.status));
    }
    return result;
  }, [jobsData?.jobs, activeTab]);

  const total = activeTab === "incomplete" ? jobs.length : (jobsData?.total || 0);
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const formatDate = (dateStr: string | Date | null) => {
    if (!dateStr) return "—";
    try {
      return format(new Date(dateStr), "MMM d, yyyy h:mm a");
    } catch {
      return "—";
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-jobs-title">
              Jobs
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              <span className="font-medium text-slate-700" data-testid="text-jobs-count">
                Total: {total.toLocaleString()}
              </span>
            </p>
          </div>
          <Button
            variant="default"
            className="gap-2"
            data-testid="button-create-job"
            onClick={() => navigate("/crm/dispatch")}
          >
            <Plus className="h-4 w-4" />
            Create Job
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FilterTab)}>
          <TabsList className="grid w-full grid-cols-6" data-testid="tabs-job-filter">
            {Object.entries(filterTabConfig).map(([key, config]) => (
              <TabsTrigger key={key} value={key} data-testid={`tab-${key}`}>
                {config.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Card className="bg-white border shadow-sm">
          <CardContent className="p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by customer name or job type..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10"
                data-testid="input-search-jobs"
              />
            </div>

            {jobsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Briefcase className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                <p className="font-medium" data-testid="text-no-jobs">No jobs found</p>
                <p className="text-sm">Try adjusting your search or filters</p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead>Date</TableHead>
                        <TableHead>Job Type</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Assigned Tech</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Priority</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((job) => {
                        const statusStyle = statusColors[job.status] || statusColors.new;
                        const priorityStyle = priorityColors[job.priority || "normal"] || priorityColors.normal;
                        
                        return (
                          <TableRow
                            key={job.id}
                            className="cursor-pointer hover:bg-slate-50"
                            onClick={() => navigate(`/crm/dispatch`)}
                            data-testid={`row-job-${job.id}`}
                          >
                            <TableCell className="font-medium" data-testid={`text-job-date-${job.id}`}>
                              {formatDate(job.scheduledStart)}
                            </TableCell>
                            <TableCell data-testid={`text-job-type-${job.id}`}>
                              {job.jobType || "—"}
                            </TableCell>
                            <TableCell data-testid={`text-job-customer-${job.id}`}>
                              {job.customerName}
                            </TableCell>
                            <TableCell data-testid={`text-job-tech-${job.id}`}>
                              {job.assignedTechName || "Unassigned"}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant="outline" 
                                className={`${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                                data-testid={`badge-job-status-${job.id}`}
                              >
                                {statusLabels[job.status] || job.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant="outline" 
                                className={`${priorityStyle.bg} ${priorityStyle.text} ${priorityStyle.border} capitalize`}
                                data-testid={`badge-job-priority-${job.id}`}
                              >
                                {job.priority || "normal"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-slate-500" data-testid="text-pagination-info">
                      Page {page} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        data-testid="button-next-page"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </CrmLayout>
  );
}
