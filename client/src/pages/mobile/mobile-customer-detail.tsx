import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import MobileShell from "./mobile-shell";
import type { CrmCustomer, CrmWorkOrder, CrmAgreement } from "@shared/schema";

interface WorkOrderWithDetails extends CrmWorkOrder {
  property?: { address1?: string; city?: string } | null;
}

function DetailSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="h-12 w-12 rounded-[4px]" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="rounded-[4px] border border-slate-300/70 bg-white p-4 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-5 w-52" />
      </div>
      <div className="rounded-[4px] border border-slate-300/70 bg-white p-4 space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center" data-testid="error-state">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[4px] border border-red-200 bg-red-50">
        <AlertCircle className="h-6 w-6 text-red-600" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-1">Failed to load customer</h3>
      <p className="text-sm text-slate-500 mb-4">
        There was an error loading the customer details.
      </p>
      <Button
        onClick={onRetry}
        className="rounded-[4px] bg-[#711419] text-white hover:bg-[#8a1a1f]"
        data-testid="retry-button"
      >
        Try Again
      </Button>
    </div>
  );
}

function WorkOrderItem({ workOrder }: { workOrder: WorkOrderWithDetails }) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    scheduled: { label: "Scheduled", className: "bg-slate-100 text-slate-600" },
    dispatched: { label: "Dispatched", className: "bg-blue-100 text-blue-700" },
    en_route: { label: "Traveling", className: "bg-amber-100 text-amber-700" },
    on_site: { label: "Working", className: "bg-green-100 text-green-700" },
    completed: { label: "Completed", className: "bg-slate-100 text-slate-500" },
    cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700" },
  };

  const status = statusConfig[workOrder.status] || statusConfig.scheduled;

  return (
    <Link href={`/mobile/job/${workOrder.id}`}>
      <div
        className="flex min-h-[56px] items-center justify-between px-3.5 py-3 active:bg-slate-50"
        data-testid={`work-order-${workOrder.id}`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Wrench className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 truncate">
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
          <span className={`rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.className}`}>
            {status.label}
          </span>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </div>
      </div>
    </Link>
  );
}

function AgreementItem({ agreement }: { agreement: CrmAgreement }) {
  return (
    <div
      className="flex min-h-[56px] items-center justify-between px-3.5 py-3"
      data-testid={`agreement-${agreement.id}`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {agreement.agreementType || "Service Agreement"}
          </p>
          {agreement.endDate && (
            <p className="text-xs text-slate-500">
              Expires: {format(new Date(agreement.endDate), "MMM d, yyyy")}
            </p>
          )}
        </div>
      </div>
      <span className="rounded-[3px] bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">
        Active
      </span>
    </div>
  );
}

export default function MobileCustomerDetail() {
  const [, navigate] = useLocation();
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
    residential: { label: "Residential", className: "bg-slate-100 text-slate-600" },
    commercial: { label: "Commercial", className: "bg-slate-100 text-slate-600" },
  };

  const customerStatusConfig = {
    prospect: { label: "Lead", className: "bg-amber-100 text-amber-700" },
    customer: { label: "Customer", className: "bg-green-100 text-green-700" },
  };

  return (
    <MobileShell>
      <div
        className="min-h-full"
        data-testid="mobile-customer-detail-page"
        style={{ touchAction: "pan-y" }}
        onPointerDown={(e) => {
          const el = e.currentTarget as any;
          if (!el._mountedAt) el._mountedAt = Date.now();
          // Edge swipe only, and never within the first beat after opening —
          // the tap that navigated here must not double as an exit gesture.
          if (e.clientX > 48 || Date.now() - el._mountedAt < 500) { el._swipe = null; return; }
          el._swipe = { x: e.clientX, y: e.clientY, engaged: false };
          el.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const el = e.currentTarget as any;
          const st = el._swipe;
          if (!st) return;
          const dx = e.clientX - st.x;
          const dy = Math.abs(e.clientY - st.y);
          if (!st.engaged) {
            if (dx > 8 && dx > dy) {
              st.engaged = true;
              el.style.transition = "none";
            } else if (dy > 14) { el._swipe = null; return; }
          }
          if (st.engaged) el.style.transform = `translateX(${Math.max(0, dx)}px)`;
        }}
        onPointerUp={(e) => {
          const el = e.currentTarget as any;
          const st = el._swipe;
          el._swipe = null;
          if (!st?.engaged) return;
          const dx = e.clientX - st.x;
          if (dx > Math.min(140, window.innerWidth * 0.33)) {
            // Slide off from wherever the finger left it, then leave
            const w = el.clientWidth || window.innerWidth;
            const startP = Math.max(0, Math.min(1, dx / w));
            const dur = 200 * (1 - startP) + 40;
            el.style.transition = `transform ${dur}ms ease-in`;
            el.style.transform = "translateX(100%)";
            setTimeout(() => navigate("/mobile/customers"), dur - 10);
          } else {
            el.style.transition = "transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1)";
            el.style.transform = "translateX(0)";
            setTimeout(() => { el.style.transition = ""; }, 290);
          }
        }}
        onPointerCancel={(e) => { (e.currentTarget as any)._swipe = null; }}
      >
        {/* Floating back — no header bar */}
        <button
          onClick={() => navigate("/mobile/customers")}
          className="liquid-glass fixed left-3 z-30 flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition-transform active:scale-95"
          style={{ top: "calc(env(safe-area-inset-top) + 2px)" }}
          data-testid="back-button"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {customerLoading ? (
          <DetailSkeleton />
        ) : customerError ? (
          <ErrorState onRetry={() => refetchCustomer()} />
        ) : customer ? (
          <div className="p-4 space-y-4">
            <div className="mb-4 pt-10">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900" data-testid="customer-name">
                {customer.name}
              </h2>
              {(customer.leadSource || customer.createdAt) && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {[customer.leadSource ? `via ${customer.leadSource}` : null, customer.createdAt ? `customer since ${new Date(customer.createdAt).getFullYear()}` : null].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            {/* At a glance — real numbers, not labels */}
            <div className="grid grid-cols-3 gap-2" data-testid="customer-stats">
              <div className="rounded-[4px] border border-slate-300/70 bg-white px-3 py-2.5">
                <p className="text-lg font-bold tabular-nums text-slate-900">{workOrders?.length ?? 0}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Jobs</p>
              </div>
              <div className="rounded-[4px] border border-slate-300/70 bg-white px-3 py-2.5">
                <p className="text-lg font-bold tabular-nums text-slate-900">
                  {workOrders?.filter((w) => w.status !== "completed" && w.status !== "cancelled").length ?? 0}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Open</p>
              </div>
              <div className="rounded-[4px] border border-slate-300/70 bg-white px-3 py-2.5">
                <p className="text-lg font-bold tabular-nums text-slate-900">{agreements?.length ?? 0}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Agreements</p>
              </div>
            </div>

            {workOrders && workOrders.length > 0 && (() => {
              const last = [...workOrders].sort((a, b) => new Date(b.scheduledStart || 0).getTime() - new Date(a.scheduledStart || 0).getTime())[0];
              return last?.scheduledStart ? (
                <p className="text-xs text-slate-500" data-testid="last-visit-line">
                  Last visit: {new Date(last.scheduledStart).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  {last.title ? ` — ${last.title}` : ""}
                </p>
              ) : null;
            })()}

            <div className="rounded-[4px] border border-slate-300/70 bg-white" data-testid="contact-card">
              <div className="border-b border-slate-200 px-3.5 py-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contact Information</h3>
              </div>
              <div className="divide-y divide-slate-200 px-3.5">
                {customer.phone && (
                  <a
                    href={`tel:${customer.phone}`}
                    className="flex min-h-[44px] items-center gap-3 py-2.5 text-sm font-medium text-[#711419] active:opacity-80"
                    data-testid="customer-phone"
                  >
                    <Phone className="h-4 w-4 flex-shrink-0" />
                    <span>{customer.phone}</span>
                  </a>
                )}
                {customer.email && (
                  <a
                    href={`mailto:${customer.email}`}
                    className="flex min-h-[44px] items-center gap-3 py-2.5 text-sm font-medium text-[#711419] active:opacity-80"
                    data-testid="customer-email"
                  >
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{customer.email}</span>
                  </a>
                )}
                {customer.fullAddress && (
                  <div className="flex min-h-[44px] items-start gap-3 py-2.5 text-sm text-slate-600">
                    <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                    <span data-testid="customer-address">{customer.fullAddress}</span>
                  </div>
                )}
                {!customer.phone && !customer.email && !customer.fullAddress && (
                  <p className="py-3 text-sm text-slate-400">No contact information available</p>
                )}
              </div>
            </div>

            {workOrders && workOrders.length > 0 && (
              <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="work-orders-card">
                <div className="flex items-center gap-2 border-b border-slate-200 px-3.5 py-2.5">
                  <Wrench className="h-3.5 w-3.5 text-slate-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recent Work Orders</h3>
                </div>
                <div className="divide-y divide-slate-200">
                  {workOrders.map((wo) => (
                    <WorkOrderItem key={wo.id} workOrder={wo} />
                  ))}
                </div>
              </div>
            )}

            {agreements && agreements.length > 0 && (
              <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="agreements-card">
                <div className="flex items-center gap-2 border-b border-slate-200 px-3.5 py-2.5">
                  <FileText className="h-3.5 w-3.5 text-slate-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Agreements</h3>
                </div>
                <div className="divide-y divide-slate-200">
                  {agreements.map((agreement) => (
                    <AgreementItem key={agreement.id} agreement={agreement} />
                  ))}
                </div>
              </div>
            )}

            {(!workOrders || workOrders.length === 0) && (!agreements || agreements.length === 0) && (
              <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-8 text-center" data-testid="no-history-card">
                <p className="text-sm text-slate-500">No work orders or agreements found</p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </MobileShell>
  );
}
