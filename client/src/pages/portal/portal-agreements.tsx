import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ClipboardCheck, Calendar, RefreshCw } from "lucide-react";
import { PortalLayout } from "./portal-layout";

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

export default function PortalAgreements() {
  const [, setLocation] = useLocation();

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
                  <CardContent>
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
