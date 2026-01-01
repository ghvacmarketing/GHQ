import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Phone,
  Mail,
  ChevronRight,
  Calendar,
  AlertTriangle,
  Flame,
  Thermometer,
  Snowflake,
  Clock,
} from "lucide-react";
import { format, isToday, isPast, parseISO } from "date-fns";
import type { CrmUser, CrmCustomer, CrmFollowUp, SalesStage, InterestLevel, FollowUpType } from "@shared/schema";

const STAGES: { key: SalesStage; label: string; color: string; bgColor: string; borderColor: string }[] = [
  { key: "new", label: "New", color: "text-blue-700", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
  { key: "contacted", label: "Contacted", color: "text-amber-700", bgColor: "bg-amber-50", borderColor: "border-amber-200" },
  { key: "quote_sent", label: "Quote Sent", color: "text-purple-700", bgColor: "bg-purple-50", borderColor: "border-purple-200" },
  { key: "negotiating", label: "Negotiating", color: "text-green-700", bgColor: "bg-green-50", borderColor: "border-green-200" },
];

const NEXT_STAGE: Record<SalesStage, SalesStage | null> = {
  new: "contacted",
  contacted: "quote_sent",
  quote_sent: "negotiating",
  negotiating: "won",
  won: null,
  lost: null,
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

interface ProspectCardProps {
  prospect: CrmCustomer;
  followUps: CrmFollowUp[];
  onMoveToNextStage: () => void;
  onAddFollowUp: () => void;
  isMoving: boolean;
}

function ProspectCard({ prospect, followUps, onMoveToNextStage, onAddFollowUp, isMoving }: ProspectCardProps) {
  const [, navigate] = useLocation();
  
  const customerFollowUps = followUps.filter(f => f.customerId === prospect.id);
  const lastCompletedFollowUp = customerFollowUps
    .filter(f => f.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0];
  
  const nextStage = prospect.salesStage ? NEXT_STAGE[prospect.salesStage] : null;
  
  return (
    <Card 
      className="mb-3 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate(`/crm/customers/${prospect.id}`)}
      data-testid={`card-prospect-${prospect.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm text-slate-900 truncate" data-testid={`text-prospect-name-${prospect.id}`}>
              {prospect.name}
            </h4>
            {prospect.companyName && (
              <p className="text-xs text-slate-500 truncate">{prospect.companyName}</p>
            )}
          </div>
          <InterestBadge level={prospect.interestLevel as InterestLevel} />
        </div>
        
        <div className="space-y-1 mb-3">
          {prospect.phone && (
            <div className="flex items-center text-xs text-slate-500">
              <Phone className="h-3 w-3 mr-1.5" />
              <span className="truncate">{prospect.phone}</span>
            </div>
          )}
          {prospect.email && (
            <div className="flex items-center text-xs text-slate-500">
              <Mail className="h-3 w-3 mr-1.5" />
              <span className="truncate">{prospect.email}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2 mb-3">
          <FollowUpBadge nextFollowUpAt={prospect.nextFollowUpAt} />
          {lastCompletedFollowUp?.outcome && (
            <Badge variant="secondary" className="text-xs">
              {lastCompletedFollowUp.outcome.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
        
        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          {nextStage && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs h-7"
              onClick={onMoveToNextStage}
              disabled={isMoving}
              data-testid={`button-move-stage-${prospect.id}`}
            >
              <ChevronRight className="h-3 w-3 mr-1" />
              {nextStage === "won" ? "Mark Won" : "Next Stage"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7"
            onClick={onAddFollowUp}
            data-testid={`button-add-followup-${prospect.id}`}
          >
            <Calendar className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CrmProspectFunnel() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [interestFilter, setInterestFilter] = useState<string>("all");
  const [followUpDialogOpen, setFollowUpDialogOpen] = useState(false);
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const [followUpType, setFollowUpType] = useState<FollowUpType>("call");
  const [followUpDueDate, setFollowUpDueDate] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: prospects = [], isLoading: prospectsLoading } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/crm/prospects"],
    enabled: !!currentUser,
  });

  const { data: followUps = [], isLoading: followUpsLoading } = useQuery<CrmFollowUp[]>({
    queryKey: ["/api/crm/follow-ups"],
    enabled: !!currentUser,
  });

  const { data: salesReps = [] } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!currentUser,
  });

  const [salesRepFilter, setSalesRepFilter] = useState<string>("all");

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

  const filteredProspects = useMemo(() => {
    return prospects.filter(p => {
      if (interestFilter !== "all" && p.interestLevel !== interestFilter) return false;
      if (salesRepFilter !== "all" && p.assignedSalesRepId !== salesRepFilter) return false;
      return true;
    });
  }, [prospects, interestFilter, salesRepFilter]);

  const prospectsByStage = useMemo(() => {
    const grouped: Record<SalesStage, CrmCustomer[]> = {
      new: [],
      contacted: [],
      quote_sent: [],
      negotiating: [],
      won: [],
      lost: [],
    };
    
    filteredProspects.forEach(p => {
      if (p.salesStage && grouped[p.salesStage as SalesStage]) {
        grouped[p.salesStage as SalesStage].push(p);
      }
    });
    
    return grouped;
  }, [filteredProspects]);

  const overdueCount = useMemo(() => {
    return filteredProspects.filter(p => {
      if (!p.nextFollowUpAt) return false;
      const date = typeof p.nextFollowUpAt === "string" ? parseISO(p.nextFollowUpAt) : p.nextFollowUpAt;
      return isPast(date) && !isToday(date);
    }).length;
  }, [filteredProspects]);

  const handleMoveToNextStage = (prospect: CrmCustomer) => {
    const nextStage = prospect.salesStage ? NEXT_STAGE[prospect.salesStage] : null;
    if (nextStage) {
      updateStageMutation.mutate({ id: prospect.id, salesStage: nextStage });
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

        <div className="grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-4">
          {STAGES.map(stage => (
            <Card key={stage.key} className={`${stage.bgColor} ${stage.borderColor} border`}>
              <CardContent className="p-2 md:p-4 text-center">
                <p className={`text-xl md:text-3xl font-bold ${stage.color}`} data-testid={`stat-${stage.key}-count`}>
                  {prospectsByStage[stage.key].length}
                </p>
                <p className={`text-xs md:text-sm ${stage.color}`}>{stage.label}</p>
              </CardContent>
            </Card>
          ))}
          <Card className="bg-red-50 border-red-200 border">
            <CardContent className="p-2 md:p-4 text-center">
              <p className="text-xl md:text-3xl font-bold text-red-700" data-testid="stat-overdue-count">
                {overdueCount}
              </p>
              <p className="text-xs md:text-sm text-red-600">Overdue</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-slate-600">Interest:</Label>
            <Select value={interestFilter} onValueChange={setInterestFilter}>
              <SelectTrigger className="w-32" data-testid="select-interest-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="hot">Hot</SelectItem>
                <SelectItem value="warm">Warm</SelectItem>
                <SelectItem value="cold">Cold</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {salesReps.length > 0 && (
            <div className="flex items-center gap-2">
              <Label className="text-sm text-slate-600">Sales Rep:</Label>
              <Select value={salesRepFilter} onValueChange={setSalesRepFilter}>
                <SelectTrigger className="w-40" data-testid="select-salesrep-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Reps</SelectItem>
                  {salesReps.map(rep => (
                    <SelectItem key={rep.id} value={rep.id}>{rep.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {STAGES.map(stage => (
              <div key={stage.key} className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex gap-4 pb-4" style={{ minWidth: "fit-content" }}>
              {STAGES.map(stage => (
                <div key={stage.key} className="w-64 md:w-72 flex-shrink-0">
                  <Card className={`${stage.bgColor} ${stage.borderColor} border mb-3`}>
                    <CardHeader className="py-3 px-4">
                      <CardTitle className={`text-sm font-semibold ${stage.color} flex items-center justify-between`}>
                        {stage.label}
                        <Badge variant="secondary" className="ml-2">
                          {prospectsByStage[stage.key].length}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <div className="space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto pr-1">
                    {prospectsByStage[stage.key].length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-sm">
                        No prospects
                      </div>
                    ) : (
                      prospectsByStage[stage.key].map(prospect => (
                        <ProspectCard
                          key={prospect.id}
                          prospect={prospect}
                          followUps={followUps}
                          onMoveToNextStage={() => handleMoveToNextStage(prospect)}
                          onAddFollowUp={() => handleAddFollowUp(prospect.id)}
                          isMoving={updateStageMutation.isPending}
                        />
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
      </div>
    </CrmLayout>
  );
}
