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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit, Trash2, Check, X, Phone, Mail, MapPin, Calendar, DollarSign, Settings, Download, Upload, CheckCircle2, TrendingUp, Filter, Navigation, MessageSquare, StickyNote, ArrowRightCircle, UserPlus, Activity, FileText, ExternalLink, Search, Users, Package, Crown } from "lucide-react";
import NavDropdown from "@/components/nav-dropdown";
import MobileNav from "@/components/mobile-nav";
import redlogo from "@assets/redlogo.webp";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays, parseISO } from "date-fns";
import { nanoid } from "nanoid";
import type { Lead, LeadAction, LeadTask, Quote, Customer } from "@shared/schema";
import { formatPhoneNumber, validateEmail, validatePhone } from "@/lib/form-utils";
import { useLocation } from "wouter";

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
    New: { count: number; value: number };
    Contacted: { count: number; value: number };
    "Quote Sent": { count: number; value: number };
    Negotiating: { count: number; value: number };
    Won: { count: number; value: number };
    Lost: { count: number; value: number };
  };
};

export default function SalesProspects() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeFilter, setActiveFilter] = useState<string>("All Active");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Map filter to API status parameter
  const getApiStatus = (filter: string) => {
    if (filter === "All Active") return null; // No status filter - get all and filter client-side
    return filter; // Pass status directly for specific filters (Won, Lost, New, etc.)
  };

  // Queries - pass status filter to API for Won/Lost, get more leads
  const apiStatus = getApiStatus(activeFilter);
  const { data: leadsResponse, isLoading: isLoadingLeads } = useQuery<{ leads: Lead[], pagination: any }>({
    queryKey: ["/api/leads", { status: apiStatus }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "100"); // Get more leads
      if (apiStatus) params.set("status", apiStatus);
      const res = await fetch(`/api/leads?${params.toString()}`);
      return res.json();
    },
  });
  const allLeads = leadsResponse?.leads || [];

  const { data: metrics, isLoading: isLoadingMetrics } = useQuery<MetricsData>({
    queryKey: ["/api/leads/metrics"],
  });

  const { data: technicians = [] } = useQuery<any[]>({
    queryKey: ["/api/technicians"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/service-leads"] });
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

  // Fuzzy match function - matches if characters appear in sequence (even with typos)
  const fuzzyMatch = (text: string, search: string): number => {
    if (!text || !search) return 0;
    const textLower = text.toLowerCase();
    const searchLower = search.toLowerCase();
    
    // Exact match gets highest score
    if (textLower.includes(searchLower)) return 100;
    
    // Check if characters appear in sequence (fuzzy finder style)
    let searchIdx = 0;
    let matchCount = 0;
    for (let i = 0; i < textLower.length && searchIdx < searchLower.length; i++) {
      if (textLower[i] === searchLower[searchIdx]) {
        matchCount++;
        searchIdx++;
      }
    }
    
    // Return score based on how many characters matched
    if (matchCount >= searchLower.length * 0.6) {
      return (matchCount / searchLower.length) * 80;
    }
    
    // Check for partial word matches (for typos)
    const words = textLower.split(/\s+/);
    for (const word of words) {
      let matches = 0;
      for (const char of searchLower) {
        if (word.includes(char)) matches++;
      }
      if (matches >= searchLower.length * 0.7) {
        return 60;
      }
    }
    
    return 0;
  };

  // Filter and score leads based on search, active filter, and selected employee
  const filteredLeads = allLeads
    .map((lead) => {
      let searchScore = 0;
      if (searchTerm.trim()) {
        const search = searchTerm.trim();
        const nameScore = fuzzyMatch(lead.name || '', search);
        const phoneDigits = lead.phone?.replace(/\D/g, '') || '';
        const searchDigits = search.replace(/\D/g, '');
        const phoneScore = searchDigits && phoneDigits.includes(searchDigits) ? 100 : 0;
        searchScore = Math.max(nameScore, phoneScore);
      }
      return { lead, searchScore };
    })
    .filter(({ lead, searchScore }) => {
      // If searching, only include matches
      if (searchTerm.trim() && searchScore === 0) {
        return false;
      }
      // Then apply employee filter
      if (selectedEmployeeId !== "all" && lead.assignedEmployeeId !== selectedEmployeeId) {
        return false;
      }
      // Then apply status filter
      if (activeFilter === "All Active") return !lead.won && !lead.lost;
      if (activeFilter === "Won") return lead.won;
      if (activeFilter === "Lost") return lead.lost;
      return lead.status === activeFilter && !lead.won && !lead.lost;
    })
    .sort((a, b) => b.searchScore - a.searchScore);

  // Get selected employee name
  const selectedEmployeeName = selectedEmployeeId === "all" 
    ? null 
    : technicians.find((t) => t.id === selectedEmployeeId)?.name || "Unknown";

  // Calculate employee-specific metrics when an employee is selected
  const employeeFilteredLeads = selectedEmployeeId === "all" 
    ? allLeads 
    : allLeads.filter((l) => l.assignedEmployeeId === selectedEmployeeId);

  // Calculate metrics from filtered leads (used for display)
  const calculateMetricsFromLeads = (leads: Lead[]): MetricsData => {
    const activeLeads = leads.filter((l) => !l.won && !l.lost);
    const closed = leads.filter((l) => l.won || l.lost);
    const won = leads.filter((l) => l.won);
    
    return {
      activeLeads: activeLeads.length,
      pipelineValue: activeLeads.reduce((sum, l) => sum + parseFloat(l.estimatedValue || "0"), 0).toFixed(2),
      conversionRate: closed.length > 0 ? ((won.length / closed.length) * 100).toFixed(1) : "0",
      pendingActions: 0, // Not available client-side
      statusBreakdown: {
        New: { 
          count: leads.filter((l) => l.status === "New" && !l.won && !l.lost).length,
          value: leads.filter((l) => l.status === "New" && !l.won && !l.lost).reduce((sum, l) => sum + parseFloat(l.estimatedValue || "0"), 0)
        },
        Contacted: { 
          count: leads.filter((l) => l.status === "Contacted" && !l.won && !l.lost).length,
          value: leads.filter((l) => l.status === "Contacted" && !l.won && !l.lost).reduce((sum, l) => sum + parseFloat(l.estimatedValue || "0"), 0)
        },
        "Quote Sent": { 
          count: leads.filter((l) => l.status === "Quote Sent" && !l.won && !l.lost).length,
          value: leads.filter((l) => l.status === "Quote Sent" && !l.won && !l.lost).reduce((sum, l) => sum + parseFloat(l.estimatedValue || "0"), 0)
        },
        Negotiating: { 
          count: leads.filter((l) => l.status === "Negotiating" && !l.won && !l.lost).length,
          value: leads.filter((l) => l.status === "Negotiating" && !l.won && !l.lost).reduce((sum, l) => sum + parseFloat(l.estimatedValue || "0"), 0)
        },
        Won: { 
          count: won.length,
          value: won.reduce((sum, l) => sum + parseFloat(l.estimatedValue || "0"), 0)
        },
        Lost: { 
          count: leads.filter((l) => l.lost).length,
          value: leads.filter((l) => l.lost).reduce((sum, l) => sum + parseFloat(l.estimatedValue || "0"), 0)
        },
      }
    };
  };

  // Use employee-filtered metrics when an employee is selected, otherwise use global metrics from API
  const displayMetrics: MetricsData | undefined = selectedEmployeeId === "all" 
    ? metrics 
    : calculateMetricsFromLeads(employeeFilteredLeads);

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
    const rows = filteredLeads.map(({ lead }) => [
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
            <MobileNav />
            <img
              src={redlogo}
              alt="Giesbrecht HVAC"
              className="h-8 sm:h-10 w-auto object-contain flex-shrink-0"
              data-testid="img-company-logo"
            />
            <span className="text-sm sm:text-base font-semibold truncate">Sales Prospects</span>
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
        {/* Employee Filter Header */}
        {selectedEmployeeName && (
          <div className="mb-4 p-3 bg-primary/10 rounded-lg border border-primary/20">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Showing stats for: <strong>{selectedEmployeeName}</strong></span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="ml-auto h-7 text-xs"
                onClick={() => setSelectedEmployeeId("all")}
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Dashboard Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
          {isLoadingMetrics && selectedEmployeeId === "all" ? (
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
                    {displayMetrics?.activeLeads || 0}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-metric-pipeline">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs sm:text-sm">Pipeline Value</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-3xl font-bold truncate" data-testid="text-pipeline-value">
                    ${parseFloat(displayMetrics?.pipelineValue || "0").toLocaleString()}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-metric-conversion">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs sm:text-sm">Conversion Rate</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl sm:text-3xl font-bold" data-testid="text-conversion-rate">
                    {displayMetrics?.conversionRate || "0"}%
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-metric-actions">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs sm:text-sm">{selectedEmployeeId !== "all" ? "Won Deals" : "Pending Actions"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl sm:text-3xl font-bold" data-testid="text-pending-actions">
                    {selectedEmployeeId !== "all" ? (displayMetrics?.statusBreakdown?.Won?.count || 0) : (metrics?.pendingActions || 0)}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Sales Funnel */}
        {(displayMetrics || !isLoadingMetrics) && (
          <Card className="mb-6" data-testid="card-sales-funnel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {selectedEmployeeName ? `${selectedEmployeeName}'s Funnel` : "Sales Funnel"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">New</div>
                  <div className="text-2xl font-bold" data-testid="text-funnel-new">
                    {displayMetrics?.statusBreakdown?.New?.count || 0}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Contacted</div>
                  <div className="text-2xl font-bold" data-testid="text-funnel-contacted">
                    {displayMetrics?.statusBreakdown?.Contacted?.count || 0}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Quote Sent</div>
                  <div className="text-2xl font-bold" data-testid="text-funnel-quote-sent">
                    {displayMetrics?.statusBreakdown?.["Quote Sent"]?.count || 0}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Negotiating</div>
                  <div className="text-2xl font-bold" data-testid="text-funnel-negotiating">
                    {displayMetrics?.statusBreakdown?.Negotiating?.count || 0}
                  </div>
                </div>
                <div className="text-center bg-green-50 dark:bg-green-900/20 p-2 rounded">
                  <div className="text-sm text-muted-foreground">Won</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-funnel-won">
                    {displayMetrics?.statusBreakdown?.Won?.count || 0}
                  </div>
                  <div className="text-xs text-muted-foreground" data-testid="text-funnel-won-value">
                    ${(displayMetrics?.statusBreakdown?.Won?.value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="text-center bg-red-50 dark:bg-red-900/20 p-2 rounded">
                  <div className="text-sm text-muted-foreground">Lost</div>
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-funnel-lost">
                    {displayMetrics?.statusBreakdown?.Lost?.count || 0}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filter & Actions */}
        <div className="space-y-3 mb-6">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-leads"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => setSearchTerm("")}
                data-testid="button-clear-search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Mobile Filter Dropdowns */}
          <div className="md:hidden grid grid-cols-2 gap-2">
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="w-full" data-testid="select-filter-mobile">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {["All Active", "New", "Contacted", "Quote Sent", "Negotiating", "Won", "Lost"].map((filter) => (
                  <SelectItem 
                    key={filter} 
                    value={filter}
                    data-testid={`select-filter-option-${filter.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {filter}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
              <SelectTrigger className="w-full" data-testid="select-employee-mobile">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="select-employee-option-all">
                  All Employees
                </SelectItem>
                {technicians.map((tech) => {
                  const techLeadCount = allLeads.filter((l) => l.assignedEmployeeId === tech.id).length;
                  return (
                    <SelectItem 
                      key={tech.id} 
                      value={tech.id}
                      data-testid={`select-employee-option-${tech.id}`}
                    >
                      <div className="flex items-center justify-between w-full gap-3">
                        <span>{tech.name}</span>
                        <Badge variant="secondary" className="text-xs">{techLeadCount}</Badge>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Desktop Filter Dropdowns */}
          <div className="hidden md:flex gap-2">
            <div className="w-full max-w-xs">
              <Select value={activeFilter} onValueChange={setActiveFilter}>
                <SelectTrigger className="w-full" data-testid="select-filter-desktop">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {["All Active", "New", "Contacted", "Quote Sent", "Negotiating", "Won", "Lost"].map((filter) => (
                    <SelectItem 
                      key={filter} 
                      value={filter}
                      data-testid={`select-filter-option-desktop-${filter.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {filter}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="w-full max-w-xs">
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger className="w-full" data-testid="select-employee-desktop">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="select-employee-option-desktop-all">
                    All Employees
                  </SelectItem>
                  {technicians.map((tech) => {
                    const techLeadCount = allLeads.filter((l) => l.assignedEmployeeId === tech.id).length;
                    return (
                      <SelectItem 
                        key={tech.id} 
                        value={tech.id}
                        data-testid={`select-employee-option-desktop-${tech.id}`}
                      >
                        <div className="flex items-center justify-between w-full gap-3">
                          <span>{tech.name}</span>
                          <Badge variant="secondary" className="text-xs">{techLeadCount}</Badge>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2">
            <label htmlFor="csv-upload">
              <Button variant="outline" size="sm" className="w-full" asChild data-testid="button-import-csv">
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

            <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={handleExport} data-testid="button-export-csv">
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>

            <Button size="sm" className="w-full sm:w-auto" onClick={() => setLocation('/sales-prospects/create')} data-testid="button-create-lead">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">New Lead</span>
              <span className="sm:hidden">New</span>
            </Button>
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
            {filteredLeads.map(({ lead, searchScore }) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                isExpanded={expandedLeadId === lead.id}
                onToggleExpand={() => setExpandedLeadId(expandedLeadId === lead.id ? null : lead.id)}
                onUpdate={(data) => updateLeadMutation.mutate({ id: lead.id, data })}
                onDelete={() => deleteLeadMutation.mutate(lead.id)}
                onMarkWon={() => markWonMutation.mutate(lead.id)}
                onMarkLost={() => markLostMutation.mutate(lead.id)}
                calculateDaysToClose={calculateDaysToClose}
                formatCurrency={formatCurrency}
                technicians={technicians}
                isSearchMatch={searchTerm.trim() !== '' && searchScore > 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Quote Reference Link Component
function QuoteReferenceLink({ quoteId }: { quoteId: string }) {
  const [, setLocation] = useLocation();

  const handleViewQuote = () => {
    // Navigate to quote history page - the page should handle highlighting the quote
    setLocation(`/history?quoteId=${quoteId}`);
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleViewQuote}
      data-testid={`button-view-quote-${quoteId}`}
    >
      <ExternalLink className="h-3 w-3 mr-1" />
      View Quote
    </Button>
  );
}

// Create Lead Form Component
function CreateLeadForm({ onSubmit, technicians }: { onSubmit: (data: any) => void; technicians: any[] }) {
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
    jobType: "",
    leadSource: "",
    assignedEmployeeId: "",
    quoteId: "",
  });
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const addressContainerRef = useRef<HTMLDivElement>(null);
  const autocompleteElementRef = useRef<any>(null);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [isImportQuoteDialogOpen, setIsImportQuoteDialogOpen] = useState(false);
  const [quoteSearchTerm, setQuoteSearchTerm] = useState("");
  
  // Customer lookup state
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState("");
  const [isCustomerPopoverOpen, setIsCustomerPopoverOpen] = useState(false);
  const [importedCustomerId, setImportedCustomerId] = useState<string | null>(null);
  const [importedCustomerName, setImportedCustomerName] = useState("");
  const [searchAllFields, setSearchAllFields] = useState(false);

  // Debounce customer search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCustomerSearch(customerSearchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearchTerm]);

  // Customer search query
  const { data: customerSearchResults = [], isFetching: isSearchingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers/search", debouncedCustomerSearch, searchAllFields],
    queryFn: async () => {
      if (debouncedCustomerSearch.length < 2) return [];
      const params = new URLSearchParams({
        term: debouncedCustomerSearch,
        ...(searchAllFields && { searchAll: 'true' })
      });
      const res = await fetch(`/api/customers/search?${params}`);
      if (!res.ok) throw new Error("Failed to search customers");
      return res.json();
    },
    enabled: debouncedCustomerSearch.length >= 2,
    refetchOnWindowFocus: false,
  });

  // Handle customer selection
  const handleSelectCustomer = (customer: Customer) => {
    const cleanName = customer.displayName.replace(/^["']|["']$/g, '');
    setFormData({
      ...formData,
      name: cleanName,
      phone: customer.phone ? formatPhoneNumber(customer.phone) : "",
      email: customer.email || "",
      address: customer.fullAddress || "",
      customerType: customer.customerType || formData.customerType,
      leadSource: customer.leadSource || formData.leadSource,
    });
    setSelectedAddress(customer.fullAddress || "");
    setImportedCustomerId(customer.id);
    setImportedCustomerName(cleanName);
    setCustomerSearchTerm("");
    setIsCustomerPopoverOpen(false);
    toast({ description: `Customer "${cleanName}" imported from database`, duration: 2000 });
  };

  // Fetch all quotes for import
  const { data: quotesData, isLoading: isLoadingQuotes } = useQuery<{ quotes: Quote[] }>({
    queryKey: ["/api/quotes"],
    enabled: isImportQuoteDialogOpen,
  });

  const GOOGLE_PLACES_API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY || "";

  // Filter quotes based on search term
  const allQuotes = quotesData?.quotes || [];
  const filteredQuotes = allQuotes.filter((quote) => {
    if (!quoteSearchTerm.trim()) return true;
    const searchLower = quoteSearchTerm.toLowerCase();
    return (
      quote.customerName.toLowerCase().includes(searchLower) ||
      quote.id.toLowerCase().includes(searchLower) ||
      quote.technician.toLowerCase().includes(searchLower)
    );
  });

  // Handle importing data from a selected quote
  const handleImportQuote = (quote: Quote) => {
    setFormData({
      name: quote.customerName,
      phone: "", // Will be filled by user
      email: "", // Will be filled by user
      address: quote.jobNotes || "",
      estimatedValue: quote.total.toString(),
      status: "Quote Sent",
      clientIssue: `Quote #${quote.id.slice(0, 8)} - ${(quote.parts as any[]).map(p => p.description).join(', ')}`,
      projectedCloseDate: "",
      customerType: "",
      jobType: "",
      leadSource: "Quote Generated",
      assignedEmployeeId: "",
      quoteId: quote.id,
    });
    setSelectedAddress(quote.jobNotes || "");
    setIsImportQuoteDialogOpen(false);
    setQuoteSearchTerm("");
    toast({ description: `Quote data imported for ${quote.customerName}`, duration: 2000 });
  };

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
      quoteId: formData.quoteId || undefined,
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
      jobType: "",
      leadSource: "",
      assignedEmployeeId: "",
      quoteId: "",
    });
    setSelectedAddress("");
    // Reinitialize the autocomplete element to clear it
    if (autocompleteElementRef.current) {
      autocompleteElementRef.current.value = "";
    }
    setEmailError("");
    setPhoneError("");
    // Reset customer import state
    setImportedCustomerId(null);
    setImportedCustomerName("");
    setCustomerSearchTerm("");
  };

  return (
    <div className="space-y-4">
      {/* Import from Quote Button */}
      <Dialog open={isImportQuoteDialogOpen} onOpenChange={setIsImportQuoteDialogOpen}>
        <DialogTrigger asChild>
          <Button 
            type="button" 
            variant="outline" 
            className="w-full" 
            data-testid="button-import-from-quote"
          >
            <FileText className="h-4 w-4 mr-2" />
            Import from Existing Quote
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col" data-testid="dialog-import-quote">
          <DialogHeader>
            <DialogTitle>Import from Quote</DialogTitle>
            <DialogDescription>
              Search for an existing quote to pre-fill the lead form
            </DialogDescription>
          </DialogHeader>

          {/* Search Input */}
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer name, quote ID, or technician..."
                value={quoteSearchTerm}
                onChange={(e) => setQuoteSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-quotes"
              />
            </div>
          </div>

          {/* Quotes List */}
          <ScrollArea className="flex-1 pr-4">
            {isLoadingQuotes ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="p-4">
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-1/2" />
                  </Card>
                ))}
              </div>
            ) : filteredQuotes.length === 0 ? (
              <Card className="p-6">
                <p className="text-center text-muted-foreground">
                  {quoteSearchTerm ? "No quotes found matching your search" : "No quotes available"}
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredQuotes.map((quote) => (
                  <Card
                    key={quote.id}
                    className="w-full p-4 cursor-pointer hover:bg-accent transition-colors overflow-hidden"
                    onClick={() => handleImportQuote(quote)}
                    data-testid={`card-quote-${quote.id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold truncate" data-testid={`text-quote-customer-${quote.id}`}>
                            {quote.customerName}
                          </h4>
                          <Badge variant="outline" className="text-xs">
                            {quote.id.slice(0, 8)}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>Technician: {quote.technician}</p>
                          <p>Total: ${parseFloat(quote.total).toFixed(2)}</p>
                          {quote.createdAt && (
                            <p className="text-xs">
                              Created: {format(new Date(quote.createdAt), "MMM dd, yyyy")}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleImportQuote(quote);
                        }}
                        data-testid={`button-select-quote-${quote.id}`}
                      >
                        Select
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Show quote reference if imported */}
      {formData.quoteId && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3" data-testid="quote-reference-banner">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="font-medium text-blue-900 dark:text-blue-100">
              Imported from Quote #{formData.quoteId.slice(0, 8)}
            </span>
          </div>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
            You can edit all fields before creating the lead
          </p>
        </div>
      )}

      {/* Show customer reference if imported */}
      {importedCustomerId && (
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3" data-testid="customer-reference-banner">
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="font-medium text-green-900 dark:text-green-100">
              Customer imported from database: {importedCustomerName}
            </span>
          </div>
          <p className="text-xs text-green-700 dark:text-green-300 mt-1">
            You can edit all fields before creating the lead
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 overflow-x-hidden">
        {/* Customer Lookup */}
        <div>
          <label className="text-sm font-medium">Search Existing Customer</label>
          <Popover open={isCustomerPopoverOpen && customerSearchTerm.length >= 2} onOpenChange={setIsCustomerPopoverOpen}>
            <PopoverTrigger asChild>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={searchAllFields ? "Search name, phone, email, address..." : "Search by name..."}
                  value={customerSearchTerm}
                  onChange={(e) => {
                    setCustomerSearchTerm(e.target.value);
                    if (e.target.value.length >= 2) {
                      setIsCustomerPopoverOpen(true);
                    }
                  }}
                  onFocus={() => {
                    if (customerSearchTerm.length >= 2) {
                      setIsCustomerPopoverOpen(true);
                    }
                  }}
                  className="pl-10"
                  data-testid="input-customer-search"
                />
              </div>
            </PopoverTrigger>
            <PopoverContent 
              className="p-0" 
              align="start"
              side="bottom"
              avoidCollisions={false}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <ScrollArea className="max-h-64">
                {isSearchingCustomers ? (
                  <div className="p-3 space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : customerSearchResults.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground text-center">
                    No customers found
                  </div>
                ) : (
                  customerSearchResults.map((customer) => {
                    const cleanName = customer.displayName.replace(/^["']|["']$/g, '');
                    return (
                    <div
                      key={customer.id}
                      className="p-3 hover:bg-accent cursor-pointer border-b last:border-b-0"
                      onClick={() => handleSelectCustomer(customer)}
                      data-testid={`customer-result-${customer.id}`}
                    >
                      <div className="font-medium text-sm">{cleanName}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
                        {customer.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {customer.phone}
                          </span>
                        )}
                        {customer.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {customer.email}
                          </span>
                        )}
                        {customer.fullAddress && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {customer.fullAddress.length > 30 
                              ? customer.fullAddress.substring(0, 30) + "..." 
                              : customer.fullAddress}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                  })
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>
          <div className="flex flex-wrap items-center justify-between gap-1 mt-2">
            <p className="text-xs text-muted-foreground">
              Type 2+ chars to search
            </p>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer shrink-0">
              <Checkbox
                checked={searchAllFields}
                onCheckedChange={(checked) => setSearchAllFields(checked === true)}
                className="h-3.5 w-3.5"
                data-testid="checkbox-search-all-fields-lead"
              />
              All fields
            </label>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Name *</label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            data-testid="input-lead-name"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="min-w-0">
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
          <div className="min-w-0">
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

        <div className="min-w-0">
          <label className="text-sm font-medium">Address</label>
          <div className="flex gap-2 items-center min-w-0">
            <div 
              ref={addressContainerRef} 
              className="flex-1 min-w-0"
              data-testid="autocomplete-address-container"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="min-w-0">
            <label className="text-sm font-medium">Estimated Value</label>
            <Input
              type="number"
              step="0.01"
              value={formData.estimatedValue}
              onChange={(e) => setFormData({ ...formData, estimatedValue: e.target.value })}
              data-testid="input-lead-value"
            />
          </div>
          <div className="min-w-0">
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
                <SelectItem value="Won">Won</SelectItem>
                <SelectItem value="Lost">Lost</SelectItem>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="min-w-0">
            <label className="text-sm font-medium">Projected Close Date</label>
            <Input
              type="date"
              value={formData.projectedCloseDate}
              onChange={(e) => setFormData({ ...formData, projectedCloseDate: e.target.value })}
              data-testid="input-lead-close-date"
            />
          </div>
          <div className="min-w-0">
            <label className="text-sm font-medium">Customer Type</label>
            <Input
              value={formData.customerType}
              onChange={(e) => setFormData({ ...formData, customerType: e.target.value })}
              placeholder="e.g., Residential, Commercial"
              data-testid="input-lead-customer-type"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="min-w-0">
            <label className="text-sm font-medium">Job Type</label>
            <Select 
              value={formData.jobType || ""} 
              onValueChange={(value) => setFormData({ ...formData, jobType: value })}
            >
              <SelectTrigger data-testid="select-job-type">
                <SelectValue placeholder="Select job type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Installation">Installation</SelectItem>
                <SelectItem value="Service">Service</SelectItem>
                <SelectItem value="Maintenance">Maintenance</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <label className="text-sm font-medium">Lead Source</label>
            <Input
              value={formData.leadSource}
              onChange={(e) => setFormData({ ...formData, leadSource: e.target.value })}
              placeholder="e.g., Referral, Website, Ad"
              data-testid="input-lead-source"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Assigned Employee</label>
          <Select 
            value={formData.assignedEmployeeId || undefined} 
            onValueChange={(value) => setFormData({ ...formData, assignedEmployeeId: value })}
          >
            <SelectTrigger data-testid="select-assigned-employee">
              <SelectValue placeholder="None (Optional)" />
            </SelectTrigger>
            <SelectContent>
              {technicians.map((tech) => (
                <SelectItem key={tech.id} value={tech.id}>
                  {tech.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button type="submit" className="w-full" data-testid="button-submit-lead">
          Create Lead
        </Button>
      </form>
    </div>
  );
}

// Activity Timeline Sheet Component
function ActivityTimelineSheet({ 
  leadId, 
  leadName, 
  isOpen, 
  onClose 
}: { 
  leadId: string; 
  leadName: string; 
  isOpen: boolean; 
  onClose: () => void; 
}) {
  const { toast } = useToast();
  const [noteContent, setNoteContent] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackCaller, setCallbackCaller] = useState("");
  const [callbackResponse, setCallbackResponse] = useState("");

  // Fetch technicians for employee name resolution
  const { data: technicians = [] } = useQuery<any[]>({
    queryKey: ["/api/technicians"],
  });

  // Fetch lead history
  const { data: history = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/leads", leadId, "history"],
    enabled: isOpen,
  });

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: async (note: string) => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/history`, {
        actionType: "note_added",
        payload: { note },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "history"] });
      toast({ description: "Note added successfully", duration: 1000 });
      setNoteContent("");
    },
    onError: () => {
      toast({ description: "Failed to add note", variant: "destructive" });
    },
  });

  // Log callback mutation
  const logCallbackMutation = useMutation({
    mutationFn: async (data: { date: string; caller: string; response: string }) => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/history`, {
        actionType: "callback_logged",
        payload: data,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "history"] });
      toast({ description: "Callback logged successfully", duration: 1000 });
      setCallbackDate("");
      setCallbackCaller("");
      setCallbackResponse("");
    },
    onError: () => {
      toast({ description: "Failed to log callback", variant: "destructive" });
    },
  });

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (noteContent.trim()) {
      addNoteMutation.mutate(noteContent.trim());
    }
  };

  const handleCallbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (callbackDate && callbackCaller.trim()) {
      logCallbackMutation.mutate({
        date: callbackDate,
        caller: callbackCaller.trim(),
        response: callbackResponse.trim(),
      });
    }
  };

  const getActivityIcon = (actionType: string) => {
    switch (actionType) {
      case "note_added":
        return <StickyNote className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
      case "callback_logged":
        return <Phone className="h-5 w-5 text-green-600 dark:text-green-400" />;
      case "status_changed":
        return <ArrowRightCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />;
      case "assignment_changed":
        return <UserPlus className="h-5 w-5 text-orange-600 dark:text-orange-400" />;
      case "field_updated":
        return <Edit className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />;
      case "created":
        return <Plus className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />;
      default:
        return <Activity className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
    }
  };

  const getActivityBgColor = (actionType: string) => {
    switch (actionType) {
      case "note_added":
        return "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800";
      case "callback_logged":
        return "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
      case "status_changed":
        return "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800";
      case "assignment_changed":
        return "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800";
      case "field_updated":
        return "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800";
      case "created":
        return "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800";
      default:
        return "bg-muted border-border";
    }
  };

  const getActivityDescription = (entry: any) => {
    const { actionType, payload } = entry;
    
    // Helper to resolve employee ID to name
    const getEmployeeName = (employeeId: string | null) => {
      if (!employeeId) return "Unassigned";
      const employee = technicians.find(t => t.id === employeeId);
      return employee ? employee.name : employeeId;
    };
    
    switch (actionType) {
      case "note_added":
        return payload.note || "Added a note";
      case "callback_logged":
        return `Callback from ${payload.caller || "Unknown"} on ${payload.date ? format(new Date(payload.date), "MMM d, yyyy") : "Unknown date"}${payload.response ? `: ${payload.response}` : ""}`;
      case "status_changed":
        return `Changed status from ${payload.from || "Unknown"} to ${payload.to || "Unknown"}`;
      case "assignment_changed":
        const fromName = getEmployeeName(payload.from);
        const toName = getEmployeeName(payload.to);
        return `Assigned from ${fromName} to ${toName}`;
      case "field_updated":
        if (payload.field === "estimatedValue") {
          const fromValue = payload.from ? `$${parseFloat(payload.from).toFixed(2)}` : "not set";
          const toValue = payload.to ? `$${parseFloat(payload.to).toFixed(2)}` : "not set";
          return `Updated estimated value from ${fromValue} to ${toValue}`;
        } else if (payload.field === "projectedCloseDate") {
          const fromDate = payload.from ? format(new Date(payload.from), "MMM d, yyyy") : "not set";
          const toDate = payload.to ? format(new Date(payload.to), "MMM d, yyyy") : "not set";
          return `Updated close date from ${fromDate} to ${toDate}`;
        }
        return `Updated ${payload.field || "field"}`;
      case "created":
        return "Lead created";
      default:
        return "Activity recorded";
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle>{leadName} - Activity Timeline</SheetTitle>
          <SheetDescription>
            Track all interactions, notes, callbacks, and changes
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col overflow-hidden mt-4">
          {/* Quick Action Forms */}
          <Tabs defaultValue="note" className="w-full mb-4">
            <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-6 flex-wrap">
              <TabsTrigger value="note" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none">Add Note</TabsTrigger>
              <TabsTrigger value="callback" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none">Log Callback</TabsTrigger>
            </TabsList>

            <TabsContent value="note">
              <form onSubmit={handleNoteSubmit} className="space-y-3">
                <Textarea
                  placeholder="Add a note about this lead..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  rows={3}
                  data-testid="textarea-add-note"
                  className="resize-none"
                />
                <Button
                  type="submit"
                  disabled={!noteContent.trim() || addNoteMutation.isPending}
                  className="w-full"
                  data-testid="button-save-note"
                >
                  {addNoteMutation.isPending ? "Saving..." : "Save Note"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="callback">
              <form onSubmit={handleCallbackSubmit} className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Callback Date</label>
                  <Input
                    type="date"
                    value={callbackDate}
                    onChange={(e) => setCallbackDate(e.target.value)}
                    required
                    data-testid="input-callback-date"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Who Called Back</label>
                  <Input
                    placeholder="Customer name or team member"
                    value={callbackCaller}
                    onChange={(e) => setCallbackCaller(e.target.value)}
                    required
                    data-testid="input-callback-caller"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Response/Notes</label>
                  <Textarea
                    placeholder="What was discussed..."
                    value={callbackResponse}
                    onChange={(e) => setCallbackResponse(e.target.value)}
                    rows={3}
                    data-testid="textarea-callback-response"
                    className="resize-none"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!callbackDate || !callbackCaller.trim() || logCallbackMutation.isPending}
                  className="w-full"
                  data-testid="button-log-callback"
                >
                  {logCallbackMutation.isPending ? "Logging..." : "Log Callback"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Activity Timeline */}
          <div className="border-t pt-4 flex-1 overflow-hidden flex flex-col">
            <h3 className="font-semibold mb-3">Activity History</h3>
            <ScrollArea className="flex-1">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="p-4">
                      <Skeleton className="h-4 w-3/4 mb-2" />
                      <Skeleton className="h-3 w-1/2" />
                    </Card>
                  ))}
                </div>
              ) : history.length === 0 ? (
                <Card className="p-6">
                  <p className="text-center text-muted-foreground">
                    No activity yet. Add a note or log a callback to get started.
                  </p>
                </Card>
              ) : (
                <div className="space-y-3 pb-4">
                  {history.map((entry) => (
                    <Card
                      key={entry.id}
                      className={`p-4 border transition-all hover:shadow-md ${getActivityBgColor(entry.actionType)}`}
                    >
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 mt-1">{getActivityIcon(entry.actionType)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-sm font-medium truncate">
                              {entry.actor || "System"}
                            </span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(entry.createdAt), "MMM d, yyyy 'at' h:mm a")}
                            </span>
                          </div>
                          <p className="text-sm break-words">{getActivityDescription(entry)}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
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
  calculateDaysToClose,
  formatCurrency,
  technicians,
  isSearchMatch = false,
}: {
  lead: Lead;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (data: any) => void;
  onDelete: () => void;
  onMarkWon: () => void;
  onMarkLost: () => void;
  calculateDaysToClose: (date: Date | string | null) => string | null;
  formatCurrency: (value: string | number | null | undefined) => string;
  technicians: any[];
  isSearchMatch?: boolean;
}) {
  const [activeTab, setActiveTab] = useState("details");
  const [noteContent, setNoteContent] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackCaller, setCallbackCaller] = useState("");
  const [callbackResponse, setCallbackResponse] = useState("");
  const { toast } = useToast();
  
  const handleSheetClose = (open: boolean) => {
    if (!open) {
      onToggleExpand();
      setActiveTab("details");
    }
  };
  
  const [editedLead, setEditedLead] = useState({
    estimatedValue: lead.estimatedValue || "",
    projectedCloseDate: lead.projectedCloseDate ? format(new Date(lead.projectedCloseDate), "yyyy-MM-dd") : "",
    customerType: lead.customerType || "",
    jobType: lead.jobType || "",
    leadSource: lead.leadSource || "",
    assignedEmployeeId: lead.assignedEmployeeId || "",
  });

  const isActive = !lead.won && !lead.lost;
  const daysToClose = calculateDaysToClose(lead.projectedCloseDate);

  // Fetch lead history for Activity tab
  const { data: history = [], isLoading: isLoadingHistory } = useQuery<any[]>({
    queryKey: ["/api/leads", lead.id, "history"],
    enabled: isExpanded && activeTab === "activity",
  });

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: async (note: string) => {
      const res = await apiRequest("POST", `/api/leads/${lead.id}/history`, {
        actionType: "note_added",
        payload: { note },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", lead.id, "history"] });
      toast({ description: "Note added", duration: 1000 });
      setNoteContent("");
    },
  });

  // Log callback mutation
  const logCallbackMutation = useMutation({
    mutationFn: async (data: { date: string; caller: string; response: string }) => {
      const res = await apiRequest("POST", `/api/leads/${lead.id}/history`, {
        actionType: "callback_logged",
        payload: data,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", lead.id, "history"] });
      toast({ description: "Callback logged", duration: 1000 });
      setCallbackDate("");
      setCallbackCaller("");
      setCallbackResponse("");
    },
  });

  const getActivityIcon = (actionType: string) => {
    switch (actionType) {
      case "note_added": return <StickyNote className="h-4 w-4 text-blue-600" />;
      case "callback_logged": return <Phone className="h-4 w-4 text-green-600" />;
      case "status_changed": return <ArrowRightCircle className="h-4 w-4 text-purple-600" />;
      case "assignment_changed": return <UserPlus className="h-4 w-4 text-orange-600" />;
      case "field_updated": return <Edit className="h-4 w-4 text-yellow-600" />;
      case "created": return <Plus className="h-4 w-4 text-emerald-600" />;
      default: return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getActivityDescription = (entry: any) => {
    const { actionType, payload } = entry;
    const getEmployeeName = (employeeId: string | null) => {
      if (!employeeId) return "Unassigned";
      const employee = technicians.find(t => t.id === employeeId);
      return employee ? employee.name : employeeId;
    };
    switch (actionType) {
      case "note_added": return payload.note || "Added a note";
      case "callback_logged": return `Callback from ${payload.caller || "Unknown"}${payload.response ? `: ${payload.response}` : ""}`;
      case "status_changed": return `Status: ${payload.from || "?"} → ${payload.to || "?"}`;
      case "assignment_changed": return `Assigned: ${getEmployeeName(payload.from)} → ${getEmployeeName(payload.to)}`;
      case "field_updated": return `Updated ${payload.field || "field"}`;
      case "created": return "Lead created";
      default: return "Activity recorded";
    }
  };

  const handleOpenWithActivity = () => {
    setActiveTab("activity");
    onToggleExpand();
  };

  return (
    <>
      <Card 
        data-testid={`card-lead-${lead.id}`}
        className={isSearchMatch ? "ring-2 ring-primary/30 bg-primary/5 transition-all duration-200" : ""}
      >
      <CardHeader className="pb-3">
        {/* Row 1: Name + Status */}
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="break-words text-base leading-tight flex-1 min-w-0 flex items-center gap-1.5" data-testid={`text-lead-name-${lead.id}`}>
            {lead.name}
            {(() => {
              try {
                if (lead.quoteDetails) {
                  const details = JSON.parse(lead.quoteDetails);
                  if (details.equipment?.some((item: any) => item.isElite)) {
                    return <Crown className="h-4 w-4 text-amber-500 flex-shrink-0" />;
                  }
                }
              } catch { /* ignore */ }
              return null;
            })()}
          </CardTitle>
          <div className="flex-shrink-0">
            {isActive ? (
              <Select
                value={lead.status}
                onValueChange={(value) => onUpdate({ status: value })}
              >
                <SelectTrigger className="h-8 min-w-[100px] text-xs" data-testid={`select-status-${lead.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="New">New</SelectItem>
                  <SelectItem value="Contacted">Contacted</SelectItem>
                  <SelectItem value="Quote Sent">Quote Sent</SelectItem>
                  <SelectItem value="Negotiating">Negotiating</SelectItem>
                  <SelectItem value="Won">Won</SelectItem>
                  <SelectItem value="Lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant={lead.won ? "default" : "destructive"} className="text-xs" data-testid={`badge-status-${lead.id}`}>
                {lead.status}
              </Badge>
            )}
          </div>
        </div>

        {/* Row 2: Contact Info - Compact inline */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:underline" data-testid={`link-phone-${lead.id}`}>
              <Phone className="h-3 w-3" />
              <span>{lead.phone}</span>
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:underline truncate max-w-[180px]" data-testid={`link-email-${lead.id}`}>
              <Mail className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{lead.email}</span>
            </a>
          )}
          {lead.address && (
            <span className="flex items-center gap-1" data-testid={`text-address-${lead.id}`}>
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span className="truncate max-w-[200px]">{lead.address}</span>
            </span>
          )}
        </div>

        {/* Row 3: Value + Date - Compact badges */}
        {(lead.estimatedValue || lead.projectedCloseDate) && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {lead.estimatedValue && (
              <Badge variant="secondary" className="text-xs font-medium bg-[#ededed]" data-testid={`text-value-${lead.id}`}>
                <DollarSign className="h-3 w-3 mr-1" />
                {formatCurrency(lead.estimatedValue)}
              </Badge>
            )}
            {lead.projectedCloseDate && (
              <Badge variant="outline" className="text-xs" data-testid={`text-close-date-${lead.id}`}>
                <Calendar className="h-3 w-3 mr-1" />
                {format(new Date(lead.projectedCloseDate), "MMM dd")}
                {daysToClose && (
                  <span
                    className={`ml-1 ${daysToClose.includes("Overdue") ? "text-red-600" : ""}`}
                    data-testid={`text-days-to-close-${lead.id}`}
                  >
                    ({daysToClose})
                  </span>
                )}
              </Badge>
            )}
          </div>
        )}

        {/* Row 4: Client Issue */}
        {lead.clientIssue && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2" data-testid={`text-issue-${lead.id}`}>
            {lead.clientIssue}
          </p>
        )}

        {/* Row 5: Quote Reference */}
        {lead.quoteId && (
          <div className="mt-3 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md p-2 bg-[#fcfcfc]" data-testid={`quote-reference-${lead.id}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <FileText className="h-3 w-3 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <span className="text-xs font-medium text-blue-900 dark:text-blue-100">
                  Quote #{lead.quoteId.slice(0, 8)}
                </span>
              </div>
              <QuoteReferenceLink quoteId={lead.quoteId} />
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {/* Action Buttons - Compact view */}
        <div className="flex items-center justify-between gap-2">
          {/* Left: Quick action buttons */}
          <div className="flex items-center gap-1">
            {isActive && (
              <>
                <Button size="icon" variant="outline" className="h-8 w-8 touch-manipulation" onClick={onMarkWon} title="Mark Won" data-testid={`button-mark-won-${lead.id}`}>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </Button>
                <Button size="icon" variant="outline" className="h-8 w-8 touch-manipulation" onClick={onMarkLost} title="Mark Lost" data-testid={`button-mark-lost-${lead.id}`}>
                  <X className="h-4 w-4 text-red-600" />
                </Button>
              </>
            )}
            <Button size="icon" variant="outline" className="h-8 w-8 touch-manipulation" onClick={handleOpenWithActivity} title="View Activity" data-testid="button-view-activity">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>

          {/* Right: Open full details */}
          <Button size="sm" variant="ghost" className="text-xs h-8" onClick={onToggleExpand} data-testid={`button-expand-${lead.id}`}>
            Details
          </Button>
        </div>
      </CardContent>

      {/* Full-screen Lead Details Sheet */}
      <Sheet open={isExpanded} onOpenChange={handleSheetClose}>
        <SheetContent side="bottom" className="h-[95vh] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b flex-shrink-0 pr-12">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-lg truncate">{lead.name}</SheetTitle>
                <SheetDescription className="text-xs">
                  {lead.phone && <span className="mr-3">{lead.phone}</span>}
                  {lead.email && <span className="truncate">{lead.email}</span>}
                </SheetDescription>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Select
                  value={lead.status}
                  onValueChange={(value) => onUpdate({ status: value })}
                >
                  <SelectTrigger className="h-8 w-[110px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="New">New</SelectItem>
                    <SelectItem value="Contacted">Contacted</SelectItem>
                    <SelectItem value="Quote Sent">Quote Sent</SelectItem>
                    <SelectItem value="Negotiating">Negotiating</SelectItem>
                    <SelectItem value="Won">Won</SelectItem>
                    <SelectItem value="Lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1 px-4 py-3">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-6 flex-wrap">
                <TabsTrigger value="details" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none">Details</TabsTrigger>
                <TabsTrigger value="activity" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none">
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Log
                </TabsTrigger>
              </TabsList>

              {/* Details Tab */}
              <TabsContent value="details" className="space-y-4">
                {/* Contact Info */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Contact Information</h4>
                  <div className="grid gap-2 text-sm">
                    {lead.phone && (
                      <a href={`tel:${lead.phone}`} className="flex items-center gap-2 hover:underline">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        {lead.phone}
                      </a>
                    )}
                    {lead.email && (
                      <a href={`mailto:${lead.email}`} className="flex items-center gap-2 hover:underline">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        {lead.email}
                      </a>
                    )}
                    {lead.address && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span>{lead.address}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Client Issue */}
                {lead.clientIssue && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Client Issue</h4>
                    <p className="text-sm text-muted-foreground">{lead.clientIssue}</p>
                  </div>
                )}

                {/* Equipment Details from Proposal Builder */}
                {lead.quoteDetails && (() => {
                  try {
                    const details = JSON.parse(lead.quoteDetails);
                    if (details.equipment && details.equipment.length > 0) {
                      return (
                        <div className="space-y-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md p-3">
                          <h4 className="text-sm font-medium text-green-800 dark:text-green-200 flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            Accepted Equipment
                          </h4>
                          <div className="space-y-3">
                            {details.equipment.map((item: any, idx: number) => (
                              <div key={idx} className="bg-white dark:bg-gray-900 rounded p-2 border">
                                {item.type === "crawlspace" ? (
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge variant="outline" className="text-xs bg-teal-50 text-teal-700 border-teal-300">Crawlspace</Badge>
                                      <span className="text-xs text-muted-foreground">{item.tierName}</span>
                                      {item.isElite && (
                                        <Badge className="bg-amber-500 text-white text-xs">
                                          <Crown className="h-3 w-3 mr-1" />
                                          Elite
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="font-medium text-sm mt-1">Crawlspace Encapsulation - {item.tierName}</p>
                                    {item.tierDescription && (
                                      <p className="text-xs text-muted-foreground">{item.tierDescription}</p>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-1">Base price: ${item.tierPrice?.toLocaleString()}</p>
                                    {item.isElite && item.eliteBundles && (
                                      <div className="text-xs text-amber-700 dark:text-amber-300 mt-1 bg-amber-50 dark:bg-amber-950/30 p-1.5 rounded space-y-0.5">
                                        <p className="font-medium">Elite Package Includes:</p>
                                        {Object.entries(item.eliteBundles).map(([key, price]) => (
                                          <p key={key}>• {key.replace(/^crawl-/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}: ${(price as number).toLocaleString()}</p>
                                        ))}
                                        {item.eliteSavings > 0 && (
                                          <p className="font-medium text-green-600">Savings: ${item.eliteSavings.toLocaleString()}</p>
                                        )}
                                      </div>
                                    )}
                                    <p className="text-sm font-medium text-primary mt-1">
                                      ${item.totalPrice?.toLocaleString()}
                                    </p>
                                  </div>
                                ) : item.type === "custom" ? (
                                  <div>
                                    <p className="font-medium text-sm">Custom Build - {item.tonnage}</p>
                                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                      <p>• {item.outdoor?.brand} {item.outdoor?.name} {item.outdoor?.model && <span className="font-mono">({item.outdoor.model})</span>}</p>
                                      <p>• {item.coil?.brand} {item.coil?.name} {item.coil?.model && <span className="font-mono">({item.coil.model})</span>}</p>
                                      <p>• {item.indoor?.brand} {item.indoor?.name} {item.indoor?.model && <span className="font-mono">({item.indoor.model})</span>}</p>
                                      <p>• {item.thermostat?.brand} {item.thermostat?.name} {item.thermostat?.model && <span className="font-mono">({item.thermostat.model})</span>}</p>
                                    </div>
                                    <p className="text-sm font-medium text-primary mt-1">
                                      ${item.priceLow?.toLocaleString()} - ${item.priceHigh?.toLocaleString()}
                                    </p>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge variant="outline" className="text-xs">{item.packageLevel}</Badge>
                                      <span className="text-xs text-muted-foreground">{item.tonnage}</span>
                                      {item.isElite && (
                                        <Badge className="bg-amber-500 text-white text-xs">
                                          <Crown className="h-3 w-3 mr-1" />
                                          Elite
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="font-medium text-sm mt-1">{item.unitTypeName} ({item.tier})</p>
                                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                      <p>• {item.outdoor?.brand} {item.outdoor?.name} {item.outdoor?.model && <span className="font-mono">({item.outdoor.model})</span>}</p>
                                      {item.indoor?.name && <p>• {item.indoor.name} {item.indoor?.model && <span className="font-mono">({item.indoor.model})</span>}</p>}
                                      {item.thermostat?.name && <p>• {item.thermostat.name} {item.thermostat?.model && <span className="font-mono">({item.thermostat.model})</span>}</p>}
                                    </div>
                                    {item.isElite && item.eliteBundles && (
                                      <div className="text-xs text-amber-700 dark:text-amber-300 mt-1 bg-amber-50 dark:bg-amber-950/30 p-1.5 rounded space-y-0.5">
                                        <p className="font-medium">Elite Package Includes:</p>
                                        {Object.entries(item.eliteBundles).map(([key, price]) => (
                                          <p key={key}>• {key.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}: ${(price as number).toLocaleString()}</p>
                                        ))}
                                        {item.eliteSavings > 0 && (
                                          <p className="font-medium text-green-600">Savings: ${item.eliteSavings.toLocaleString()}</p>
                                        )}
                                      </div>
                                    )}
                                    <p className="text-sm font-medium text-primary mt-1">
                                      ${item.totalPrice?.toLocaleString()}
                                      {item.monthlyPayment > 0 && (
                                        <span className="text-xs text-muted-foreground ml-2">
                                          (${item.monthlyPayment?.toLocaleString()}/mo)
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          {details.pricing && (
                            <div className="pt-2 border-t border-green-200 dark:border-green-700">
                              {details.hasCustomBuilds ? (
                                <>
                                  <p className="text-sm font-bold text-green-800 dark:text-green-200">
                                    Total: ${details.pricing.totalLow?.toLocaleString()} - ${details.pricing.totalHigh?.toLocaleString()}
                                  </p>
                                  <p className="text-xs text-green-700 dark:text-green-300">
                                    Monthly: ${details.pricing.monthlyLow?.toLocaleString()} - ${details.pricing.monthlyHigh?.toLocaleString()}/mo
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="text-sm font-bold text-green-800 dark:text-green-200">
                                    Total: ${details.pricing.totalHigh?.toLocaleString()}
                                  </p>
                                  <p className="text-xs text-green-700 dark:text-green-300">
                                    Monthly: ${details.pricing.monthlyHigh?.toLocaleString()}/mo
                                  </p>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  } catch {
                    return null;
                  }
                })()}

                {/* Quote Reference */}
                {lead.quoteId && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium">Quote #{lead.quoteId.slice(0, 8)}</span>
                      </div>
                      <QuoteReferenceLink quoteId={lead.quoteId} />
                    </div>
                  </div>
                )}

                {/* Lead Details Form */}
                <div className="space-y-3 pt-2 border-t">
                  <h4 className="text-sm font-medium">Lead Details</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Estimated Value</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={editedLead.estimatedValue}
                        onChange={(e) => setEditedLead({ ...editedLead, estimatedValue: e.target.value })}
                        disabled={!isActive}
                        className="h-9"
                        data-testid={`input-edit-value-${lead.id}`}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Close Date</label>
                      <Input
                        type="date"
                        value={editedLead.projectedCloseDate}
                        onChange={(e) => setEditedLead({ ...editedLead, projectedCloseDate: e.target.value })}
                        disabled={!isActive}
                        className="h-9"
                        data-testid={`input-edit-close-date-${lead.id}`}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Customer Type</label>
                      <Input
                        value={editedLead.customerType}
                        onChange={(e) => setEditedLead({ ...editedLead, customerType: e.target.value })}
                        placeholder="Residential, Commercial"
                        disabled={!isActive}
                        className="h-9"
                        data-testid={`input-edit-customer-type-${lead.id}`}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Job Type</label>
                      <Select 
                        value={editedLead.jobType || ""} 
                        onValueChange={(value) => setEditedLead({ ...editedLead, jobType: value })}
                        disabled={!isActive}
                      >
                        <SelectTrigger className="h-9" data-testid={`select-edit-job-type-${lead.id}`}>
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Installation">Installation</SelectItem>
                          <SelectItem value="Service">Service</SelectItem>
                          <SelectItem value="Maintenance">Maintenance</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Lead Source</label>
                      <Input
                        value={editedLead.leadSource}
                        onChange={(e) => setEditedLead({ ...editedLead, leadSource: e.target.value })}
                        placeholder="Referral, Website, Ad"
                        disabled={!isActive}
                        className="h-9"
                        data-testid={`input-edit-lead-source-${lead.id}`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Assigned Employee</label>
                    <Select
                      value={editedLead.assignedEmployeeId || undefined}
                      onValueChange={(value) => setEditedLead({ ...editedLead, assignedEmployeeId: value })}
                      disabled={!isActive}
                    >
                      <SelectTrigger className="h-9" data-testid={`select-edit-assigned-employee-${lead.id}`}>
                        <SelectValue placeholder="None (Optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {technicians.map((tech) => (
                          <SelectItem key={tech.id} value={tech.id}>
                            {tech.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {isActive && (
                    <Button
                      size="sm"
                      onClick={() => {
                        const updateData: any = {
                          estimatedValue: editedLead.estimatedValue || undefined,
                          customerType: editedLead.customerType || undefined,
                          jobType: editedLead.jobType || undefined,
                          leadSource: editedLead.leadSource || undefined,
                          assignedEmployeeId: editedLead.assignedEmployeeId || undefined,
                        };
                        if (editedLead.projectedCloseDate) {
                          updateData.projectedCloseDate = new Date(editedLead.projectedCloseDate).toISOString();
                        }
                        onUpdate(updateData);
                      }}
                      data-testid={`button-save-details-${lead.id}`}
                    >
                      Save Details
                    </Button>
                  )}
                </div>
              </TabsContent>

              {/* Activity Tab */}
              <TabsContent value="activity" className="space-y-4">
                {/* Add Note Form */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Add Note</h4>
                  <Textarea
                    placeholder="Add a note about this lead..."
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    rows={2}
                    className="resize-none"
                    data-testid="textarea-add-note"
                  />
                  <Button
                    size="sm"
                    disabled={!noteContent.trim() || addNoteMutation.isPending}
                    onClick={() => noteContent.trim() && addNoteMutation.mutate(noteContent.trim())}
                    data-testid="button-save-note"
                  >
                    {addNoteMutation.isPending ? "Saving..." : "Save Note"}
                  </Button>
                </div>

                {/* Log Callback Form */}
                <div className="space-y-2 pt-3 border-t">
                  <h4 className="text-sm font-medium">Log Callback</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={callbackDate}
                      onChange={(e) => setCallbackDate(e.target.value)}
                      className="h-9"
                      data-testid="input-callback-date"
                    />
                    <Input
                      placeholder="Who called"
                      value={callbackCaller}
                      onChange={(e) => setCallbackCaller(e.target.value)}
                      className="h-9"
                      data-testid="input-callback-caller"
                    />
                  </div>
                  <Textarea
                    placeholder="What was discussed..."
                    value={callbackResponse}
                    onChange={(e) => setCallbackResponse(e.target.value)}
                    rows={2}
                    className="resize-none"
                    data-testid="textarea-callback-response"
                  />
                  <Button
                    size="sm"
                    disabled={!callbackDate || !callbackCaller.trim() || logCallbackMutation.isPending}
                    onClick={() => callbackDate && callbackCaller.trim() && logCallbackMutation.mutate({
                      date: callbackDate,
                      caller: callbackCaller.trim(),
                      response: callbackResponse.trim(),
                    })}
                    data-testid="button-log-callback"
                  >
                    {logCallbackMutation.isPending ? "Logging..." : "Log Callback"}
                  </Button>
                </div>

                {/* Activity History */}
                <div className="pt-3 border-t">
                  <h4 className="text-sm font-medium mb-3">Activity History</h4>
                  {isLoadingHistory ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="p-3 bg-muted/50 rounded">
                          <Skeleton className="h-4 w-3/4 mb-2" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      ))}
                    </div>
                  ) : history.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No activity yet. Add a note or log a callback to get started.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {history.map((entry) => (
                        <div key={entry.id} className="flex gap-2 p-2 bg-muted/30 rounded text-sm">
                          <div className="flex-shrink-0 mt-0.5">{getActivityIcon(entry.actionType)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-xs">{entry.actor || "System"}</span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(entry.createdAt), "MMM d, h:mm a")}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{getActivityDescription(entry)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </ScrollArea>

          {/* Footer with delete button only */}
          <div className="px-4 py-3 border-t flex-shrink-0 flex items-center justify-center">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" data-testid={`button-delete-${lead.id}`}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete Lead
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
          </div>
        </SheetContent>
      </Sheet>
      </Card>
    </>
  );
}
