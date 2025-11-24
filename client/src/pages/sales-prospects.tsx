import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Edit, Trash2, Check, X, Phone, Mail, MapPin, Calendar, DollarSign, Settings, Download, Upload, CheckCircle2, TrendingUp, Filter, Navigation } from "lucide-react";
import NavDropdown from "@/components/nav-dropdown";
import redlogo from "@assets/redlogo.webp";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays, parseISO } from "date-fns";
import { nanoid } from "nanoid";
import type { Lead, LeadAction, LeadTask } from "@shared/schema";
import { formatPhoneNumber, validateEmail, validatePhone } from "@/lib/form-utils";

// Extend Window interface for Google Maps
declare global {
  interface Window {
    google: any;
    initGooglePlaces: () => void;
  }
}

type MetricsData = {
  activeLeads: number;
  pipelineValue: string;
  conversionRate: string;
  pendingActions: number;
  statusBreakdown: {
    New: number;
    Contacted: number;
    "Quote Sent": number;
    Negotiating: number;
    Won: { count: number; value: string };
    Lost: { count: number };
  };
};

export default function SalesProspects() {
  const { toast } = useToast();
  const [activeFilter, setActiveFilter] = useState<string>("All Active");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);

  // Queries
  const { data: allLeads = [], isLoading: isLoadingLeads } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
  });

  const { data: metrics, isLoading: isLoadingMetrics } = useQuery<MetricsData>({
    queryKey: ["/api/leads/metrics"],
  });

  // Create lead mutation
  const createLeadMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/leads", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/metrics"] });
      toast({ description: "Lead created successfully", duration: 1000 });
      setIsCreateDialogOpen(false);
    },
  });

  // Update lead mutation
  const updateLeadMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/leads/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/metrics"] });
      toast({ description: "Lead updated successfully", duration: 1000 });
    },
  });

  // Delete lead mutation
  const deleteLeadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/leads/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/metrics"] });
      toast({ description: "Lead deleted successfully", duration: 1000 });
    },
  });

  // Mark won mutation
  const markWonMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/leads/${id}/mark-won`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/metrics"] });
      toast({ description: "Lead marked as won!", duration: 1000 });
    },
  });

  // Mark lost mutation
  const markLostMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/leads/${id}/mark-lost`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/metrics"] });
      toast({ description: "Lead marked as lost", duration: 1000 });
    },
  });

  // Add action mutation
  const addActionMutation = useMutation({
    mutationFn: async ({ leadId, text }: { leadId: string; text: string }) => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/actions`, { text });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/metrics"] });
      toast({ description: "Action added", duration: 1000 });
    },
  });

  // Toggle action mutation
  const toggleActionMutation = useMutation({
    mutationFn: async ({ leadId, actionId }: { leadId: string; actionId: string }) => {
      const res = await apiRequest("PATCH", `/api/leads/${leadId}/actions/${actionId}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/metrics"] });
    },
  });

  // Delete action mutation
  const deleteActionMutation = useMutation({
    mutationFn: async ({ leadId, actionId }: { leadId: string; actionId: string }) => {
      await apiRequest("DELETE", `/api/leads/${leadId}/actions/${actionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/metrics"] });
      toast({ description: "Action deleted", duration: 1000 });
    },
  });

  // Add task mutation
  const addTaskMutation = useMutation({
    mutationFn: async ({ leadId, text, scheduledDate }: { leadId: string; text: string; scheduledDate: string }) => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/tasks`, { text, scheduledDate });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/metrics"] });
      toast({ description: "Task added", duration: 1000 });
    },
  });

  // Toggle task mutation
  const toggleTaskMutation = useMutation({
    mutationFn: async ({ leadId, taskId }: { leadId: string; taskId: string }) => {
      const res = await apiRequest("PATCH", `/api/leads/${leadId}/tasks/${taskId}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/metrics"] });
    },
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async ({ leadId, taskId }: { leadId: string; taskId: string }) => {
      await apiRequest("DELETE", `/api/leads/${leadId}/tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/metrics"] });
      toast({ description: "Task deleted", duration: 1000 });
    },
  });

  // CSV Import mutation
  const importCSVMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/leads/import", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Import failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/metrics"] });
      toast({
        description: `Import complete: ${data.created} created, ${data.updated} updated, ${data.skipped} skipped`,
        duration: 1000,
      });
    },
  });

  // Filter leads based on active filter
  const filteredLeads = allLeads.filter((lead) => {
    if (activeFilter === "All Active") return !lead.won && !lead.lost;
    if (activeFilter === "Won") return lead.won;
    if (activeFilter === "Lost") return lead.lost;
    return lead.status === activeFilter && !lead.won && !lead.lost;
  });

  // Calculate days to close
  const calculateDaysToClose = (date: Date | string | null) => {
    if (!date) return null;
    const closeDate = typeof date === "string" ? parseISO(date) : date;
    const days = differenceInDays(closeDate, new Date());
    if (days < 0) return `Overdue by ${Math.abs(days)} days`;
    return `${days} days`;
  };

  // Format currency
  const formatCurrency = (value: string | number | null | undefined) => {
    if (!value) return "$0.00";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return `$${num.toFixed(2)}`;
  };

  // Handle CSV export
  const handleExport = () => {
    const headers = ["Name", "Phone", "Email", "Address", "Estimated Value", "Status", "Client Issue", "Projected Close Date"];
    const rows = filteredLeads.map((lead) => [
      lead.name,
      lead.phone || "",
      lead.email || "",
      lead.address || "",
      lead.estimatedValue || "",
      lead.status,
      lead.clientIssue || "",
      lead.projectedCloseDate ? format(new Date(lead.projectedCloseDate), "yyyy-MM-dd") : "",
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ description: "Leads exported successfully", duration: 1000 });
  };

  // Handle CSV import
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importCSVMutation.mutate(file);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-3 sm:p-4">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <img
              src={redlogo}
              alt="Giesbrecht HVAC"
              className="h-8 sm:h-10 w-auto object-contain flex-shrink-0"
              data-testid="img-company-logo"
            />
            <div className="min-w-0">
              <NavDropdown
                currentPageTitle="Sales Prospects"
                items={[
                  { label: "Home", path: "/" },
                  { label: "Quote Generator", path: "/quote" },
                  { label: "Price Book", path: "/price-book" },
                  { label: "Processes and Systems", path: "/processes" },
                  { label: "Sales Prospects", path: "/sales-prospects" },
                ]}
              />
            </div>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => (window.location.href = "/admin")}
              data-testid="button-settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-4 max-w-7xl">
        {/* Dashboard Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
          {isLoadingMetrics ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </>
          ) : (
            <>
              <Card data-testid="card-metric-active">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs sm:text-sm">Active Leads</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl sm:text-3xl font-bold" data-testid="text-active-leads">
                    {metrics?.activeLeads || 0}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-metric-pipeline">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs sm:text-sm">Pipeline Value</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-3xl font-bold truncate" data-testid="text-pipeline-value">
                    ${parseFloat(metrics?.pipelineValue || "0").toLocaleString()}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-metric-conversion">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs sm:text-sm">Conversion Rate</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl sm:text-3xl font-bold" data-testid="text-conversion-rate">
                    {metrics?.conversionRate || "0"}%
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-metric-actions">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs sm:text-sm">Pending Actions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl sm:text-3xl font-bold" data-testid="text-pending-actions">
                    {metrics?.pendingActions || 0}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Sales Funnel */}
        {!isLoadingMetrics && metrics && (
          <Card className="mb-6" data-testid="card-sales-funnel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Sales Funnel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">New</div>
                  <div className="text-2xl font-bold" data-testid="text-funnel-new">
                    {metrics.statusBreakdown?.New || 0}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Contacted</div>
                  <div className="text-2xl font-bold" data-testid="text-funnel-contacted">
                    {metrics.statusBreakdown?.Contacted || 0}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Quote Sent</div>
                  <div className="text-2xl font-bold" data-testid="text-funnel-quote-sent">
                    {metrics.statusBreakdown?.["Quote Sent"] || 0}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Negotiating</div>
                  <div className="text-2xl font-bold" data-testid="text-funnel-negotiating">
                    {metrics.statusBreakdown?.Negotiating || 0}
                  </div>
                </div>
                <div className="text-center bg-green-50 dark:bg-green-900/20 p-2 rounded">
                  <div className="text-sm text-muted-foreground">Won</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-funnel-won">
                    {metrics.statusBreakdown?.Won?.count || 0}
                  </div>
                  <div className="text-xs text-muted-foreground" data-testid="text-funnel-won-value">
                    {metrics.statusBreakdown?.Won?.value || "$0.00"}
                  </div>
                </div>
                <div className="text-center bg-red-50 dark:bg-red-900/20 p-2 rounded">
                  <div className="text-sm text-muted-foreground">Lost</div>
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-funnel-lost">
                    {metrics.statusBreakdown?.Lost?.count || 0}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filter & Actions */}
        <div className="space-y-3 mb-6">
          {/* Mobile Filter Dropdown */}
          <div className="md:hidden">
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="w-full" data-testid="select-filter-mobile">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {["All Active", "New", "Contacted", "Quote Sent", "Negotiating", "Won", "Lost"].map((filter) => {
                  const count = (() => {
                    if (filter === "All Active") return allLeads.filter((l) => !l.won && !l.lost).length;
                    if (filter === "Won") return allLeads.filter((l) => l.won).length;
                    if (filter === "Lost") return allLeads.filter((l) => l.lost).length;
                    return allLeads.filter((l) => l.status === filter && !l.won && !l.lost).length;
                  })();

                  return (
                    <SelectItem 
                      key={filter} 
                      value={filter}
                      data-testid={`select-filter-option-${filter.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <div className="flex items-center justify-between w-full gap-3">
                        <span>{filter}</span>
                        <Badge variant="secondary" className="text-xs">{count}</Badge>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Desktop Filter Buttons */}
          <div className="hidden md:flex md:flex-wrap gap-2">
            {["All Active", "New", "Contacted", "Quote Sent", "Negotiating", "Won", "Lost"].map((filter) => {
              const count = (() => {
                if (filter === "All Active") return allLeads.filter((l) => !l.won && !l.lost).length;
                if (filter === "Won") return allLeads.filter((l) => l.won).length;
                if (filter === "Lost") return allLeads.filter((l) => l.lost).length;
                return allLeads.filter((l) => l.status === filter && !l.won && !l.lost).length;
              })();

              return (
                <Button
                  key={filter}
                  size="sm"
                  variant={activeFilter === filter ? "default" : "outline"}
                  onClick={() => setActiveFilter(filter)}
                  data-testid={`button-filter-${filter.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {filter}
                  <Badge variant="secondary" className="ml-2" data-testid={`badge-count-${filter.toLowerCase().replace(/\s+/g, "-")}`}>
                    {count}
                  </Badge>
                </Button>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <label htmlFor="csv-upload" className="flex-1 sm:flex-initial">
              <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild data-testid="button-import-csv">
                <span>
                  <Upload className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Import CSV</span>
                </span>
              </Button>
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleImport}
                data-testid="input-csv-file"
              />
            </label>

            <Button variant="outline" size="sm" className="flex-1 sm:flex-initial" onClick={handleExport} data-testid="button-export-csv">
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>

            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="flex-1 sm:flex-initial" data-testid="button-create-lead">
                  <Plus className="h-4 w-4 mr-2" />
                  New Lead
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto" data-testid="dialog-create-lead">
                <DialogHeader>
                  <DialogTitle>Create New Lead</DialogTitle>
                  <DialogDescription>Add a new sales prospect to track</DialogDescription>
                </DialogHeader>
                <CreateLeadForm onSubmit={(data) => createLeadMutation.mutate(data)} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Import Status */}
        {importCSVMutation.isPending && (
          <Card className="mb-4 border-blue-500" data-testid="card-import-status">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                <span>Importing leads...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Leads List */}
        {isLoadingLeads ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredLeads.length === 0 ? (
          <Card data-testid="card-empty-state">
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">No leads found in this category</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                isExpanded={expandedLeadId === lead.id}
                onToggleExpand={() => setExpandedLeadId(expandedLeadId === lead.id ? null : lead.id)}
                onUpdate={(data) => updateLeadMutation.mutate({ id: lead.id, data })}
                onDelete={() => deleteLeadMutation.mutate(lead.id)}
                onMarkWon={() => markWonMutation.mutate(lead.id)}
                onMarkLost={() => markLostMutation.mutate(lead.id)}
                onAddAction={(text) => addActionMutation.mutate({ leadId: lead.id, text })}
                onToggleAction={(actionId) => toggleActionMutation.mutate({ leadId: lead.id, actionId })}
                onDeleteAction={(actionId) => deleteActionMutation.mutate({ leadId: lead.id, actionId })}
                onAddTask={(text, scheduledDate) => addTaskMutation.mutate({ leadId: lead.id, text, scheduledDate })}
                onToggleTask={(taskId) => toggleTaskMutation.mutate({ leadId: lead.id, taskId })}
                onDeleteTask={(taskId) => deleteTaskMutation.mutate({ leadId: lead.id, taskId })}
                calculateDaysToClose={calculateDaysToClose}
                formatCurrency={formatCurrency}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Create Lead Form Component
function CreateLeadForm({ onSubmit }: { onSubmit: (data: any) => void }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    estimatedValue: "",
    status: "New",
    clientIssue: "",
    projectedCloseDate: "",
    customerType: "",
    leadSource: "",
  });
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const addressContainerRef = useRef<HTMLDivElement>(null);
  const autocompleteElementRef = useRef<any>(null);
  const [selectedAddress, setSelectedAddress] = useState("");

  const GOOGLE_PLACES_API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY || "";

  // Load Google Places API and initialize new PlaceAutocompleteElement
  useEffect(() => {
    if (!GOOGLE_PLACES_API_KEY) {
      console.warn("Google Places API key not found - address autocomplete disabled");
      return;
    }

    async function loadPlacesAPI() {
      try {
        // Check if already loaded
        if (window.google?.maps?.places?.PlaceAutocompleteElement) {
          initializePlaceAutocomplete();
          return;
        }

        // Load using importLibrary if available
        if (window.google?.maps?.importLibrary) {
          await window.google.maps.importLibrary('places');
          initializePlaceAutocomplete();
          return;
        }

        // Otherwise load the script with callback
        const callbackName = 'initGooglePlacesCallback_' + Date.now();
        
        (window as any)[callbackName] = async () => {
          try {
            await window.google.maps.importLibrary('places');
            initializePlaceAutocomplete();
          } catch (error) {
            console.error('Error importing places library:', error);
          }
        };

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_PLACES_API_KEY}&libraries=places&callback=${callbackName}`;
        script.async = true;
        script.defer = true;
        script.onerror = () => {
          console.error('Failed to load Google Maps script');
        };
        document.head.appendChild(script);
      } catch (error) {
        console.error('Error in loadPlacesAPI:', error);
      }
    }

    loadPlacesAPI();

    return () => {
      // Cleanup autocomplete element
      if (autocompleteElementRef.current) {
        autocompleteElementRef.current.remove();
      }
    };
  }, [GOOGLE_PLACES_API_KEY]);

  const initializePlaceAutocomplete = () => {
    if (!addressContainerRef.current || !window.google?.maps?.places?.PlaceAutocompleteElement) {
      console.warn('Cannot initialize PlaceAutocompleteElement');
      return;
    }
    
    // Create the new PlaceAutocompleteElement
    const placeAutocomplete = new window.google.maps.places.PlaceAutocompleteElement({
      componentRestrictions: { country: ['us'] },
    });

    // Style the element to match our input
    placeAutocomplete.style.width = '100%';
    
    // Clear container and append autocomplete element
    addressContainerRef.current.innerHTML = '';
    addressContainerRef.current.appendChild(placeAutocomplete);
    autocompleteElementRef.current = placeAutocomplete;

    // Listen for place selection
    placeAutocomplete.addEventListener('gmp-placeselect', async (event: any) => {
      const place = event.place;
      
      try {
        // Fetch the formatted address
        await place.fetchFields({
          fields: ['formattedAddress']
        });
        
        const address = place.formattedAddress || '';
        
        setSelectedAddress(address);
        setFormData(prev => ({ ...prev, address }));
      } catch (error) {
        console.error('Error fetching place details:', error);
      }
    });
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setFormData({ ...formData, phone: formatted });
    
    const cleaned = formatted.replace(/\D/g, '');
    if (cleaned.length > 0 && cleaned.length < 10) {
      setPhoneError("Phone must be 10 digits");
    } else {
      setPhoneError("");
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const email = e.target.value;
    setFormData({ ...formData, email });
    
    if (email && !validateEmail(email)) {
      setEmailError("Invalid email format");
    } else {
      setEmailError("");
    }
  };


  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ description: "Geolocation is not supported by your browser", variant: "destructive" });
      return;
    }

    if (!GOOGLE_PLACES_API_KEY) {
      toast({ 
        description: "Location feature unavailable - API key not configured", 
        variant: "destructive",
        duration: 3000
      });
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_PLACES_API_KEY}`
          );
          
          if (!response.ok) {
            throw new Error(`Reverse geocoding failed: ${response.status}`);
          }
          
          const data = await response.json();
          
          if (data.results && data.results.length > 0) {
            const address = data.results[0].formatted_address;
            // Update state for form submission
            setSelectedAddress(address);
            setFormData(prev => ({ ...prev, address }));
            toast({ description: "Address detected from your location", duration: 2000 });
          } else {
            toast({ description: "Could not find address for your location", variant: "destructive" });
          }
        } catch (error) {
          console.error("Reverse geocoding error:", error);
          toast({ description: "Failed to get address from location", variant: "destructive" });
        } finally {
          setIsGettingLocation(false);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        let errorMessage = "Failed to get your location";
        
        if (error.code === 1) {
          errorMessage = "Location permission denied - please enable location access";
        } else if (error.code === 2) {
          errorMessage = "Location unavailable - check your device settings";
        } else if (error.code === 3) {
          errorMessage = "Location request timed out - please try again";
        }
        
        toast({ description: errorMessage, variant: "destructive", duration: 3000 });
        setIsGettingLocation(false);
      }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    
    // Only validate if values are entered
    if (formData.email && formData.email.trim() !== "" && !validateEmail(formData.email)) {
      toast({ description: "Please enter a valid email", variant: "destructive" });
      return;
    }
    const cleanedPhone = formData.phone.replace(/\D/g, '');
    if (cleanedPhone.length > 0 && cleanedPhone.length < 10) {
      toast({ description: "Please enter a valid 10-digit phone number", variant: "destructive" });
      return;
    }

    const submitData: any = {
      ...formData,
      estimatedValue: formData.estimatedValue ? formData.estimatedValue : undefined,
    };

    // Convert date string to Date object if present
    if (formData.projectedCloseDate) {
      submitData.projectedCloseDate = new Date(formData.projectedCloseDate).toISOString();
    }

    onSubmit(submitData);

    setFormData({
      name: "",
      phone: "",
      email: "",
      address: "",
      estimatedValue: "",
      status: "New",
      clientIssue: "",
      projectedCloseDate: "",
      customerType: "",
      leadSource: "",
    });
    setSelectedAddress("");
    // Reinitialize the autocomplete element to clear it
    if (autocompleteElementRef.current) {
      autocompleteElementRef.current.value = "";
    }
    setEmailError("");
    setPhoneError("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">Name *</label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
          data-testid="input-lead-name"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Phone</label>
          <Input
            type="tel"
            value={formData.phone}
            onChange={handlePhoneChange}
            placeholder="(555) 123-4567"
            data-testid="input-lead-phone"
            className={phoneError ? "border-red-500" : ""}
          />
          {phoneError && <p className="text-xs text-red-500 mt-1">{phoneError}</p>}
        </div>
        <div>
          <label className="text-sm font-medium">Email</label>
          <Input
            type="email"
            value={formData.email}
            onChange={handleEmailChange}
            placeholder="email@example.com"
            data-testid="input-lead-email"
            className={emailError ? "border-red-500" : ""}
          />
          {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Address</label>
        <div className="flex gap-2 items-center">
          <div 
            ref={addressContainerRef} 
            className="flex-1"
            data-testid="autocomplete-address-container"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={getCurrentLocation}
            disabled={isGettingLocation}
            title="Use current location"
            data-testid="button-geolocation"
          >
            <Navigation className={`h-4 w-4 ${isGettingLocation ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        {selectedAddress && (
          <p className="text-xs text-muted-foreground mt-1">Selected: {selectedAddress}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Estimated Value</label>
          <Input
            type="number"
            step="0.01"
            value={formData.estimatedValue}
            onChange={(e) => setFormData({ ...formData, estimatedValue: e.target.value })}
            data-testid="input-lead-value"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Status</label>
          <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
            <SelectTrigger data-testid="select-lead-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="New">New</SelectItem>
              <SelectItem value="Contacted">Contacted</SelectItem>
              <SelectItem value="Quote Sent">Quote Sent</SelectItem>
              <SelectItem value="Negotiating">Negotiating</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Client Issue</label>
        <Textarea
          value={formData.clientIssue}
          onChange={(e) => setFormData({ ...formData, clientIssue: e.target.value })}
          data-testid="textarea-lead-issue"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Projected Close Date</label>
          <Input
            type="date"
            value={formData.projectedCloseDate}
            onChange={(e) => setFormData({ ...formData, projectedCloseDate: e.target.value })}
            data-testid="input-lead-close-date"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Customer Type</label>
          <Input
            value={formData.customerType}
            onChange={(e) => setFormData({ ...formData, customerType: e.target.value })}
            placeholder="e.g., Residential, Commercial"
            data-testid="input-lead-customer-type"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Lead Source</label>
        <Input
          value={formData.leadSource}
          onChange={(e) => setFormData({ ...formData, leadSource: e.target.value })}
          placeholder="e.g., Referral, Website, Ad"
          data-testid="input-lead-source"
        />
      </div>

      <Button type="submit" className="w-full" data-testid="button-submit-lead">
        Create Lead
      </Button>
    </form>
  );
}

// Lead Card Component
function LeadCard({
  lead,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  onMarkWon,
  onMarkLost,
  onAddAction,
  onToggleAction,
  onDeleteAction,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  calculateDaysToClose,
  formatCurrency,
}: {
  lead: Lead;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (data: any) => void;
  onDelete: () => void;
  onMarkWon: () => void;
  onMarkLost: () => void;
  onAddAction: (text: string) => void;
  onToggleAction: (actionId: string) => void;
  onDeleteAction: (actionId: string) => void;
  onAddTask: (text: string, scheduledDate: string) => void;
  onToggleTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  calculateDaysToClose: (date: Date | string | null) => string | null;
  formatCurrency: (value: string | number | null | undefined) => string;
}) {
  const [newAction, setNewAction] = useState("");
  const [newTask, setNewTask] = useState("");
  const [newTaskDate, setNewTaskDate] = useState("");
  const [quoteDetails, setQuoteDetails] = useState(lead.quoteDetails || "");
  const [quotePricing, setQuotePricing] = useState(lead.quotePricing || "");

  const isActive = !lead.won && !lead.lost;
  const actions = (lead.nextActions || []) as LeadAction[];
  const tasks = (lead.scheduledTasks || []) as LeadTask[];
  const activeActions = actions.filter((a) => !a.completed);
  const completedActions = actions.filter((a) => a.completed);
  const upcomingTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  const daysToClose = calculateDaysToClose(lead.projectedCloseDate);

  return (
    <Card data-testid={`card-lead-${lead.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl mb-2" data-testid={`text-lead-name-${lead.id}`}>
              {lead.name}
            </CardTitle>

            <div className="space-y-1 text-sm text-muted-foreground">
              {lead.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  <a href={`tel:${lead.phone}`} className="hover:underline" data-testid={`link-phone-${lead.id}`}>
                    {lead.phone}
                  </a>
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <a href={`mailto:${lead.email}`} className="hover:underline" data-testid={`link-email-${lead.id}`}>
                    {lead.email}
                  </a>
                </div>
              )}
              {lead.address && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span data-testid={`text-address-${lead.id}`}>{lead.address}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 items-end min-w-[120px]">
            {isActive ? (
              <Select
                value={lead.status}
                onValueChange={(value) => onUpdate({ status: value })}
              >
                <SelectTrigger className="w-full min-w-[120px] h-9" data-testid={`select-status-${lead.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="New">New</SelectItem>
                  <SelectItem value="Contacted">Contacted</SelectItem>
                  <SelectItem value="Quote Sent">Quote Sent</SelectItem>
                  <SelectItem value="Negotiating">Negotiating</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant={lead.won ? "default" : "destructive"} className="px-3 py-1" data-testid={`badge-status-${lead.id}`}>
                {lead.status}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 mt-4">
          {lead.estimatedValue && (
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold" data-testid={`text-value-${lead.id}`}>
                {formatCurrency(lead.estimatedValue)}
              </span>
            </div>
          )}

          {lead.projectedCloseDate && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span data-testid={`text-close-date-${lead.id}`}>
                {format(new Date(lead.projectedCloseDate), "MMM dd, yyyy")}
                {daysToClose && (
                  <span
                    className={`ml-2 text-xs ${
                      daysToClose.includes("Overdue") ? "text-red-600" : "text-muted-foreground"
                    }`}
                    data-testid={`text-days-to-close-${lead.id}`}
                  >
                    ({daysToClose})
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        {lead.clientIssue && (
          <p className="text-sm text-muted-foreground mt-2" data-testid={`text-issue-${lead.id}`}>
            {lead.clientIssue}
          </p>
        )}
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap gap-2 mb-4">
          {isActive && (
            <>
              <Button size="sm" variant="outline" className="touch-manipulation" onClick={onMarkWon} data-testid={`button-mark-won-${lead.id}`}>
                <CheckCircle2 className="h-4 w-4 sm:mr-1" />
                <span className="sr-only sm:not-sr-only sm:inline ml-1">Mark Won</span>
              </Button>
              <Button size="sm" variant="outline" className="touch-manipulation" onClick={onMarkLost} data-testid={`button-mark-lost-${lead.id}`}>
                <X className="h-4 w-4 sm:mr-1" />
                <span className="sr-only sm:not-sr-only sm:inline ml-1">Mark Lost</span>
              </Button>
            </>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="touch-manipulation" data-testid={`button-delete-${lead.id}`}>
                <Trash2 className="h-4 w-4 sm:mr-1" />
                <span className="sr-only sm:not-sr-only sm:inline ml-1">Delete</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Lead?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the lead and all associated data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid={`button-cancel-delete-${lead.id}`}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} data-testid={`button-confirm-delete-${lead.id}`}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button size="sm" variant="ghost" onClick={onToggleExpand} data-testid={`button-expand-${lead.id}`}>
            {isExpanded ? "Hide Details" : "Show Details"}
          </Button>
        </div>

        {isExpanded && (
          <Accordion type="multiple" className="w-full">
            {/* Actions Section */}
            <AccordionItem value="actions" data-testid={`accordion-actions-${lead.id}`}>
              <AccordionTrigger>
                Actions
                {activeActions.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {activeActions.length}
                  </Badge>
                )}
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  {isActive && (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add new action..."
                        value={newAction}
                        onChange={(e) => setNewAction(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newAction.trim()) {
                            onAddAction(newAction.trim());
                            setNewAction("");
                          }
                        }}
                        data-testid={`input-new-action-${lead.id}`}
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (newAction.trim()) {
                            onAddAction(newAction.trim());
                            setNewAction("");
                          }
                        }}
                        data-testid={`button-add-action-${lead.id}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {activeActions.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Active Actions</div>
                      {activeActions.map((action) => (
                        <div key={action.id} className="flex items-center gap-2" data-testid={`action-${action.id}`}>
                          <input
                            type="checkbox"
                            checked={false}
                            onChange={() => onToggleAction(action.id)}
                            className="h-4 w-4"
                            data-testid={`checkbox-action-${action.id}`}
                          />
                          <span className="flex-1">{action.text}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onDeleteAction(action.id)}
                            data-testid={`button-delete-action-${action.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {completedActions.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Completed Actions</div>
                      {completedActions.map((action) => (
                        <div key={action.id} className="flex items-center gap-2" data-testid={`action-${action.id}`}>
                          <input
                            type="checkbox"
                            checked={true}
                            onChange={() => onToggleAction(action.id)}
                            className="h-4 w-4"
                            data-testid={`checkbox-action-${action.id}`}
                          />
                          <span className="flex-1 line-through text-muted-foreground">{action.text}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onDeleteAction(action.id)}
                            data-testid={`button-delete-action-${action.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Tasks Section */}
            <AccordionItem value="tasks" data-testid={`accordion-tasks-${lead.id}`}>
              <AccordionTrigger>
                Tasks
                {upcomingTasks.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {upcomingTasks.length}
                  </Badge>
                )}
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  {isActive && (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Task description..."
                        value={newTask}
                        onChange={(e) => setNewTask(e.target.value)}
                        data-testid={`input-new-task-${lead.id}`}
                      />
                      <Input
                        type="date"
                        value={newTaskDate}
                        onChange={(e) => setNewTaskDate(e.target.value)}
                        data-testid={`input-new-task-date-${lead.id}`}
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (newTask.trim() && newTaskDate) {
                            onAddTask(newTask.trim(), newTaskDate);
                            setNewTask("");
                            setNewTaskDate("");
                          }
                        }}
                        data-testid={`button-add-task-${lead.id}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {upcomingTasks.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Upcoming Tasks</div>
                      {upcomingTasks.map((task) => {
                        const taskDate = new Date(task.scheduledDate);
                        const isOverdue = taskDate < new Date();
                        const isToday =
                          format(taskDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

                        return (
                          <div
                            key={task.id}
                            className={`flex items-center gap-2 p-2 rounded ${
                              isOverdue
                                ? "bg-red-50 dark:bg-red-900/20"
                                : isToday
                                ? "bg-yellow-50 dark:bg-yellow-900/20"
                                : ""
                            }`}
                            data-testid={`task-${task.id}`}
                          >
                            <input
                              type="checkbox"
                              checked={false}
                              onChange={() => onToggleTask(task.id)}
                              className="h-4 w-4"
                              data-testid={`checkbox-task-${task.id}`}
                            />
                            <div className="flex-1">
                              <div>{task.text}</div>
                              <div className="text-xs text-muted-foreground">
                                {format(taskDate, "MMM dd, yyyy")}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onDeleteTask(task.id)}
                              data-testid={`button-delete-task-${task.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {completedTasks.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Completed Tasks</div>
                      {completedTasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-2" data-testid={`task-${task.id}`}>
                          <input
                            type="checkbox"
                            checked={true}
                            onChange={() => onToggleTask(task.id)}
                            className="h-4 w-4"
                            data-testid={`checkbox-task-${task.id}`}
                          />
                          <div className="flex-1 line-through text-muted-foreground">
                            <div>{task.text}</div>
                            <div className="text-xs">
                              {format(new Date(task.scheduledDate), "MMM dd, yyyy")}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onDeleteTask(task.id)}
                            data-testid={`button-delete-task-${task.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Quote Section */}
            <AccordionItem value="quote" data-testid={`accordion-quote-${lead.id}`}>
              <AccordionTrigger>Quote</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">Quote Details</label>
                    <Textarea
                      value={quoteDetails}
                      onChange={(e) => setQuoteDetails(e.target.value)}
                      placeholder="Quote details and specifications..."
                      rows={4}
                      disabled={!isActive}
                      data-testid={`textarea-quote-details-${lead.id}`}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Quote Pricing</label>
                    <Textarea
                      value={quotePricing}
                      onChange={(e) => setQuotePricing(e.target.value)}
                      placeholder="Pricing breakdown..."
                      rows={4}
                      disabled={!isActive}
                      data-testid={`textarea-quote-pricing-${lead.id}`}
                    />
                  </div>
                  {isActive && (
                    <Button
                      onClick={() => {
                        onUpdate({ quoteDetails, quotePricing });
                      }}
                      data-testid={`button-save-quote-${lead.id}`}
                    >
                      Save Quote
                    </Button>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
