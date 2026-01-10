import { useEffect, useState, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Plus,
  Loader2,
  ClipboardList,
  DollarSign,
  Calendar,
  Check,
  ChevronsUpDown,
  BarChart3,
  LayoutGrid,
  CalendarDays,
  Activity,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameDay, isSameMonth, startOfWeek, endOfWeek, isWithinInterval, addDays, isBefore, isAfter, startOfDay } from "date-fns";
import type { CrmUser, CrmProject, CrmProperty } from "@shared/schema";
import { cn } from "@/lib/utils";

type ProjectWithDetails = CrmProject & {
  customerName: string | null;
  workOrderCount: number;
  hasUpcomingWorkOrders: boolean;
};

type ProjectsResponse = {
  projects: ProjectWithDetails[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};

type CustomerWithInfo = {
  id: string;
  name: string;
  customerType: string;
  customerStatus: string;
  fullAddress: string | null;
  phone: string | null;
  email: string | null;
  leadSource: string | null;
  createdAt: string;
  origin: 'crm' | 'legacy';
};

type CustomersResponse = {
  customers: CustomerWithInfo[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const ITEMS_PER_PAGE = 25;

type FilterTab = "all" | "lead" | "equipment_ordered" | "equipment_arrived" | "in_progress" | "completed" | "closed" | "cancelled";

const filterTabConfig: Record<FilterTab, { label: string }> = {
  all: { label: "All Projects" },
  lead: { label: "New" },
  equipment_ordered: { label: "Equipment Ordered" },
  equipment_arrived: { label: "Equipment Arrived" },
  in_progress: { label: "In Progress" },
  completed: { label: "Completed" },
  closed: { label: "Closed" },
  cancelled: { label: "Cancelled" },
};

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  lead: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
  proposal_sent: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  equipment_ordered: { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200" },
  equipment_arrived: { bg: "bg-lime-100", text: "text-lime-700", border: "border-lime-200" },
  in_progress: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  closed: { bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-200" },
  cancelled: { bg: "bg-red-100", text: "text-red-500", border: "border-red-200" },
  archived: { bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200" },
};

const statusLabels: Record<string, string> = {
  lead: "New",
  proposal_sent: "Proposal Sent",
  equipment_ordered: "Equipment Ordered",
  equipment_arrived: "Equipment Arrived",
  in_progress: "In Progress",
  completed: "Completed",
  closed: "Closed",
  cancelled: "Cancelled",
  archived: "Archived",
};

const projectTypeColors: Record<string, { bg: string; text: string; border: string }> = {
  INSTALL: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  DUCT: { bg: "bg-cyan-100", text: "text-cyan-700", border: "border-cyan-200" },
  COMMERCIAL: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  CRAWLSPACE: { bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-200" },
  MAJOR_REPAIR: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
};

const projectTypeLabels: Record<string, string> = {
  INSTALL: "Install",
  DUCT: "Duct",
  COMMERCIAL: "Commercial",
  CRAWLSPACE: "Crawlspace",
  MAJOR_REPAIR: "Major Repair",
};

const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  normal: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  high: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  urgent: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
};

const PROJECT_TYPES = ["INSTALL", "DUCT", "COMMERCIAL", "CRAWLSPACE", "MAJOR_REPAIR"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function CrmProjects() {
  usePageTitle("Projects");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [activeFilterTab, setActiveFilterTab] = useState<FilterTab>("all");
  const [activeTab, setActiveTab] = useState<"overview" | "pipeline" | "calendar">("pipeline");
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [page, setPage] = useState(1);
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithInfo | null>(null);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<CrmProperty | null>(null);
  const [title, setTitle] = useState("");
  const [projectType, setProjectType] = useState<string>("INSTALL");
  const [expectedValue, setExpectedValue] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("normal");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  const debouncedSearch = useDebounce(searchInput, 300);
  const debouncedCustomerSearch = useDebounce(customerSearch, 300);

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
  }, [debouncedSearch, activeFilterTab]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    
    if (activeFilterTab !== "all") {
      params.set("status", activeFilterTab);
    }
    
    params.set("page", String(page));
    params.set("limit", String(ITEMS_PER_PAGE));
    return params.toString();
  }, [debouncedSearch, activeFilterTab, page]);

  const { data: projectsData, isLoading: projectsLoading } = useQuery<ProjectsResponse>({
    queryKey: ["/api/crm/projects", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects?${queryParams}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const { data: statsData, isLoading: statsLoading } = useQuery<{
    activeProjects: number;
    pendingActions: number;
    pipelineValue: number;
    completionRate: string;
    statusFunnel: Record<string, number>;
  }>({
    queryKey: ["/api/crm/projects/stats"],
  });

  // Separate query for calendar view - fetches all scheduled projects without pagination
  const calendarQueryParams = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const params = new URLSearchParams();
    params.set("hasSchedule", "true");
    params.set("limit", "1000"); // Get all scheduled projects
    return params.toString();
  }, [calendarMonth]);

  const { data: calendarProjectsData, isLoading: calendarLoading } = useQuery<ProjectsResponse>({
    queryKey: ["/api/crm/projects/calendar", calendarQueryParams],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects?${calendarQueryParams}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch calendar projects");
      return res.json();
    },
    enabled: !!currentUser && activeTab === "calendar",
  });

  const { data: customersData, isLoading: customersLoading } = useQuery<CustomersResponse>({
    queryKey: ["/api/crm/customers", debouncedCustomerSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedCustomerSearch) params.set("search", debouncedCustomerSearch);
      params.set("limit", "20");
      const res = await fetch(`/api/crm/customers?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
    enabled: !!currentUser && createDialogOpen,
  });

  // Fetch sites for the selected customer
  const { data: sitesData, isLoading: sitesLoading } = useQuery<CrmProperty[]>({
    queryKey: ["/api/crm/properties", selectedCustomer?.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/properties?customerId=${selectedCustomer?.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch sites");
      return res.json();
    },
    enabled: !!currentUser && !!selectedCustomer,
  });

  const sites = sitesData || [];

  const createProjectMutation = useMutation({
    mutationFn: async (data: {
      customerId: string;
      propertyId?: string;
      title: string;
      projectType: string;
      expectedValue?: string;
      description?: string;
      priority?: string;
      startDate: string;
      endDate: string;
    }) => {
      return apiRequest("POST", "/api/crm/projects", data);
    },
    onSuccess: () => {
      toast({
        title: "Project created",
        description: "The project has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      resetCreateForm();
      setCreateDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create project",
        variant: "destructive",
      });
    },
  });

  const resetCreateForm = () => {
    setCustomerSearch("");
    setSelectedCustomer(null);
    setSelectedSite(null);
    setTitle("");
    setProjectType("INSTALL");
    setExpectedValue("");
    setDescription("");
    setPriority("normal");
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const handleCreateProject = () => {
    if (!selectedCustomer || !title || !projectType) {
      toast({
        title: "Missing required fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    // Date range is required so projects appear on calendar
    if (!startDate || !endDate) {
      toast({
        title: "Schedule required",
        description: "Please select a start and end date for the project.",
        variant: "destructive",
      });
      return;
    }

    // If customer has sites, require site selection
    if (sites.length > 0 && !selectedSite) {
      toast({
        title: "Location required",
        description: "Please select a location for this customer.",
        variant: "destructive",
      });
      return;
    }

    createProjectMutation.mutate({
      customerId: selectedCustomer.id,
      propertyId: selectedSite?.id || undefined,
      title,
      projectType,
      expectedValue: expectedValue || undefined,
      description: description || undefined,
      priority: priority || undefined,
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: format(endDate, "yyyy-MM-dd"),
    });
  };

  const formatCurrency = (value: string | null | undefined) => {
    if (!value) return "—";
    const num = parseFloat(value);
    if (isNaN(num)) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "—";
    try {
      return format(new Date(date), "MMM d, yyyy");
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

  const projects = projectsData?.projects || [];
  const total = projectsData?.pagination?.total || 0;
  const totalPages = projectsData?.pagination?.totalPages || Math.ceil(total / ITEMS_PER_PAGE);

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FolderKanban className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold">Projects</h1>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Project
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full max-w-md grid-cols-3 mb-6">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            Pipeline
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statsLoading ? <Skeleton className="h-8 w-16" /> : statsData?.activeProjects ?? 0}</div>
                <p className="text-xs text-muted-foreground">Projects in progress</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Actions</CardTitle>
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statsLoading ? <Skeleton className="h-8 w-16" /> : statsData?.pendingActions ?? 0}</div>
                <p className="text-xs text-muted-foreground">Need attention</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? <Skeleton className="h-8 w-20" /> : `$${(statsData?.pipelineValue ?? 0).toLocaleString()}`}
                </div>
                <p className="text-xs text-muted-foreground">Active project value</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statsLoading ? <Skeleton className="h-8 w-16" /> : `${statsData?.completionRate ?? 0}%`}</div>
                <p className="text-xs text-muted-foreground">Projects completed</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-lg">Project Status Funnel</CardTitle>
              <CardDescription>Click a status to filter the pipeline view</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                {Object.entries(statusLabels).filter(([key]) => key !== "archived" && key !== "proposal_sent").map(([status, label]) => {
                  const count = statsData?.statusFunnel?.[status] ?? 0;
                  const colors = statusColors[status] || statusColors.lead;
                  return (
                    <button
                      key={status}
                      onClick={() => {
                        setActiveFilterTab(status as FilterTab);
                        setActiveTab("pipeline");
                      }}
                      className={cn(
                        "p-4 rounded-lg border-2 transition-all hover:scale-105",
                        colors.bg, colors.border
                      )}
                    >
                      <div className={cn("text-2xl font-bold", colors.text)}>{count}</div>
                      <div className="text-xs text-muted-foreground mt-1">{label}</div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Scheduled Projects */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Scheduled Projects</CardTitle>
              <CardDescription>Projects with scheduled dates in the next 14 days</CardDescription>
            </CardHeader>
            <CardContent>
              {projectsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (() => {
                const today = startOfDay(new Date());
                const twoWeeksOut = addDays(today, 14);
                
                // Get unique projects with dates in the next 14 days
                const upcomingProjects = projects.filter(project => {
                  if (!project.startDate && !project.endDate) return false;
                  const startDate = project.startDate ? startOfDay(new Date(project.startDate)) : null;
                  const endDate = project.endDate ? startOfDay(new Date(project.endDate)) : null;
                  
                  // Include if start or end date is within 14 days
                  const startInRange = startDate && !isBefore(startDate, today) && !isAfter(startDate, twoWeeksOut);
                  const endInRange = endDate && !isBefore(endDate, today) && !isAfter(endDate, twoWeeksOut);
                  // Also include if project spans today (started before, ends after)
                  const spansToday = startDate && endDate && isBefore(startDate, today) && isAfter(endDate, today);
                  
                  return startInRange || endInRange || spansToday;
                });

                // Sort by earliest date (start date first, then end date)
                upcomingProjects.sort((a, b) => {
                  const aDate = a.startDate ? new Date(a.startDate) : (a.endDate ? new Date(a.endDate) : new Date());
                  const bDate = b.startDate ? new Date(b.startDate) : (b.endDate ? new Date(b.endDate) : new Date());
                  return aDate.getTime() - bDate.getTime();
                });
                
                if (upcomingProjects.length === 0) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <Calendar className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p>No scheduled projects in the next 14 days</p>
                      <p className="text-sm mt-1">Set start/end dates on projects to see them here</p>
                    </div>
                  );
                }
                
                return (
                  <div className="space-y-3">
                    {upcomingProjects.slice(0, 10).map((project) => {
                      const statusStyle = statusColors[project.status] || statusColors.lead;
                      const startDate = project.startDate ? startOfDay(new Date(project.startDate)) : null;
                      const endDate = project.endDate ? startOfDay(new Date(project.endDate)) : null;
                      
                      const startDaysAway = startDate ? Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
                      const endDaysAway = endDate ? Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
                      
                      const formatDaysAway = (days: number) => {
                        if (days < 0) return `${Math.abs(days)}d ago`;
                        if (days === 0) return "Today";
                        if (days === 1) return "Tomorrow";
                        return `In ${days}d`;
                      };
                      
                      return (
                        <button
                          key={project.id}
                          onClick={() => navigate(`/crm/projects/${project.id}`)}
                          className="w-full text-left p-4 rounded-lg border hover:bg-muted/50 transition-colors flex items-center justify-between gap-4"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium truncate">{project.title}</span>
                              <Badge className={cn("text-xs", statusStyle.bg, statusStyle.text, statusStyle.border)}>
                                {statusLabels[project.status] || project.status}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {project.customerName || "No customer"}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 space-y-0.5">
                            {startDate && (
                              <div className="text-sm">
                                <span className="text-blue-600 font-medium">{format(startDate, "MMM d")}</span>
                                <span className="text-xs text-muted-foreground ml-1">({formatDaysAway(startDaysAway!)})</span>
                              </div>
                            )}
                            {endDate && startDate && endDate.getTime() !== startDate.getTime() && (
                              <div className="text-sm">
                                <span className="text-orange-600 font-medium">{format(endDate, "MMM d")}</span>
                                <span className="text-xs text-muted-foreground ml-1">({formatDaysAway(endDaysAway!)})</span>
                              </div>
                            )}
                            {endDate && !startDate && (
                              <div className="text-sm">
                                <span className="text-orange-600 font-medium">{format(endDate, "MMM d")}</span>
                                <span className="text-xs text-muted-foreground ml-1">({formatDaysAway(endDaysAway!)})</span>
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {upcomingProjects.length > 10 && (
                      <p className="text-sm text-center text-muted-foreground pt-2">
                        +{upcomingProjects.length - 10} more projects
                      </p>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pipeline">
          <div className="space-y-4">
            {/* Search bar at top - DoorLoop style */}
            <div className="flex justify-center mb-2">
              <div className="relative w-full max-w-xl">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search projects..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-10 h-10 text-sm bg-white border-slate-300 focus:border-[#711419] focus:ring-[#711419] rounded-lg"
                  data-testid="input-search-projects"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total: {total}</p>
              </div>
            </div>

            {/* Status filter tabs - underline style */}
            <div className="flex overflow-x-auto border-b border-slate-200">
              {(Object.keys(filterTabConfig) as FilterTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveFilterTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                    activeFilterTab === tab
                      ? "border-[#711419] text-[#711419]"
                      : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                  }`}
                  data-testid={`tab-status-${tab}`}
                >
                  {filterTabConfig[tab].label}
                </button>
              ))}
            </div>

            {projectsLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-48 rounded-xl" />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <Card className="bg-white border shadow-sm">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FolderKanban className="h-12 w-12 text-slate-300 mb-4" />
                  <p className="text-slate-500 text-center">No projects found</p>
                  <p className="text-slate-400 text-sm text-center mt-1">
                    Create a new project to get started
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => {
                  const status = project.status || "lead";
                  const statusStyle = statusColors[status] || statusColors.lead;
                  const typeStyle = projectTypeColors[project.projectType] || projectTypeColors.INSTALL;

                  return (
                    <Card
                      key={project.id}
                      className="bg-white border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => navigate(`/crm/projects/${project.id}`)}
                      data-testid={`card-project-${project.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="font-semibold text-slate-900 line-clamp-2 flex-1 mr-2">
                            {project.title}
                          </h3>
                          <Badge
                            className={cn(
                              "text-xs border flex-shrink-0",
                              statusStyle.bg,
                              statusStyle.text,
                              statusStyle.border
                            )}
                          >
                            {statusLabels[status] || status}
                          </Badge>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <span className="font-medium">Customer:</span>
                            <span className="truncate">{project.customerName || "—"}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge
                              className={cn(
                                "text-xs border",
                                typeStyle.bg,
                                typeStyle.text,
                                typeStyle.border
                              )}
                            >
                              {projectTypeLabels[project.projectType] || project.projectType}
                            </Badge>
                            {project.priority && project.priority !== "normal" && (
                              <Badge
                                className={cn(
                                  "text-xs border",
                                  priorityColors[project.priority]?.bg || "bg-slate-100",
                                  priorityColors[project.priority]?.text || "text-slate-600",
                                  priorityColors[project.priority]?.border || "border-slate-200"
                                )}
                              >
                                {project.priority}
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                            <div className="flex items-center gap-1 text-sm">
                              <DollarSign className="h-4 w-4 text-green-600" />
                              <span className="font-medium text-green-700">
                                {formatCurrency(project.expectedValue)}
                              </span>
                            </div>
                            {project.workOrderCount > 0 && (
                              <div className="flex items-center gap-1 text-sm text-slate-500">
                                <ClipboardList className="h-4 w-4" />
                                <span>{project.workOrderCount} WO{project.workOrderCount !== 1 ? "s" : ""}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <Calendar className="h-3 w-3" />
                            <span>Created {formatDate(project.createdAt)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t">
                <p className="text-sm text-slate-500">
                  Showing {(page - 1) * ITEMS_PER_PAGE + 1} to{" "}
                  {Math.min(page * ITEMS_PER_PAGE, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-slate-600">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <div className="space-y-4">
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="outline" size="sm" onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="text-lg font-semibold">{format(calendarMonth, "MMMM yyyy")}</h2>
              <Button variant="outline" size="sm" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Status Legend */}
            <div className="flex flex-wrap gap-2 mb-4">
              {Object.entries(statusColors).filter(([key]) => !["archived", "proposal_sent"].includes(key)).map(([status, colors]) => (
                <div key={status} className="flex items-center gap-1.5 text-xs">
                  <div className={cn("w-3 h-3 rounded", colors.bg, colors.border, "border")} />
                  <span>{statusLabels[status]}</span>
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            {calendarLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              </div>
            ) : (
            <div className="border rounded-lg overflow-hidden">
              {/* Weekday headers */}
              <div className="grid grid-cols-7 bg-muted">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                  <div key={day} className="p-2 text-center text-sm font-medium border-b">{day}</div>
                ))}
              </div>
              
              {/* Calendar days */}
              <div className="grid grid-cols-7">
                {(() => {
                  const monthStart = startOfMonth(calendarMonth);
                  const monthEnd = endOfMonth(calendarMonth);
                  const calendarStart = startOfWeek(monthStart);
                  const calendarEnd = endOfWeek(monthEnd);
                  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
                  
                  // Assign lanes to projects for consistent vertical positioning
                  const projectLanes = new Map<string, number>();
                  const allProjects = calendarProjectsData?.projects || [];
                  
                  // Sort projects by start date, then by duration (longer first)
                  const sortedProjects = [...allProjects]
                    .filter(p => p.startDate)
                    .sort((a, b) => {
                      const aStart = new Date(a.startDate!).getTime();
                      const bStart = new Date(b.startDate!).getTime();
                      if (aStart !== bStart) return aStart - bStart;
                      const aEnd = a.endDate ? new Date(a.endDate).getTime() : aStart;
                      const bEnd = b.endDate ? new Date(b.endDate).getTime() : bStart;
                      return (bEnd - bStart) - (aEnd - aStart);
                    });
                  
                  // Assign each project to a lane
                  sortedProjects.forEach(project => {
                    const projectStart = startOfDay(new Date(project.startDate!));
                    const projectEnd = project.endDate ? startOfDay(new Date(project.endDate)) : projectStart;
                    
                    // Find first available lane
                    let lane = 0;
                    while (true) {
                      let laneAvailable = true;
                      const entries = Array.from(projectLanes.entries());
                      for (let i = 0; i < entries.length; i++) {
                        const [otherId, otherLane] = entries[i];
                        if (otherLane !== lane) continue;
                        const other = sortedProjects.find(p => p.id === otherId);
                        if (!other) continue;
                        const otherStart = startOfDay(new Date(other.startDate!));
                        const otherEnd = other.endDate ? startOfDay(new Date(other.endDate)) : otherStart;
                        // Check if ranges overlap
                        if (!(isAfter(projectStart, otherEnd) || isBefore(projectEnd, otherStart))) {
                          laneAvailable = false;
                          break;
                        }
                      }
                      if (laneAvailable) break;
                      lane++;
                    }
                    projectLanes.set(project.id, lane);
                  });
                  
                  return days.map((day, dayIndex) => {
                    const isCurrentMonth = isSameMonth(day, calendarMonth);
                    const dayStart = startOfDay(day);
                    const isStartOfWeek = dayIndex % 7 === 0;
                    const isEndOfWeek = dayIndex % 7 === 6;
                    
                    const dayProjects = allProjects.filter(project => {
                      if (!project.startDate) return false;
                      const projectStart = startOfDay(new Date(project.startDate));
                      const projectEnd = project.endDate ? startOfDay(new Date(project.endDate)) : projectStart;
                      return isSameDay(dayStart, projectStart) ||
                             isSameDay(dayStart, projectEnd) ||
                             (isAfter(dayStart, projectStart) && isBefore(dayStart, projectEnd));
                    });
                    
                    // Sort by lane for consistent rendering
                    const sortedDayProjects = [...dayProjects].sort((a, b) => 
                      (projectLanes.get(a.id) || 0) - (projectLanes.get(b.id) || 0)
                    );
                    
                    // Get max lane for this day to create proper spacing
                    const maxLane = Math.max(0, ...sortedDayProjects.map(p => projectLanes.get(p.id) || 0));
                    
                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          "min-h-[100px] border-b border-r relative",
                          !isCurrentMonth && "bg-muted/50 text-muted-foreground"
                        )}
                      >
                        <div className="text-xs font-medium p-1">{format(day, "d")}</div>
                        <div className="relative" style={{ height: `${Math.min(maxLane + 1, 3) * 24 + 4}px` }}>
                          {sortedDayProjects.slice(0, 3).map(project => {
                            const lane = projectLanes.get(project.id) || 0;
                            if (lane > 2) return null; // Only show first 3 lanes
                            
                            const colors = statusColors[project.status] || statusColors.lead;
                            const projectStart = startOfDay(new Date(project.startDate!));
                            const projectEnd = project.endDate ? startOfDay(new Date(project.endDate)) : projectStart;
                            
                            const isFirst = isSameDay(dayStart, projectStart);
                            const isLast = isSameDay(dayStart, projectEnd);
                            const isSingleDay = isFirst && isLast;
                            
                            const showRoundedLeft = isFirst || isStartOfWeek;
                            const showRoundedRight = isLast || isEndOfWeek;
                            
                            return (
                              <button
                                key={project.id}
                                onClick={() => navigate(`/crm/projects/${project.id}`)}
                                className={cn(
                                  "absolute left-0 right-0 text-left text-xs py-1 px-1.5 truncate h-5",
                                  colors.bg, colors.text,
                                  isSingleDay && "rounded mx-0.5",
                                  !isSingleDay && showRoundedLeft && !showRoundedRight && "rounded-l ml-0.5",
                                  !isSingleDay && !showRoundedLeft && showRoundedRight && "rounded-r mr-0.5",
                                  !isSingleDay && showRoundedLeft && showRoundedRight && "rounded mx-0.5"
                                )}
                                style={{ top: `${lane * 22}px` }}
                                title={`${project.customerName || "Customer"} - ${project.title}`}
                              >
                                {(isFirst || isStartOfWeek) ? (project.customerName || project.title) : ""}
                              </button>
                            );
                          })}
                        </div>
                        {dayProjects.length > 3 && (
                          <div className="text-xs text-muted-foreground px-1 absolute bottom-0.5">+{dayProjects.length - 3} more</div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={customerSearchOpen}
                    className="w-full justify-between"
                    data-testid="button-select-customer"
                  >
                    {selectedCustomer ? selectedCustomer.name : "Select customer..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput
                      placeholder="Search customers..."
                      value={customerSearch}
                      onValueChange={setCustomerSearch}
                      data-testid="input-customer-search"
                    />
                    <CommandList>
                      {customersLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                        </div>
                      ) : (
                        <>
                          <CommandEmpty>No customer found.</CommandEmpty>
                          <CommandGroup>
                            {customersData?.customers.map((customer) => (
                              <CommandItem
                                key={customer.id}
                                value={customer.name}
                                onSelect={() => {
                                  setSelectedCustomer(customer);
                                  setSelectedSite(null); // Reset site when customer changes
                                  setCustomerSearchOpen(false);
                                }}
                                data-testid={`customer-option-${customer.id}`}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedCustomer?.id === customer.id
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span>{customer.name}</span>
                                  {customer.fullAddress && (
                                    <span className="text-xs text-slate-500">
                                      {customer.fullAddress}
                                    </span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Location selection - shown only when customer is selected */}
            {selectedCustomer && (
              <div className="space-y-2">
                <Label htmlFor="location">
                  Location {sites.length > 0 && <span className="text-red-500">*</span>}
                </Label>
                {sitesLoading ? (
                  <div className="flex items-center gap-2 p-3 border rounded-md bg-slate-50">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    <span className="text-sm text-slate-500">Loading locations...</span>
                  </div>
                ) : sites.length > 0 ? (
                  <Select 
                    value={selectedSite?.id || ""} 
                    onValueChange={(value) => {
                      const site = sites.find(s => s.id === value);
                      setSelectedSite(site || null);
                    }}
                  >
                    <SelectTrigger data-testid="select-location">
                      <SelectValue placeholder="Select a location">
                        {selectedSite 
                          ? `${selectedSite.address1}${selectedSite.city ? `, ${selectedSite.city}` : ""}`
                          : "Select a location"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.tenantName || site.address1}
                          {site.city && `, ${site.city}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-slate-500 p-2">No locations for this customer</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Project title"
                data-testid="input-project-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectType">Project Type *</Label>
              <Select value={projectType} onValueChange={setProjectType}>
                <SelectTrigger data-testid="select-project-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {projectTypeLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                      data-testid="button-start-date"
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "MMM d, yyyy") : "Select start"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={startDate}
                      onSelect={(date) => {
                        setStartDate(date);
                        if (date && (!endDate || endDate < date)) {
                          setEndDate(date);
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>End Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                      data-testid="button-end-date"
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "MMM d, yyyy") : "Select end"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      disabled={(date) => startDate ? date < startDate : false}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expectedValue">Expected Value</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="expectedValue"
                  type="number"
                  value={expectedValue}
                  onChange={(e) => setExpectedValue(e.target.value)}
                  placeholder="0.00"
                  className="pl-9"
                  data-testid="input-expected-value"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Project description (optional)"
                rows={3}
                data-testid="textarea-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetCreateForm();
                setCreateDialogOpen(false);
              }}
              data-testid="button-cancel-create"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={createProjectMutation.isPending || !selectedCustomer || !title || !projectType || !startDate || !endDate || (sites.length > 0 && !selectedSite)}
              data-testid="button-submit-create"
            >
              {createProjectMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Project"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
