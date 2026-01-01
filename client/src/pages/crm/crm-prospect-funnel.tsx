import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Phone,
  Mail,
  MapPin,
  Calendar,
  AlertTriangle,
  Flame,
  Thermometer,
  Snowflake,
  Clock,
  Users,
  Activity,
  TrendingUp,
  Search,
  X,
  Filter,
  ChevronRight,
  CheckCircle2,
  MessageSquare,
  StickyNote,
} from "lucide-react";
import { format, isToday, isPast, parseISO } from "date-fns";
import type { CrmUser, CrmCustomer, CrmFollowUp, SalesStage, InterestLevel, FollowUpType } from "@shared/schema";

type ProspectMetrics = {
  activeProspects: number;
  pendingActions: number;
  conversionRate: string;
  statusBreakdown: {
    new: number;
    contacted: number;
    quote_sent: number;
    negotiating: number;
    won: number;
    lost: number;
  };
};

const NEXT_STAGE: Record<SalesStage, SalesStage | null> = {
  new: "contacted",
  contacted: "quote_sent",
  quote_sent: "negotiating",
  negotiating: "won",
  won: null,
  lost: null,
};

const STAGE_LABELS: Record<SalesStage, string> = {
  new: "New",
  contacted: "Contacted",
  quote_sent: "Quote Sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

function InterestBadge({ level }: { level: InterestLevel | null | undefined }) {
  if (!level) return null;
  
  const config = {
    hot: { icon: Flame, className: "bg-red-100 text-red-700 border-red-200" },
    warm: { icon: Thermometer, className: "bg-amber-100 text-amber-700 border-amber-200" },
    cold: { icon: Snowflake, className: "bg-blue-100 text-blue-700 border-blue-200" },
  };
  
  const { icon: Icon, className } = config[level];
  
  return (
    <Badge variant="outline" className={`text-xs ${className}`}>
      <Icon className="h-3 w-3 mr-1" />
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </Badge>
  );
}

function FollowUpBadge({ nextFollowUpAt }: { nextFollowUpAt: Date | string | null | undefined }) {
  if (!nextFollowUpAt) return null;
  
  const date = typeof nextFollowUpAt === "string" ? parseISO(nextFollowUpAt) : nextFollowUpAt;
  
  if (isPast(date) && !isToday(date)) {
    return (
      <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-200">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Overdue
      </Badge>
    );
  }
  
  if (isToday(date)) {
    return (
      <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-200">
        <Clock className="h-3 w-3 mr-1" />
        Today
      </Badge>
    );
  }
  
  return (
    <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600 border-gray-200">
      <Calendar className="h-3 w-3 mr-1" />
      {format(date, "MMM d")}
    </Badge>
  );
}

function FollowUpTypeIcon({ type }: { type: FollowUpType }) {
  switch (type) {
    case "call":
      return <Phone className="h-3 w-3" />;
    case "email":
      return <Mail className="h-3 w-3" />;
    case "visit":
      return <MapPin className="h-3 w-3" />;
    case "text":
      return <MessageSquare className="h-3 w-3" />;
    default:
      return <Calendar className="h-3 w-3" />;
  }
}

export default function CrmProspectFunnel() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [activeFilter, setActiveFilter] = useState<string>("All Active");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");
  
  const [expandedProspectId, setExpandedProspectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("details");
  
  const [followUpDialogOpen, setFollowUpDialogOpen] = useState(false);
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const [followUpType, setFollowUpType] = useState<FollowUpType>("call");
  const [followUpDueDate, setFollowUpDueDate] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");
  
  const [wonConfirmOpen, setWonConfirmOpen] = useState(false);
  const [lostConfirmOpen, setLostConfirmOpen] = useState(false);
  const [confirmProspectId, setConfirmProspectId] = useState<string | null>(null);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const getApiStatus = (filter: string): string | null => {
    if (filter === "All Active") return null;
    if (filter === "Won") return "won";
    if (filter === "Lost") return "lost";
    return filter.toLowerCase().replace(" ", "_");
  };

  const apiStatus = getApiStatus(activeFilter);
  
  const { data: prospects = [], isLoading: prospectsLoading } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/crm/prospects", apiStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (apiStatus) params.set("status", apiStatus);
      const res = await fetch(`/api/crm/prospects?${params.toString()}`);
      return res.json();
    },
    enabled: !!currentUser,
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<ProspectMetrics>({
    queryKey: ["/api/crm/prospects/metrics"],
    enabled: !!currentUser,
  });

  const { data: followUps = [], isLoading: followUpsLoading } = useQuery<CrmFollowUp[]>({
    queryKey: ["/api/crm/follow-ups"],
    enabled: !!currentUser,
  });

  const { data: users = [] } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!currentUser,
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const updateStageMutation = useMutation({
    mutationFn: async ({ id, salesStage }: { id: string; salesStage: SalesStage }) => {
      const res = await apiRequest("PATCH", `/api/crm/customers/${id}/stage`, { salesStage });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects/metrics"] });
      toast({ title: "Stage updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update stage", description: error.message, variant: "destructive" });
    },
  });

  const createFollowUpMutation = useMutation({
    mutationFn: async (data: { customerId: string; followUpType: FollowUpType; dueAt: string; notes?: string }) => {
      const res = await apiRequest("POST", "/api/crm/follow-ups", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects"] });
      setFollowUpDialogOpen(false);
      setSelectedProspectId(null);
      setFollowUpType("call");
      setFollowUpDueDate("");
      setFollowUpNotes("");
      toast({ title: "Follow-up scheduled" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to schedule follow-up", description: error.message, variant: "destructive" });
    },
  });

  const fuzzyMatch = (text: string, search: string): number => {
    if (!text || !search) return 0;
    const textLower = text.toLowerCase();
    const searchLower = search.toLowerCase();
    
    if (textLower.includes(searchLower)) return 100;
    
    let searchIdx = 0;
    let matchCount = 0;
    for (let i = 0; i < textLower.length && searchIdx < searchLower.length; i++) {
      if (textLower[i] === searchLower[searchIdx]) {
        matchCount++;
        searchIdx++;
      }
    }
    
    if (matchCount >= searchLower.length * 0.6) {
      return (matchCount / searchLower.length) * 80;
    }
    
    return 0;
  };

  const filteredProspects = useMemo(() => {
    return prospects
      .map((prospect) => {
        let searchScore = 0;
        if (searchTerm.trim()) {
          const search = searchTerm.trim();
          const nameScore = fuzzyMatch(prospect.name || '', search);
          const phoneDigits = prospect.phone?.replace(/\D/g, '') || '';
          const searchDigits = search.replace(/\D/g, '');
          const phoneScore = searchDigits && phoneDigits.includes(searchDigits) ? 100 : 0;
          searchScore = Math.max(nameScore, phoneScore);
        }
        return { prospect, searchScore };
      })
      .filter(({ prospect, searchScore }) => {
        if (searchTerm.trim() && searchScore === 0) return false;
        if (selectedEmployeeId !== "all" && prospect.assignedSalesRepId !== selectedEmployeeId) return false;
        
        if (activeFilter === "All Active") {
          return prospect.salesStage !== "won" && prospect.salesStage !== "lost";
        }
        if (activeFilter === "Won") return prospect.salesStage === "won";
        if (activeFilter === "Lost") return prospect.salesStage === "lost";
        
        return prospect.salesStage === activeFilter.toLowerCase().replace(" ", "_");
      })
      .sort((a, b) => b.searchScore - a.searchScore)
      .map(({ prospect }) => prospect);
  }, [prospects, searchTerm, selectedEmployeeId, activeFilter]);

  const handleMoveToNextStage = (prospect: CrmCustomer) => {
    const nextStage = prospect.salesStage ? NEXT_STAGE[prospect.salesStage] : null;
    if (nextStage) {
      if (nextStage === "won") {
        setConfirmProspectId(prospect.id);
        setWonConfirmOpen(true);
      } else {
        updateStageMutation.mutate({ id: prospect.id, salesStage: nextStage });
      }
    }
  };

  const handleMarkWon = () => {
    if (confirmProspectId) {
      updateStageMutation.mutate({ id: confirmProspectId, salesStage: "won" });
      setWonConfirmOpen(false);
      setConfirmProspectId(null);
      setExpandedProspectId(null);
    }
  };

  const handleMarkLost = () => {
    if (confirmProspectId) {
      updateStageMutation.mutate({ id: confirmProspectId, salesStage: "lost" });
      setLostConfirmOpen(false);
      setConfirmProspectId(null);
      setExpandedProspectId(null);
    }
  };

  const handleAddFollowUp = (prospectId: string) => {
    setSelectedProspectId(prospectId);
    setFollowUpDialogOpen(true);
  };

  const handleSubmitFollowUp = () => {
    if (!selectedProspectId || !followUpDueDate) return;
    
    createFollowUpMutation.mutate({
      customerId: selectedProspectId,
      followUpType,
      dueAt: new Date(followUpDueDate).toISOString(),
      notes: followUpNotes || undefined,
    });
  };

  const getProspectFollowUps = (prospectId: string) => {
    return followUps.filter(f => f.customerId === prospectId)
      .sort((a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime());
  };

  const selectedEmployeeName = selectedEmployeeId === "all" 
    ? null 
    : users.find((u) => u.id === selectedEmployeeId)?.name || "Unknown";

  if (authLoading) {
    return (
      <CrmLayout currentUser={{} as CrmUser}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </CrmLayout>
    );
  }

  if (!currentUser) {
    navigate("/crm/login");
    return null;
  }

  const isLoading = prospectsLoading || followUpsLoading;

  const expandedProspect = expandedProspectId ? filteredProspects.find(p => p.id === expandedProspectId) : null;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-page-title">
              Prospect Funnel
            </h1>
            <p className="text-sm text-slate-500">
              Track prospects through your sales pipeline
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => navigate("/crm/accounts/new")}
            className="bg-[#711419] hover:bg-[#5a1014]"
            data-testid="button-add-prospect"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add New Prospect
          </Button>
        </div>

        {selectedEmployeeName && (
          <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {metricsLoading ? (
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
                  <CardDescription className="text-xs sm:text-sm flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    Active Prospects
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl sm:text-3xl font-bold" data-testid="text-active-prospects">
                    {metrics?.activeProspects || 0}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-metric-pending">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs sm:text-sm flex items-center gap-1">
                    <Activity className="h-4 w-4" />
                    Pending Actions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl sm:text-3xl font-bold" data-testid="text-pending-actions">
                    {metrics?.pendingActions || 0}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-metric-conversion">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs sm:text-sm flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    Conversion Rate
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl sm:text-3xl font-bold" data-testid="text-conversion-rate">
                    {metrics?.conversionRate || "0"}%
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-metric-breakdown">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs sm:text-sm">Status Breakdown</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-3 gap-1 text-xs">
                    <div className="text-center">
                      <div className="font-bold text-blue-600">{metrics?.statusBreakdown?.new || 0}</div>
                      <div className="text-muted-foreground">New</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-amber-600">{metrics?.statusBreakdown?.contacted || 0}</div>
                      <div className="text-muted-foreground">Contacted</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-purple-600">{metrics?.statusBreakdown?.quote_sent || 0}</div>
                      <div className="text-muted-foreground">Quote</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Card className="mb-6" data-testid="card-sales-funnel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5" />
              Sales Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">New</div>
                <div className="text-2xl font-bold text-blue-600" data-testid="text-funnel-new">
                  {metrics?.statusBreakdown?.new || 0}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Contacted</div>
                <div className="text-2xl font-bold text-amber-600" data-testid="text-funnel-contacted">
                  {metrics?.statusBreakdown?.contacted || 0}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Quote Sent</div>
                <div className="text-2xl font-bold text-purple-600" data-testid="text-funnel-quote-sent">
                  {metrics?.statusBreakdown?.quote_sent || 0}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Negotiating</div>
                <div className="text-2xl font-bold text-green-600" data-testid="text-funnel-negotiating">
                  {metrics?.statusBreakdown?.negotiating || 0}
                </div>
              </div>
              <div className="text-center bg-green-50 p-2 rounded">
                <div className="text-sm text-muted-foreground">Won</div>
                <div className="text-2xl font-bold text-green-600" data-testid="text-funnel-won">
                  {metrics?.statusBreakdown?.won || 0}
                </div>
              </div>
              <div className="text-center bg-red-50 p-2 rounded">
                <div className="text-sm text-muted-foreground">Lost</div>
                <div className="text-2xl font-bold text-red-600" data-testid="text-funnel-lost">
                  {metrics?.statusBreakdown?.lost || 0}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-prospects"
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

          <div className="flex flex-wrap gap-2">
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Active">All Active</SelectItem>
                <SelectItem value="New">New</SelectItem>
                <SelectItem value="Contacted">Contacted</SelectItem>
                <SelectItem value="Quote Sent">Quote Sent</SelectItem>
                <SelectItem value="Negotiating">Negotiating</SelectItem>
                <SelectItem value="Won">Won</SelectItem>
                <SelectItem value="Lost">Lost</SelectItem>
              </SelectContent>
            </Select>

            {users.length > 0 && (
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger className="w-[150px]" data-testid="select-employee-filter">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <SelectValue placeholder="All Employees" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : filteredProspects.length === 0 ? (
          <Card className="p-8">
            <p className="text-center text-muted-foreground">
              {searchTerm ? "No prospects found matching your search" : "No prospects found"}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredProspects.map((prospect) => {
              const prospectFollowUps = getProspectFollowUps(prospect.id);
              const nextStage = prospect.salesStage ? NEXT_STAGE[prospect.salesStage] : null;
              const isActive = prospect.salesStage !== "won" && prospect.salesStage !== "lost";
              
              return (
                <Card
                  key={prospect.id}
                  className={searchTerm && "ring-2 ring-primary/30 bg-primary/5 transition-all duration-200" ? "" : ""}
                  data-testid={`card-prospect-${prospect.id}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="break-words text-base leading-tight flex-1 min-w-0" data-testid={`text-prospect-name-${prospect.id}`}>
                        {prospect.name}
                      </CardTitle>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <InterestBadge level={prospect.interestLevel as InterestLevel} />
                        {isActive ? (
                          <Select
                            value={prospect.salesStage || "new"}
                            onValueChange={(value) => updateStageMutation.mutate({ id: prospect.id, salesStage: value as SalesStage })}
                          >
                            <SelectTrigger className="h-8 min-w-[100px] text-xs" data-testid={`select-stage-${prospect.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new">New</SelectItem>
                              <SelectItem value="contacted">Contacted</SelectItem>
                              <SelectItem value="quote_sent">Quote Sent</SelectItem>
                              <SelectItem value="negotiating">Negotiating</SelectItem>
                              <SelectItem value="won">Won</SelectItem>
                              <SelectItem value="lost">Lost</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={prospect.salesStage === "won" ? "default" : "destructive"} className="text-xs">
                            {STAGE_LABELS[prospect.salesStage as SalesStage] || prospect.salesStage}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                      {prospect.phone && (
                        <a href={`tel:${prospect.phone}`} className="flex items-center gap-1 hover:underline" data-testid={`link-phone-${prospect.id}`}>
                          <Phone className="h-3 w-3" />
                          <span>{prospect.phone}</span>
                        </a>
                      )}
                      {prospect.email && (
                        <a href={`mailto:${prospect.email}`} className="flex items-center gap-1 hover:underline truncate max-w-[180px]" data-testid={`link-email-${prospect.id}`}>
                          <Mail className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{prospect.email}</span>
                        </a>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <FollowUpBadge nextFollowUpAt={prospect.nextFollowUpAt} />
                      {prospect.companyName && (
                        <Badge variant="secondary" className="text-xs">
                          {prospect.companyName}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        {isActive && (
                          <>
                            <Button 
                              size="icon" 
                              variant="outline" 
                              className="h-8 w-8 touch-manipulation" 
                              onClick={() => {
                                setConfirmProspectId(prospect.id);
                                setWonConfirmOpen(true);
                              }}
                              title="Mark Won" 
                              data-testid={`button-mark-won-${prospect.id}`}
                            >
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="outline" 
                              className="h-8 w-8 touch-manipulation" 
                              onClick={() => {
                                setConfirmProspectId(prospect.id);
                                setLostConfirmOpen(true);
                              }}
                              title="Mark Lost" 
                              data-testid={`button-mark-lost-${prospect.id}`}
                            >
                              <X className="h-4 w-4 text-red-600" />
                            </Button>
                            {nextStage && nextStage !== "won" && (
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-8 text-xs" 
                                onClick={() => handleMoveToNextStage(prospect)}
                                disabled={updateStageMutation.isPending}
                                data-testid={`button-next-stage-${prospect.id}`}
                              >
                                <ChevronRight className="h-3 w-3 mr-1" />
                                Next Stage
                              </Button>
                            )}
                          </>
                        )}
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="h-8 w-8 touch-manipulation" 
                          onClick={() => handleAddFollowUp(prospect.id)}
                          title="Add Follow-up" 
                          data-testid={`button-add-followup-${prospect.id}`}
                        >
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>

                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-xs h-8" 
                        onClick={() => {
                          setExpandedProspectId(prospect.id);
                          setActiveTab("details");
                        }} 
                        data-testid={`button-expand-${prospect.id}`}
                      >
                        Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Sheet open={!!expandedProspectId} onOpenChange={(open) => !open && setExpandedProspectId(null)}>
          <SheetContent side="bottom" className="h-[95vh] p-0 flex flex-col">
            {expandedProspect && (
              <>
                <SheetHeader className="px-4 py-3 border-b flex-shrink-0 pr-12">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <SheetTitle className="text-lg truncate">{expandedProspect.name}</SheetTitle>
                      <SheetDescription className="text-xs">
                        {expandedProspect.phone && <span className="mr-3">{expandedProspect.phone}</span>}
                        {expandedProspect.email && <span className="truncate">{expandedProspect.email}</span>}
                      </SheetDescription>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <InterestBadge level={expandedProspect.interestLevel as InterestLevel} />
                      <Select
                        value={expandedProspect.salesStage || "new"}
                        onValueChange={(value) => updateStageMutation.mutate({ id: expandedProspect.id, salesStage: value as SalesStage })}
                      >
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="contacted">Contacted</SelectItem>
                          <SelectItem value="quote_sent">Quote Sent</SelectItem>
                          <SelectItem value="negotiating">Negotiating</SelectItem>
                          <SelectItem value="won">Won</SelectItem>
                          <SelectItem value="lost">Lost</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </SheetHeader>

                <ScrollArea className="flex-1 px-4 py-3">
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-6 flex-wrap">
                      <TabsTrigger value="details" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none">Details</TabsTrigger>
                      <TabsTrigger value="followups" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none">
                        <Calendar className="h-3 w-3 mr-1" />
                        Follow-ups ({getProspectFollowUps(expandedProspect.id).length})
                      </TabsTrigger>
                      <TabsTrigger value="notes" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none">
                        <StickyNote className="h-3 w-3 mr-1" />
                        Notes
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="details" className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Contact Information</h4>
                        <div className="grid gap-2 text-sm">
                          {expandedProspect.phone && (
                            <a href={`tel:${expandedProspect.phone}`} className="flex items-center gap-2 hover:underline">
                              <Phone className="h-4 w-4 text-muted-foreground" />
                              {expandedProspect.phone}
                            </a>
                          )}
                          {expandedProspect.email && (
                            <a href={`mailto:${expandedProspect.email}`} className="flex items-center gap-2 hover:underline">
                              <Mail className="h-4 w-4 text-muted-foreground" />
                              {expandedProspect.email}
                            </a>
                          )}
                          {expandedProspect.fullAddress && (
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span>{expandedProspect.fullAddress}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {expandedProspect.companyName && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Company</h4>
                          <p className="text-sm text-muted-foreground">{expandedProspect.companyName}</p>
                        </div>
                      )}

                      {expandedProspect.notes && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Notes</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{expandedProspect.notes}</p>
                        </div>
                      )}

                      <div className="pt-4 border-t flex gap-2">
                        {expandedProspect.salesStage !== "won" && expandedProspect.salesStage !== "lost" && (
                          <>
                            <Button 
                              className="flex-1" 
                              variant="outline"
                              onClick={() => {
                                setConfirmProspectId(expandedProspect.id);
                                setWonConfirmOpen(true);
                              }}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                              Mark Won
                            </Button>
                            <Button 
                              className="flex-1" 
                              variant="outline"
                              onClick={() => {
                                setConfirmProspectId(expandedProspect.id);
                                setLostConfirmOpen(true);
                              }}
                            >
                              <X className="h-4 w-4 mr-2 text-red-600" />
                              Mark Lost
                            </Button>
                          </>
                        )}
                        <Button
                          className="flex-1"
                          onClick={() => navigate(`/crm/customers/${expandedProspect.id}`)}
                        >
                          View Full Profile
                        </Button>
                      </div>
                    </TabsContent>

                    <TabsContent value="followups" className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-medium">Follow-ups</h4>
                        <Button size="sm" onClick={() => handleAddFollowUp(expandedProspect.id)}>
                          <Plus className="h-4 w-4 mr-1" />
                          Add Follow-up
                        </Button>
                      </div>

                      {getProspectFollowUps(expandedProspect.id).length === 0 ? (
                        <Card className="p-6">
                          <p className="text-center text-muted-foreground text-sm">
                            No follow-ups scheduled
                          </p>
                        </Card>
                      ) : (
                        <div className="space-y-3">
                          {getProspectFollowUps(expandedProspect.id).map((followUp) => {
                            const dueDate = new Date(followUp.dueAt);
                            const isOverdue = isPast(dueDate) && !isToday(dueDate) && !followUp.completedAt;
                            const isDueToday = isToday(dueDate) && !followUp.completedAt;
                            
                            return (
                              <Card 
                                key={followUp.id} 
                                className={`p-3 ${isOverdue ? 'border-red-300 bg-red-50' : isDueToday ? 'border-amber-300 bg-amber-50' : ''}`}
                                data-testid={`card-followup-${followUp.id}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <div className={`p-1.5 rounded ${isOverdue ? 'bg-red-100' : isDueToday ? 'bg-amber-100' : 'bg-gray-100'}`}>
                                      <FollowUpTypeIcon type={followUp.followUpType as FollowUpType} />
                                    </div>
                                    <div>
                                      <div className="font-medium text-sm capitalize">{followUp.followUpType}</div>
                                      <div className="text-xs text-muted-foreground">
                                        Due: {format(dueDate, "MMM d, yyyy h:mm a")}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {followUp.completedAt ? (
                                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                                        Completed
                                      </Badge>
                                    ) : isOverdue ? (
                                      <Badge variant="destructive" className="text-xs">
                                        Overdue
                                      </Badge>
                                    ) : isDueToday ? (
                                      <Badge className="text-xs bg-amber-500">
                                        Due Today
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs">
                                        Scheduled
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                {followUp.notes && (
                                  <p className="text-xs text-muted-foreground mt-2 pl-9">{followUp.notes}</p>
                                )}
                                {followUp.outcome && (
                                  <div className="mt-2 pl-9">
                                    <Badge variant="outline" className="text-xs">{followUp.outcome.replace(/_/g, " ")}</Badge>
                                  </div>
                                )}
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="notes" className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Customer Notes</h4>
                        {expandedProspect.notes ? (
                          <div className="bg-gray-50 rounded-lg p-4">
                            <p className="text-sm whitespace-pre-wrap">{expandedProspect.notes}</p>
                          </div>
                        ) : (
                          <Card className="p-6">
                            <p className="text-center text-muted-foreground text-sm">
                              No notes available
                            </p>
                          </Card>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </ScrollArea>
              </>
            )}
          </SheetContent>
        </Sheet>

        <Dialog open={followUpDialogOpen} onOpenChange={setFollowUpDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Schedule Follow-Up</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={followUpType} onValueChange={(v) => setFollowUpType(v as FollowUpType)}>
                  <SelectTrigger data-testid="select-followup-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="visit">Visit</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="datetime-local"
                  value={followUpDueDate}
                  onChange={(e) => setFollowUpDueDate(e.target.value)}
                  data-testid="input-followup-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={followUpNotes}
                  onChange={(e) => setFollowUpNotes(e.target.value)}
                  placeholder="Add any notes..."
                  data-testid="input-followup-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFollowUpDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitFollowUp}
                disabled={!followUpDueDate || createFollowUpMutation.isPending}
                data-testid="button-submit-followup"
              >
                {createFollowUpMutation.isPending ? "Scheduling..." : "Schedule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={wonConfirmOpen} onOpenChange={setWonConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark as Won?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to mark this prospect as won? This will move them to the Won stage.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmProspectId(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleMarkWon} className="bg-green-600 hover:bg-green-700">
                Mark Won
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={lostConfirmOpen} onOpenChange={setLostConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark as Lost?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to mark this prospect as lost? This will move them to the Lost stage.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmProspectId(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleMarkLost} className="bg-red-600 hover:bg-red-700">
                Mark Lost
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </CrmLayout>
  );
}
