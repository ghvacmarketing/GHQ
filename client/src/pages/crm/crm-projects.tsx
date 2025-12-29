import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { CrmUser, CrmProject } from "@shared/schema";
import { cn } from "@/lib/utils";

type ProjectWithDetails = CrmProject & {
  customerName: string | null;
  workOrderCount: number;
  hasUpcomingWorkOrders: boolean;
};

type ProjectsResponse = {
  projects: ProjectWithDetails[];
  total: number;
  page: number;
  limit: number;
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

type FilterTab = "all" | "lead" | "approved" | "in_progress" | "completed" | "closed" | "cancelled";

const filterTabConfig: Record<FilterTab, { label: string }> = {
  all: { label: "All Projects" },
  lead: { label: "New / Needs Scheduling" },
  approved: { label: "Scheduled" },
  in_progress: { label: "In Progress" },
  completed: { label: "Completed" },
  closed: { label: "Closed" },
  cancelled: { label: "Cancelled" },
};

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  lead: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
  proposal_sent: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  approved: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  in_progress: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  closed: { bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-200" },
  cancelled: { bg: "bg-red-100", text: "text-red-500", border: "border-red-200" },
  archived: { bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200" },
};

const statusLabels: Record<string, string> = {
  lead: "New",
  proposal_sent: "Proposal Sent",
  approved: "Scheduled",
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
  MAINTENANCE_AGREEMENT: { bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-200" },
  MAJOR_REPAIR: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
};

const projectTypeLabels: Record<string, string> = {
  INSTALL: "Install",
  DUCT: "Duct",
  COMMERCIAL: "Commercial",
  MAINTENANCE_AGREEMENT: "Maintenance Agreement",
  MAJOR_REPAIR: "Major Repair",
};

const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  normal: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  high: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  urgent: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
};

const PROJECT_TYPES = ["INSTALL", "DUCT", "COMMERCIAL", "MAINTENANCE_AGREEMENT", "MAJOR_REPAIR"] as const;
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
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [page, setPage] = useState(1);
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithInfo | null>(null);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [projectType, setProjectType] = useState<string>("INSTALL");
  const [expectedValue, setExpectedValue] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("normal");

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
  }, [debouncedSearch, activeTab]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    
    if (activeTab !== "all") {
      params.set("status", activeTab);
    }
    
    params.set("page", String(page));
    params.set("limit", String(ITEMS_PER_PAGE));
    return params.toString();
  }, [debouncedSearch, activeTab, page]);

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

  const createProjectMutation = useMutation({
    mutationFn: async (data: {
      customerId: string;
      title: string;
      projectType: string;
      expectedValue?: string;
      description?: string;
      priority?: string;
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
    setTitle("");
    setProjectType("INSTALL");
    setExpectedValue("");
    setDescription("");
    setPriority("normal");
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

    createProjectMutation.mutate({
      customerId: selectedCustomer.id,
      title,
      projectType,
      expectedValue: expectedValue || undefined,
      description: description || undefined,
      priority: priority || undefined,
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
  const total = projectsData?.total || 0;
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  return (
    <CrmLayout currentUser={currentUser}>
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
            <h1 className="text-xl font-bold text-slate-900" data-testid="text-projects-title">
              Projects
            </h1>
            <p className="text-sm text-slate-500">Total: {total}</p>
          </div>
          <Button
            size="sm"
            className="bg-[#711419] hover:bg-[#5a1014] text-white"
            onClick={() => setCreateDialogOpen(true)}
            data-testid="button-create-project"
          >
            <Plus className="h-4 w-4 mr-1" />
            Create Project
          </Button>
        </div>

        {/* Tabs styled like customer page - underline style */}
        <div className="flex overflow-x-auto border-b border-slate-200">
          {(Object.keys(filterTabConfig) as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab
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
              disabled={createProjectMutation.isPending || !selectedCustomer || !title || !projectType}
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
