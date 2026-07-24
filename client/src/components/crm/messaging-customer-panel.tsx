import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  User,
  Phone,
  Mail,
  MapPin,
  Building2,
  ExternalLink,
  Wrench,
  FileText,
  Receipt,
  ShieldCheck,
  CalendarClock,
  DollarSign,
  Plus,
  ClipboardList,
  Tag,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import { PanelSection, PanelRow } from "@/components/crm/panel-blocks";
import { cn } from "@/lib/utils";

/** Shape returned by GET /api/crm/messaging/conversations/:id/context */
type CustomerContext = {
  inCrm: boolean;
  phoneNumber: string | null;
  customer: {
    id: string;
    name: string;
    companyName: string | null;
    email: string | null;
    phone: string | null;
    customerType: string | null;
    customerStatus: string | null;
    fullAddress: string | null;
    tags: string[] | null;
    protectionPlanLevel: string | null;
  } | null;
  property: {
    address1: string;
    address2: string | null;
    city: string;
    state: string;
    zip: string;
  } | null;
  openWorkOrders: WorkOrderSummary[];
  recentWorkOrders: WorkOrderSummary[];
  nextAppointment: WorkOrderSummary | null;
  invoices: InvoiceSummary[];
  balanceDue: number;
  lifetimeValue: number;
  agreements: AgreementSummary[];
  openQuotesCount: number;
};

type WorkOrderSummary = {
  id: string;
  workOrderNumber: number;
  title: string | null;
  status: string;
  visitType: string | null;
  workSubtype: string | null;
  priority: string | null;
  scheduledStart: string | null;
  completedAt: string | null;
  techName: string | null;
};

type InvoiceSummary = {
  id: string;
  invoiceNumber: string;
  status: string;
  total: string | null;
  balanceDue: string | null;
  dueDate: string | null;
  createdAt: string | null;
};

type AgreementSummary = {
  id: string;
  agreementNumber: string;
  agreementPlan: string;
  status: string;
  isActive: boolean;
  nextServiceDate: string | null;
};

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

const WO_STATUS_PILLS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  dispatched: "bg-amber-100 text-amber-800",
  en_route: "bg-amber-100 text-amber-800",
  on_site: "bg-amber-100 text-amber-800",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-slate-100 text-slate-500",
};

const INVOICE_STATUS_PILLS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-500",
  sent: "bg-blue-100 text-blue-700",
  viewed: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  void: "bg-slate-100 text-slate-500",
  partial: "bg-amber-100 text-amber-800",
};

function prettify(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Customer-context rail for Messages — same grouped-card structure as the
 *  dispatch board's work-order side panel, shown when the conversation's
 *  number matches a customer in the system. */
export function MessagingCustomerPanel({
  conversationId,
  phoneNumber,
  fallbackName,
  onAddCustomer,
}: {
  conversationId: string;
  phoneNumber?: string | null;
  fallbackName?: string | null;
  onAddCustomer?: () => void;
}) {
  const { data, isLoading } = useQuery<CustomerContext>({
    queryKey: ["/api/crm/messaging/conversations", conversationId, "context"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/messaging/conversations/${conversationId}/context`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch context");
      return res.json();
    },
    enabled: !!conversationId,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3 bg-slate-50 p-3">
        <Skeleton className="h-20 w-full rounded-[4px]" />
        <Skeleton className="h-32 w-full rounded-[4px]" />
        <Skeleton className="h-28 w-full rounded-[4px]" />
      </div>
    );
  }

  // Not in CRM — offer to add
  if (!data?.inCrm || !data.customer) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-slate-50 px-6 py-12 text-center">
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-[4px] border border-slate-300/70 bg-white text-slate-400">
          <User className="h-7 w-7" />
        </span>
        <h3 className="text-sm font-semibold text-slate-900">Not in the CRM yet</h3>
        <p className="mt-1 max-w-[15rem] text-sm text-slate-500">
          {phoneNumber || fallbackName || "This contact"} isn't linked to a customer record.
        </p>
        {onAddCustomer && (
          <Button onClick={onAddCustomer} className="mt-4 bg-[#711419] hover:bg-[#8a1a1f]" size="sm">
            <UserPlus className="mr-2 h-4 w-4" />
            Add as customer
          </Button>
        )}
      </div>
    );
  }

  const c = data.customer;
  const addressText =
    c.fullAddress ||
    (data.property
      ? [data.property.address1, data.property.city, data.property.state, data.property.zip].filter(Boolean).join(", ")
      : null);

  return (
    <div className="flex h-full flex-col">
      {/* Header — mirrors the dispatch panel header: eyebrow, name, chips */}
      <div className="shrink-0 border-b border-slate-200 bg-white p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Customer</p>
        <Link href={`/crm/customers/${c.id}`}>
          <a className="group mt-0.5 flex items-center gap-1 text-base font-semibold leading-tight text-slate-900 hover:text-[#711419]">
            <span className="truncate">{c.name}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </a>
        </Link>
        {c.companyName && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
            <Building2 className="h-3 w-3" /> {c.companyName}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {c.customerType && (
            <span className="rounded-[3px] bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              {prettify(c.customerType)}
            </span>
          )}
          {c.customerStatus && (
            <span className="rounded-[3px] bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              {prettify(c.customerStatus)}
            </span>
          )}
          {c.protectionPlanLevel && (
            <span className="rounded-[3px] bg-[#711419]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#711419]">
              {prettify(c.protectionPlanLevel)} plan
            </span>
          )}
        </div>
      </div>

      {/* Grouped info cards on a grey canvas — the dispatch-panel structure */}
      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3 scrollbar-minimal">
        <PanelSection title="Contact">
          {(c.phone || phoneNumber) && (
            <PanelRow icon={Phone} label="Phone">
              <a href={`tel:${c.phone || phoneNumber}`} className="hover:text-[#711419]">
                {c.phone || phoneNumber}
              </a>
            </PanelRow>
          )}
          {c.email && (
            <PanelRow icon={Mail} label="Email">
              <a href={`mailto:${c.email}`} className="break-all hover:text-[#711419]">{c.email}</a>
            </PanelRow>
          )}
          {addressText && (
            <PanelRow icon={MapPin} label="Address">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#711419]"
              >
                {addressText}
              </a>
            </PanelRow>
          )}
          {c.tags && c.tags.length > 0 && (
            <PanelRow icon={Tag} label="Tags">
              <span className="flex flex-wrap gap-1">
                {c.tags.map((t) => (
                  <span key={t} className="rounded-[3px] border border-slate-300/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    {t}
                  </span>
                ))}
              </span>
            </PanelRow>
          )}
        </PanelSection>

        <PanelSection title="Account">
          <PanelRow icon={DollarSign} label="Balance due">
            <span className={cn("tabular-nums", data.balanceDue > 0 ? "font-semibold text-red-600" : "")}>
              {money(data.balanceDue)}
            </span>
          </PanelRow>
          <PanelRow icon={Receipt} label="Lifetime value">
            <span className="tabular-nums">{money(data.lifetimeValue)}</span>
          </PanelRow>
          <PanelRow icon={FileText} label="Open quotes">
            <span className="tabular-nums">{data.openQuotesCount}</span>
          </PanelRow>
        </PanelSection>

        {data.nextAppointment && (
          <PanelSection title="Next Appointment">
            <PanelRow icon={CalendarClock} label="Scheduled">
              {data.nextAppointment.scheduledStart
                ? format(new Date(data.nextAppointment.scheduledStart), "EEE, MMM d · h:mm a")
                : "TBD"}
            </PanelRow>
            <PanelRow icon={Wrench} label="Visit">
              {prettify(data.nextAppointment.workSubtype) || prettify(data.nextAppointment.visitType) || "Visit"}
              {data.nextAppointment.techName ? ` · ${data.nextAppointment.techName}` : ""}
            </PanelRow>
          </PanelSection>
        )}

        {data.openWorkOrders.length > 0 && (
          <PanelSection title={`Open Work Orders · ${data.openWorkOrders.length}`}>
            <div className="-my-1 divide-y divide-slate-100">
              {data.openWorkOrders.slice(0, 5).map((wo) => (
                <Link key={wo.id} href={`/crm/work-orders/${wo.id}`}>
                  <a className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {wo.title || prettify(wo.workSubtype) || `WO #${wo.workOrderNumber}`}
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        #{wo.workOrderNumber}
                        {wo.scheduledStart && ` · ${format(new Date(wo.scheduledStart), "MMM d")}`}
                        {wo.techName && ` · ${wo.techName}`}
                      </span>
                    </span>
                    <StatusDot pill={cn("shrink-0", WO_STATUS_PILLS[wo.status] || "bg-slate-100 text-slate-500")}>
                      {prettify(wo.status)}
                    </StatusDot>
                  </a>
                </Link>
              ))}
            </div>
          </PanelSection>
        )}

        {data.invoices.length > 0 && (
          <PanelSection title="Invoices">
            <div className="-my-1 divide-y divide-slate-100">
              {data.invoices.slice(0, 5).map((inv) => {
                const bal = Number(inv.balanceDue) || 0;
                return (
                  <Link key={inv.id} href={`/crm/invoices/${inv.id}`}>
                    <a className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0 hover:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">#{inv.invoiceNumber}</span>
                        <span className="block text-[11px] text-slate-400">
                          {inv.createdAt && format(new Date(inv.createdAt), "MMM d, yyyy")}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <StatusDot pill={INVOICE_STATUS_PILLS[inv.status] || "bg-slate-100 text-slate-500"}>
                          {prettify(inv.status)}
                        </StatusDot>
                        <span className={cn("text-xs tabular-nums", bal > 0 ? "font-semibold text-slate-900" : "text-slate-400")}>
                          {bal > 0 ? `${money(bal)} due` : money(Number(inv.total) || 0)}
                        </span>
                      </span>
                    </a>
                  </Link>
                );
              })}
            </div>
          </PanelSection>
        )}

        {data.agreements.length > 0 && (
          <PanelSection title="Agreements">
            <div className="-my-1 divide-y divide-slate-100">
              {data.agreements.map((ag) => (
                <Link key={ag.id} href={`/crm/agreements`}>
                  <a className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">{ag.agreementPlan}</span>
                      <span className="block text-[11px] text-slate-400">
                        {ag.nextServiceDate
                          ? `Next: ${format(new Date(ag.nextServiceDate), "MMM d, yyyy")}`
                          : `#${ag.agreementNumber}`}
                      </span>
                    </span>
                    <StatusDot pill={cn("shrink-0", ag.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500")}>
                      {prettify(ag.status)}
                    </StatusDot>
                  </a>
                </Link>
              ))}
            </div>
          </PanelSection>
        )}

        {data.openWorkOrders.length === 0 && data.invoices.length === 0 && data.agreements.length === 0 && (
          <div className="rounded-[4px] border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-400">
            No work orders, invoices, or agreements yet.
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="shrink-0 border-t border-slate-200 bg-white p-3">
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/crm/quotes/new?customerId=${c.id}`}>
            <a>
              <Button variant="outline" size="sm" className="w-full">
                <FileText className="mr-1.5 h-4 w-4" /> New quote
              </Button>
            </a>
          </Link>
          <Link href={`/crm/invoices/new?customerId=${c.id}`}>
            <a>
              <Button variant="outline" size="sm" className="w-full">
                <Plus className="mr-1.5 h-4 w-4" /> New invoice
              </Button>
            </a>
          </Link>
        </div>
        <Link href={`/crm/customers/${c.id}`}>
          <a>
            <Button variant="ghost" size="sm" className="mt-2 w-full">
              <ClipboardList className="mr-1.5 h-4 w-4" /> View full profile
            </Button>
          </a>
        </Link>
      </div>
    </div>
  );
}
