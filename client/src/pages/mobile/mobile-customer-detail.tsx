import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { 
  ArrowLeft, 
  Phone, 
  Mail, 
  MapPin, 
  Wrench, 
  FileText, 
  ChevronRight,
  AlertCircle,
  User
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import MobileShell from "./mobile-shell";
import type { CrmCustomer, CrmWorkOrder, CrmAgreement } from "@shared/schema";

const BRAND_COLOR = "#711419";

interface WorkOrderWithDetails extends CrmWorkOrder {
  property?: { address1?: string; city?: string } | null;
}

function DetailSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Card>
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-5 w-52" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center" data-testid="error-state">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: "#fee2e2" }}
      >
        <AlertCircle className="h-8 w-8 text-red-600" />
      </div>
      <h3 className="text-lg font-medium text-slate-800 mb-1">Failed to load customer</h3>
      <p className="text-sm text-slate-500 mb-4">
        There was an error loading the customer details.
      </p>
      <Button
        onClick={onRetry}
        style={{ backgroundColor: BRAND_COLOR }}
        className="hover:opacity-90"
        data-testid="retry-button"
      >
        Try Again
      </Button>
    </div>
  );
}

function WorkOrderItem({ workOrder }: { workOrder: WorkOrderWithDetails }) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    scheduled: { label: "Scheduled", className: "bg-slate-100 text-slate-700" },
    dispatched: { label: "Dispatched", className: "bg-blue-100 text-blue-700" },
    en_route: { label: "Traveling", className: "bg-yellow-100 text-yellow-700" },
    on_site: { label: "Working", className: "bg-green-100 text-green-700" },
    completed: { label: "Completed", className: "bg-slate-200 text-slate-600" },
    cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700" },
  };

  const status = statusConfig[workOrder.status] || statusConfig.scheduled;

  return (
    <Link href={`/mobile/job/${workOrder.id}`}>
      <div
        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg active:bg-slate-100 min-h-[56px]"
        data-testid={`work-order-${workOrder.id}`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Wrench className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800 truncate">
              {workOrder.title || `WO #${workOrder.id.slice(0, 8)}`}
            </p>
            {workOrder.scheduledStart && (
              <p className="text-xs text-slate-500">
                {format(new Date(workOrder.scheduledStart), "MMM d, yyyy")}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant="outline" className={`text-xs ${status.className}`}>
            {status.label}
          </Badge>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </div>
      </div>
    </Link>
  );
}

function AgreementItem({ agreement }: { agreement: CrmAgreement }) {
  return (
    <div
      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg min-h-[56px]"
      data-testid={`agreement-${agreement.id}`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-800 truncate">
            {agreement.agreementType || "Service Agreement"}
          </p>
          {agreement.endDate && (
            <p className="text-xs text-slate-500">
              Expires: {format(new Date(agreement.endDate), "MMM d, yyyy")}
            </p>
          )}
        </div>
      </div>
      <Badge variant="outline" className="bg-green-100 text-green-700 text-xs">
        Active
      </Badge>
    </div>
  );
}

export default function MobileCustomerDetail() {
  const { id } = useParams<{ id: string }>();

  const {
    data: customer,
    isLoading: customerLoading,
    error: customerError,
    refetch: refetchCustomer,
  } = useQuery<CrmCustomer>({
    queryKey: ["/api/crm/customers", id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch customer");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: workOrders } = useQuery<WorkOrderWithDetails[]>({
    queryKey: ["/api/crm/customers", id, "jobs"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${id}/jobs?limit=5`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id && !!customer,
  });

  const { data: agreements } = useQuery<CrmAgreement[]>({
    queryKey: ["/api/crm/customers", id, "active-agreements"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${id}/active-agreements`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id && !!customer,
  });

  const customerTypeConfig = {
    residential: { label: "Residential", className: "bg-blue-100 text-blue-700 border-blue-300" },
    commercial: { label: "Commercial", className: "bg-purple-100 text-purple-700 border-purple-300" },
  };

  const customerStatusConfig = {
    prospect: { label: "Prospect", className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
    client: { label: "Client", className: "bg-green-100 text-green-700 border-green-300" },
  };

  return (
    <MobileShell>
      <div className="min-h-full" data-testid="mobile-customer-detail-page">
        <div
          className="px-4 py-3 flex items-center gap-3"
          style={{ backgroundColor: BRAND_COLOR }}
        >
          <Link href="/mobile/customers">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10 h-10 w-10"
              data-testid="back-button"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold text-white" data-testid="header-title">
            Customer Details
          </h1>
        </div>

        {customerLoading ? (
          <DetailSkeleton />
        ) : customerError ? (
          <ErrorState onRetry={() => refetchCustomer()} />
        ) : customer ? (
          <div className="p-4 space-y-4">
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${BRAND_COLOR}15` }}
              >
                <User className="h-6 w-6" style={{ color: BRAND_COLOR }} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-slate-800 truncate" data-testid="customer-name">
                  {customer.name}
                </h2>
                <div className="flex flex-wrap gap-2 mt-1">
                  <Badge
                    variant="outline"
                    className={`text-xs ${customerTypeConfig[customer.customerType as keyof typeof customerTypeConfig]?.className || customerTypeConfig.residential.className}`}
                    data-testid="customer-type-badge"
                  >
                    {customerTypeConfig[customer.customerType as keyof typeof customerTypeConfig]?.label || "Residential"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs ${customerStatusConfig[customer.customerStatus as keyof typeof customerStatusConfig]?.className || customerStatusConfig.client.className}`}
                    data-testid="customer-status-badge"
                  >
                    {customerStatusConfig[customer.customerStatus as keyof typeof customerStatusConfig]?.label || "Client"}
                  </Badge>
                </div>
              </div>
            </div>

            <Card data-testid="contact-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {customer.phone && (
                  <a
                    href={`tel:${customer.phone}`}
                    className="flex items-center gap-3 text-blue-600 hover:underline min-h-[44px]"
                    data-testid="customer-phone"
                  >
                    <Phone className="h-5 w-5 flex-shrink-0" />
                    <span>{customer.phone}</span>
                  </a>
                )}
                {customer.email && (
                  <a
                    href={`mailto:${customer.email}`}
                    className="flex items-center gap-3 text-blue-600 hover:underline min-h-[44px]"
                    data-testid="customer-email"
                  >
                    <Mail className="h-5 w-5 flex-shrink-0" />
                    <span className="truncate">{customer.email}</span>
                  </a>
                )}
                {customer.fullAddress && (
                  <div className="flex items-start gap-3 text-slate-600 min-h-[44px]">
                    <MapPin className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <span data-testid="customer-address">{customer.fullAddress}</span>
                  </div>
                )}
                {!customer.phone && !customer.email && !customer.fullAddress && (
                  <p className="text-sm text-slate-400 italic">No contact information available</p>
                )}
              </CardContent>
            </Card>

            {workOrders && workOrders.length > 0 && (
              <Card data-testid="work-orders-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    Recent Work Orders
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {workOrders.map((wo) => (
                    <WorkOrderItem key={wo.id} workOrder={wo} />
                  ))}
                </CardContent>
              </Card>
            )}

            {agreements && agreements.length > 0 && (
              <Card data-testid="agreements-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Active Agreements
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {agreements.map((agreement) => (
                    <AgreementItem key={agreement.id} agreement={agreement} />
                  ))}
                </CardContent>
              </Card>
            )}

            {(!workOrders || workOrders.length === 0) && (!agreements || agreements.length === 0) && (
              <Card data-testid="no-history-card">
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-slate-500">No work orders or agreements found</p>
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}
      </div>
    </MobileShell>
  );
}
