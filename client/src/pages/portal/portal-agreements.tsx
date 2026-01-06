import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ClipboardCheck, Calendar, RefreshCw, CheckCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { PortalLayout } from "./portal-layout";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";

interface MaintenanceVisit {
  id: string;
  visitNumber: number;
  cycleYear: number;
  targetDate: string;
  completedAt: string | null;
  status: "pending" | "scheduled" | "completed" | "cancelled";
}

interface PortalAgreement {
  id: string;
  agreementNumber: string;
  agreementPlan: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  price: string;
  frequency: string;
  visitsPerPeriod: number;
  nextServiceDate: string | null;
  visits: MaintenanceVisit[];
  completedVisits: number;
  totalVisits: number;
  remainingVisits: number;
}

interface AgreementsResponse {
  agreements: PortalAgreement[];
}

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-100 text-green-700 border-green-200" },
  pending: { label: "Pending", className: "bg-amber-100 text-amber-700 border-amber-200" },
  expired: { label: "Expired", className: "bg-slate-100 text-slate-700 border-slate-200" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700 border-red-200" },
};

const visitStatusConfig: Record<string, { label: string; className: string }> = {
  completed: { label: "Completed", className: "bg-green-100 text-green-700" },
  scheduled: { label: "Scheduled", className: "bg-blue-100 text-blue-700" },
  pending: { label: "Pending", className: "bg-amber-100 text-amber-700" },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-500" },
};

export default function PortalAgreements() {
  const [, setLocation] = useLocation();
  const [expandedAgreements, setExpandedAgreements] = useState<Set<string>>(new Set());

  const { data: customer, error: customerError } = useQuery<{ id: string; name: string }>({
    queryKey: ["/api/portal/auth/me"],
    retry: false,
  });

  const { data: agreementsData, isLoading } = useQuery<AgreementsResponse>({
    queryKey: ["/api/portal/agreements"],
    enabled: !!customer,
    retry: false,
  });

  const agreements = agreementsData?.agreements || [];

  useEffect(() => {
    if (customerError) {
      setLocation("/portal/login");
    }
  }, [customerError, setLocation]);

  const toggleAgreement = (id: string) => {
    setExpandedAgreements(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(parseFloat(amount || "0"));
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatFrequency = (frequency: string) => {
    const labels: Record<string, string> = {
      weekly: "Weekly",
      monthly: "Monthly",
      annual: "Annual",
    };
    return labels[frequency] || frequency;
  };

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/portal/dashboard">
            <Button variant="ghost" size="sm" className="text-slate-600" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900" data-testid="text-page-title">
            Your Maintenance Agreements
          </h1>
          <p className="text-slate-500 mt-1">View your active service agreements and coverage</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : agreements.length === 0 ? (
          <Card className="shadow-sm" data-testid="status-no-agreements">
            <CardContent className="py-12 text-center">
              <ClipboardCheck className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No maintenance agreements found</p>
              <p className="text-sm text-slate-400 mt-2">Contact us to set up a maintenance plan for your HVAC system</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {agreements.map((agreement) => {
              const status = statusConfig[agreement.status] || statusConfig.pending;
              const isExpanded = expandedAgreements.has(agreement.id);
              const progressPercent = agreement.totalVisits > 0 
                ? (agreement.completedVisits / agreement.totalVisits) * 100 
                : 0;
              
              return (
                <Card key={agreement.id} className="shadow-sm hover:shadow-md transition-shadow" data-testid={`card-agreement-${agreement.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-lg">
                          <ClipboardCheck className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <CardTitle className="text-lg font-semibold" data-testid={`text-agreement-plan-${agreement.id}`}>
                            {agreement.agreementPlan}
                          </CardTitle>
                          <p className="text-sm text-slate-500" data-testid={`text-agreement-number-${agreement.id}`}>
                            {agreement.agreementNumber}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className={status.className} data-testid={`badge-agreement-status-${agreement.id}`}>
                        {status.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500 mb-1">Billing</p>
                        <p className="font-medium flex items-center gap-1" data-testid={`text-agreement-price-${agreement.id}`}>
                          <RefreshCw className="h-3 w-3" />
                          {formatCurrency(agreement.price)}/{formatFrequency(agreement.frequency).toLowerCase()}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 mb-1">Visits Included</p>
                        <p className="font-medium" data-testid={`text-agreement-visits-${agreement.id}`}>
                          {agreement.visitsPerPeriod} per {formatFrequency(agreement.frequency).toLowerCase()}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 mb-1">Coverage Period</p>
                        <p className="font-medium flex items-center gap-1" data-testid={`text-agreement-period-${agreement.id}`}>
                          <Calendar className="h-3 w-3" />
                          {formatDate(agreement.startDate)} - {formatDate(agreement.endDate)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 mb-1">Next Service</p>
                        <p className="font-medium" data-testid={`text-agreement-next-service-${agreement.id}`}>
                          {agreement.nextServiceDate ? formatDate(agreement.nextServiceDate) : "Not scheduled"}
                        </p>
                      </div>
                    </div>

                    {/* Visit Tracking Summary */}
                    {agreement.totalVisits > 0 && (
                      <div className="pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="font-medium text-sm" data-testid={`text-completed-visits-${agreement.id}`}>
                              {agreement.completedVisits} of {agreement.totalVisits} visits completed
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Clock className="h-4 w-4" />
                            <span data-testid={`text-remaining-visits-${agreement.id}`}>
                              {agreement.remainingVisits} remaining
                            </span>
                          </div>
                        </div>
                        <Progress value={progressPercent} className="h-2" />
                      </div>
                    )}

                    {/* Expandable Visit History */}
                    {agreement.visits.length > 0 && (
                      <Collapsible open={isExpanded} onOpenChange={() => toggleAgreement(agreement.id)}>
                        <CollapsibleTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="w-full justify-between text-slate-600 hover:bg-slate-50"
                            data-testid={`button-toggle-visits-${agreement.id}`}
                          >
                            <span>View Visit History</span>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-2">
                          <div className="space-y-2 bg-slate-50 rounded-lg p-3">
                            {agreement.visits.map((visit) => {
                              const visitStatus = visitStatusConfig[visit.status] || visitStatusConfig.pending;
                              return (
                                <div 
                                  key={visit.id} 
                                  className="flex items-center justify-between bg-white p-3 rounded-md border border-slate-100"
                                  data-testid={`visit-row-${visit.id}`}
                                >
                                  <div className="flex items-center gap-3">
                                    {visit.status === "completed" ? (
                                      <CheckCircle className="h-4 w-4 text-green-600" />
                                    ) : (
                                      <Clock className="h-4 w-4 text-slate-400" />
                                    )}
                                    <div>
                                      <p className="font-medium text-sm" data-testid={`text-visit-number-${visit.id}`}>
                                        Visit #{visit.visitNumber}
                                      </p>
                                      <p className="text-xs text-slate-500">
                                        {visit.status === "completed" && visit.completedAt
                                          ? `Completed ${formatDate(visit.completedAt)}`
                                          : `Scheduled for ${formatDate(visit.targetDate)}`}
                                      </p>
                                    </div>
                                  </div>
                                  <Badge variant="secondary" className={`text-xs ${visitStatus.className}`}>
                                    {visitStatus.label}
                                  </Badge>
                                </div>
                              );
                            })}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
