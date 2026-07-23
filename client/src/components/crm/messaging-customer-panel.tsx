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
  Star,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

const woStatusVariant: Record<string, "default" | "secondary" | "success" | "warning" | "info" | "muted"> = {
  scheduled: "info",
  dispatched: "warning",
  en_route: "warning",
  on_site: "warning",
  completed: "success",
  cancelled: "muted",
};

const invoiceStatusVariant: Record<string, "default" | "secondary" | "success" | "warning" | "info" | "muted" | "destructive"> = {
  draft: "muted",
  sent: "info",
  viewed: "info",
  paid: "success",
  void: "muted",
  partial: "warning",
};

function prettify(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Small labeled section heading with an icon. */
function SectionLabel({ icon: Icon, children, action }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {children}
      </div>
      {action}
    </div>
  );
}

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
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  // Not in CRM — offer to add
  if (!data?.inCrm || !data.customer) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <User className="h-7 w-7" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">Not in the CRM yet</h3>
        <p className="mt-1 max-w-[15rem] text-sm text-muted-foreground">
          {phoneNumber || fallbackName || "This contact"} isn't linked to a customer record.
        </p>
        {onAddCustomer && (
          <Button onClick={onAddCustomer} className="mt-4" size="sm">
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
      {/* Identity */}
      <div className="border-b border-border p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <Link href={`/crm/customers/${c.id}`}>
              <a className="group flex items-center gap-1 font-semibold text-foreground hover:text-primary">
                <span className="truncate">{c.name}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            </Link>
            {c.companyName && (
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <Building2 className="h-3 w-3" /> {c.companyName}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {c.customerType && <Badge variant="muted" className="capitalize">{c.customerType}</Badge>}
              {c.customerStatus && <Badge variant="secondary" className="capitalize">{c.customerStatus}</Badge>}
              {c.protectionPlanLevel && (
                <Badge variant="warning" className="capitalize">
                  <Star className="mr-1 h-3 w-3" /> {c.protectionPlanLevel}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Contact rows */}
        <div className="mt-3 space-y-1">
          {(c.phone || phoneNumber) && (
            <a
              href={`tel:${c.phone || phoneNumber}`}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-foreground hover:bg-muted"
            >
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate">{c.phone || phoneNumber}</span>
            </a>
          )}
          {c.email && (
            <a
              href={`mailto:${c.email}`}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-foreground hover:bg-muted"
            >
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate">{c.email}</span>
            </a>
          )}
          {addressText && (
            <div className="flex items-start gap-2 px-1.5 py-1 text-sm text-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>{addressText}</span>
            </div>
          )}
          {c.tags && c.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 px-1.5 pt-1">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              {c.tags.map((t) => (
                <Badge key={t} variant="outline" className="text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <StatTile
            label="Balance"
            value={money(data.balanceDue)}
            icon={DollarSign}
            tone={data.balanceDue > 0 ? "danger" : "neutral"}
          />
          <StatTile label="Lifetime" value={money(data.lifetimeValue)} icon={Receipt} tone="neutral" />
          <StatTile label="Open WOs" value={String(data.openWorkOrders.length)} icon={Wrench} tone="neutral" />
        </div>

        {/* Next appointment */}
        {data.nextAppointment && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
              <CalendarClock className="h-3.5 w-3.5" /> Next appointment
            </div>
            <p className="mt-1.5 text-sm font-medium text-foreground">
              {prettify(data.nextAppointment.workSubtype) || prettify(data.nextAppointment.visitType) || "Visit"}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.nextAppointment.scheduledStart &&
                format(new Date(data.nextAppointment.scheduledStart), "EEE, MMM d · h:mm a")}
              {data.nextAppointment.techName && ` · ${data.nextAppointment.techName}`}
            </p>
          </div>
        )}

        {/* Open work orders */}
        {data.openWorkOrders.length > 0 && (
          <div className="space-y-2">
            <SectionLabel icon={Wrench}>Open work orders</SectionLabel>
            <div className="space-y-1.5">
              {data.openWorkOrders.slice(0, 5).map((wo) => (
                <Link key={wo.id} href={`/crm/work-orders/${wo.id}`}>
                  <a className="block rounded-lg border border-border bg-card p-2.5 transition-colors hover:border-primary/40 hover:bg-muted/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {wo.title || prettify(wo.workSubtype) || `WO #${wo.workOrderNumber}`}
                      </span>
                      <Badge variant={woStatusVariant[wo.status] || "muted"} className="shrink-0 capitalize">
                        {prettify(wo.status)}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      #{wo.workOrderNumber}
                      {wo.scheduledStart && ` · ${format(new Date(wo.scheduledStart), "MMM d")}`}
                      {wo.techName && ` · ${wo.techName}`}
                    </p>
                  </a>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Invoices */}
        {data.invoices.length > 0 && (
          <div className="space-y-2">
            <SectionLabel icon={Receipt}>Invoices</SectionLabel>
            <div className="space-y-1.5">
              {data.invoices.slice(0, 5).map((inv) => {
                const bal = Number(inv.balanceDue) || 0;
                return (
                  <Link key={inv.id} href={`/crm/invoices/${inv.id}`}>
                    <a className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2.5 transition-colors hover:border-primary/40 hover:bg-muted/50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">#{inv.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {inv.createdAt && format(new Date(inv.createdAt), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <Badge variant={invoiceStatusVariant[inv.status] || "muted"} className="capitalize">
                          {prettify(inv.status)}
                        </Badge>
                        <span className={cn("text-xs tabular-nums", bal > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                          {bal > 0 ? `${money(bal)} due` : money(Number(inv.total) || 0)}
                        </span>
                      </div>
                    </a>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Agreements */}
        {data.agreements.length > 0 && (
          <div className="space-y-2">
            <SectionLabel icon={ShieldCheck}>Agreements</SectionLabel>
            <div className="space-y-1.5">
              {data.agreements.map((ag) => (
                <Link key={ag.id} href={`/crm/agreements`}>
                  <a className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2.5 transition-colors hover:border-primary/40 hover:bg-muted/50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{ag.agreementPlan}</p>
                      <p className="text-xs text-muted-foreground">
                        {ag.nextServiceDate ? `Next: ${format(new Date(ag.nextServiceDate), "MMM d, yyyy")}` : `#${ag.agreementNumber}`}
                      </p>
                    </div>
                    <Badge variant={ag.isActive ? "success" : "muted"} className="capitalize">
                      {prettify(ag.status)}
                    </Badge>
                  </a>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Empty hint when no activity */}
        {data.openWorkOrders.length === 0 && data.invoices.length === 0 && data.agreements.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No work orders, invoices, or agreements yet.
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="border-t border-border p-3">
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

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "danger" | "neutral";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className={cn("mt-1 truncate text-base font-semibold tabular-nums", tone === "danger" ? "text-destructive" : "text-foreground")}>
        {value}
      </p>
    </div>
  );
}
