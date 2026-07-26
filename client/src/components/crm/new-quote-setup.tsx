import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Calculator,
  Check,
  FileText,
  FolderKanban,
  Loader2,
  MapPin,
  Search,
  Target,
  Zap,
} from "lucide-react";

/** New Quote setup stepper — collects everything ONCE before any builder
 *  opens: quote kind, customer, property, an optional link (open lead, work
 *  order, or project), and the salesperson. The chosen builder then starts
 *  with all of it prefilled and its own redundant questions hidden. */

type QuoteKind = "quick" | "proposal" | "worksheet";

const KINDS: Array<{ value: QuoteKind; label: string; description: string; icon: typeof Zap }> = [
  { value: "proposal", label: "Proposal Builder", description: "Full system proposal from the pricebook", icon: FileText },
  { value: "worksheet", label: "Custom Pricing", description: "Install worksheet with labor, materials, and margins", icon: Calculator },
  { value: "quick", label: "Quick Quote", description: "Simple quote with line items", icon: Zap },
];

type StepKey = "type" | "customer" | "property" | "link" | "assignee";
const STEP_ORDER: StepKey[] = ["type", "customer", "property", "link", "assignee"];
const STEP_LABELS: Record<StepKey, string> = {
  type: "Quote type",
  customer: "Customer",
  property: "Property",
  link: "Link to",
  assignee: "Salesperson",
};

type CustomerLite = {
  id: string;
  name: string;
  phone?: string | null;
  fullAddress?: string | null;
  salesStage?: string | null;
};

export function NewQuoteSetup({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<StepKey>("type");
  const [kind, setKind] = useState<QuoteKind | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [link, setLink] = useState<{ type: "none" | "lead" | "work_order" | "project"; id?: string }>({ type: "none" });
  const [assigneeId, setAssigneeId] = useState<string | null>(null);

  // Fresh dialog every open
  useEffect(() => {
    if (open) {
      setStep("type");
      setKind(null);
      setCustomerSearch("");
      setCustomer(null);
      setPropertyId(null);
      setLink({ type: "none" });
      setAssigneeId(null);
    }
  }, [open]);

  const { data: customerResults = [], isFetching: searching } = useQuery<CustomerLite[]>({
    queryKey: ["/api/crm/customers", "quote-setup", customerSearch],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers?search=${encodeURIComponent(customerSearch.trim())}&limit=8`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.customers || []).map((c: any) => ({
        id: c.id, name: c.name, phone: c.phone, fullAddress: c.fullAddress, salesStage: c.salesStage,
      }));
    },
    enabled: open && step === "customer" && customerSearch.trim().length >= 2,
  });

  const { data: properties = [], isLoading: propertiesLoading } = useQuery<Array<{ id: string; address1: string | null; city: string | null; nickname?: string | null }>>({
    queryKey: ["/api/crm/customers", customer?.id, "properties", "quote-setup"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${customer!.id}/properties`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && !!customer,
  });

  // Auto-pick the only property
  useEffect(() => {
    if (properties.length === 1) setPropertyId(properties[0].id);
  }, [properties]);

  const { data: workOrdersData } = useQuery<{ workOrders: Array<{ id: string; title: string | null; status: string; scheduledStart: string | null }> }>({
    queryKey: ["/api/crm/work-orders", "quote-setup", customer?.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders?customerId=${customer!.id}&limit=10`, { credentials: "include" });
      if (!res.ok) return { workOrders: [] };
      return res.json();
    },
    enabled: open && !!customer && step === "link",
  });

  const { data: projectsData } = useQuery<any>({
    queryKey: ["/api/crm/projects", "quote-setup", customer?.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects?customerId=${customer!.id}&limit=10`, { credentials: "include" });
      if (!res.ok) return { projects: [] };
      return res.json();
    },
    enabled: open && !!customer && step === "link",
  });

  const { data: salesUsers = [], isLoading: usersLoading } = useQuery<Array<{ id: string; displayName: string; role: string }>>({
    queryKey: ["/api/crm/users/by-role", "sales", "quote-setup"],
    queryFn: async () => {
      const res = await fetch("/api/crm/users/by-role?exactRole=sales", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && step === "assignee",
  });

  const workOrders = workOrdersData?.workOrders || [];
  const projects: Array<{ id: string; title: string | null; status: string }> = projectsData?.projects || (Array.isArray(projectsData) ? projectsData : []);
  const hasOpenLead = !!customer?.salesStage && !["won", "lost"].includes(customer.salesStage);
  const nothingToLink = workOrders.length === 0 && projects.length === 0 && !hasOpenLead;

  const stepIndex = STEP_ORDER.indexOf(step);
  const goNext = () => setStep(STEP_ORDER[Math.min(stepIndex + 1, STEP_ORDER.length - 1)]);
  const goBack = () => setStep(STEP_ORDER[Math.max(stepIndex - 1, 0)]);

  const canContinue =
    step === "type" ? !!kind :
    step === "customer" ? !!customer :
    step === "property" ? true :
    step === "link" ? true :
    !!assigneeId;

  const launch = () => {
    if (!kind || !customer || !assigneeId) return;
    const params = new URLSearchParams({ setup: "1", assignedToId: assigneeId });
    if (propertyId) params.set("propertyId", propertyId);
    if (link.type === "work_order" && link.id) params.set("workOrderId", link.id);
    if (link.type === "project" && link.id) params.set("projectId", link.id);
    if (link.type === "lead") params.set("sourceType", "lead");

    onOpenChange(false);
    if (kind === "proposal") {
      navigate(`/crm/quotes/proposal/${customer.id}?${params.toString()}`);
    } else if (kind === "worksheet") {
      params.set("customerId", customer.id);
      navigate(`/crm/quotes/install-worksheet/new?${params.toString()}`);
    } else {
      params.set("customerId", customer.id);
      params.set("quoteType", "quick");
      navigate(`/crm/quotes/new?${params.toString()}`);
    }
  };

  const kindLabel = useMemo(() => KINDS.find((k) => k.value === kind)?.label || "", [kind]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Quote</DialogTitle>
          <DialogDescription>
            {step === "type" && "What kind of quote is this?"}
            {step === "customer" && "Who is it for?"}
            {step === "property" && `Which property${customer ? ` of ${customer.name}` : ""}?`}
            {step === "link" && "Link it to existing work? (optional)"}
            {step === "assignee" && "Who owns this quote?"}
          </DialogDescription>
        </DialogHeader>

        {/* Squared step markers */}
        <div className="flex items-center gap-1.5" data-testid="quote-setup-steps">
          {STEP_ORDER.map((s, i) => (
            <div key={s} className="flex flex-1 flex-col gap-1">
              <span
                className={cn(
                  "h-1 w-full rounded-[1px]",
                  i < stepIndex ? "bg-slate-900" : i === stepIndex ? "bg-[#711419]" : "bg-slate-200",
                )}
              />
              <span className={cn(
                "text-[9px] font-semibold uppercase tracking-wider",
                i === stepIndex ? "text-[#711419]" : "text-slate-400",
              )}>
                {STEP_LABELS[s]}
              </span>
            </div>
          ))}
        </div>

        <div className="min-h-[260px]">
          {step === "type" && (
            <div className="space-y-2">
              {KINDS.map((k) => {
                const Icon = k.icon;
                const active = kind === k.value;
                return (
                  <button
                    key={k.value}
                    onClick={() => { setKind(k.value); }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[4px] border p-3.5 text-left transition-colors",
                      active ? "border-[#711419] bg-[#711419]/[0.04]" : "border-slate-300/70 hover:border-slate-900",
                    )}
                    data-testid={`quote-setup-kind-${k.value}`}
                  >
                    <span className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-[3px]",
                      active ? "bg-[#711419] text-white" : "bg-slate-100 text-slate-600",
                    )}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{k.label}</span>
                      <span className="block text-xs text-slate-500">{k.description}</span>
                    </span>
                    {active && <Check className="h-4 w-4 shrink-0 text-[#711419]" />}
                  </button>
                );
              })}
            </div>
          )}

          {step === "customer" && (
            <div className="space-y-3">
              {customer ? (
                <div className="flex items-center justify-between rounded-[4px] border border-[#711419]/25 bg-[#711419]/[0.05] px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{customer.name}</p>
                    {customer.fullAddress && <p className="truncate text-xs text-slate-500">{customer.fullAddress}</p>}
                  </div>
                  <button onClick={() => { setCustomer(null); setPropertyId(null); setLink({ type: "none" }); }} className="text-xs font-medium text-[#711419] hover:underline">
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      autoFocus
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Search customers by name or phone..."
                      className="pl-9"
                      data-testid="quote-setup-customer-search"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {customerSearch.trim().length < 2 ? (
                      <p className="py-8 text-center text-sm text-slate-400">Type at least two characters.</p>
                    ) : searching ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
                    ) : customerResults.length === 0 ? (
                      <p className="py-8 text-center text-sm text-slate-400">No customers match.</p>
                    ) : (
                      <div className="overflow-hidden rounded-[4px] border border-slate-300/70">
                        {customerResults.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => { setCustomer(c); setPropertyId(null); setLink({ type: "none" }); }}
                            className="flex w-full items-center justify-between border-b border-slate-200/80 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50"
                            data-testid={`quote-setup-customer-${c.id}`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-slate-900">{c.name}</span>
                              {c.fullAddress && <span className="block truncate text-xs text-slate-500">{c.fullAddress}</span>}
                            </span>
                            {c.phone && <span className="shrink-0 text-xs text-slate-500">{c.phone}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {step === "property" && (
            <div className="space-y-2">
              {propertiesLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
              ) : properties.length === 0 ? (
                <p className="rounded-[4px] border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">
                  No properties on file for {customer?.name} — you can continue without one.
                </p>
              ) : (
                properties.map((p) => {
                  const active = propertyId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPropertyId(active ? null : p.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[4px] border p-3 text-left transition-colors",
                        active ? "border-[#711419] bg-[#711419]/[0.04]" : "border-slate-300/70 hover:border-slate-900",
                      )}
                      data-testid={`quote-setup-property-${p.id}`}
                    >
                      <MapPin className={cn("h-4 w-4 shrink-0", active ? "text-[#711419]" : "text-slate-400")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {p.nickname || p.address1 || "Property"}
                        </span>
                        {p.nickname && p.address1 && <span className="block truncate text-xs text-slate-500">{p.address1}{p.city ? `, ${p.city}` : ""}</span>}
                        {!p.nickname && p.city && <span className="block truncate text-xs text-slate-500">{p.city}</span>}
                      </span>
                      {active && <Check className="h-4 w-4 shrink-0 text-[#711419]" />}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {step === "link" && (
            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
              <button
                onClick={() => setLink({ type: "none" })}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[4px] border p-3 text-left text-sm font-medium transition-colors",
                  link.type === "none" ? "border-[#711419] bg-[#711419]/[0.04] text-[#711419]" : "border-slate-300/70 text-slate-700 hover:border-slate-900",
                )}
                data-testid="quote-setup-link-none"
              >
                Don't link — standalone quote
                {link.type === "none" && <Check className="ml-auto h-4 w-4" />}
              </button>

              {hasOpenLead && (
                <button
                  onClick={() => setLink({ type: "lead" })}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[4px] border p-3 text-left transition-colors",
                    link.type === "lead" ? "border-[#711419] bg-[#711419]/[0.04]" : "border-slate-300/70 hover:border-slate-900",
                  )}
                  data-testid="quote-setup-link-lead"
                >
                  <Target className={cn("h-4 w-4 shrink-0", link.type === "lead" ? "text-[#711419]" : "text-slate-400")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900">Their open lead</span>
                    <span className="block text-xs capitalize text-slate-500">Stage: {customer?.salesStage?.replace(/_/g, " ")}</span>
                  </span>
                  {link.type === "lead" && <Check className="h-4 w-4 shrink-0 text-[#711419]" />}
                </button>
              )}

              {workOrders.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Work orders</p>
                  <div className="space-y-1.5">
                    {workOrders.map((wo) => {
                      const active = link.type === "work_order" && link.id === wo.id;
                      return (
                        <button
                          key={wo.id}
                          onClick={() => setLink({ type: "work_order", id: wo.id })}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-[4px] border p-2.5 text-left transition-colors",
                            active ? "border-[#711419] bg-[#711419]/[0.04]" : "border-slate-300/70 hover:border-slate-900",
                          )}
                          data-testid={`quote-setup-link-wo-${wo.id}`}
                        >
                          <Briefcase className={cn("h-4 w-4 shrink-0", active ? "text-[#711419]" : "text-slate-400")} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">{wo.title || "Work order"}</span>
                            <span className="block text-xs capitalize text-slate-500">{wo.status.replace(/_/g, " ")}</span>
                          </span>
                          {active && <Check className="h-4 w-4 shrink-0 text-[#711419]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {projects.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Projects</p>
                  <div className="space-y-1.5">
                    {projects.map((pr) => {
                      const active = link.type === "project" && link.id === pr.id;
                      return (
                        <button
                          key={pr.id}
                          onClick={() => setLink({ type: "project", id: pr.id })}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-[4px] border p-2.5 text-left transition-colors",
                            active ? "border-[#711419] bg-[#711419]/[0.04]" : "border-slate-300/70 hover:border-slate-900",
                          )}
                          data-testid={`quote-setup-link-project-${pr.id}`}
                        >
                          <FolderKanban className={cn("h-4 w-4 shrink-0", active ? "text-[#711419]" : "text-slate-400")} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">{pr.title || "Project"}</span>
                            <span className="block text-xs capitalize text-slate-500">{(pr.status || "").replace(/_/g, " ")}</span>
                          </span>
                          {active && <Check className="h-4 w-4 shrink-0 text-[#711419]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {nothingToLink && (
                <p className="rounded-[4px] border border-dashed border-slate-300 py-6 text-center text-sm text-slate-400">
                  No work orders or projects for {customer?.name} yet.
                </p>
              )}
            </div>
          )}

          {step === "assignee" && (
            <div className="space-y-2">
              {usersLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
              ) : salesUsers.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No salespeople found.</p>
              ) : (
                salesUsers.map((u) => {
                  const active = assigneeId === u.id;
                  return (
                    <button
                      key={u.id}
                      onClick={() => setAssigneeId(u.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[4px] border p-3 text-left transition-colors",
                        active ? "border-[#711419] bg-[#711419]/[0.04]" : "border-slate-300/70 hover:border-slate-900",
                      )}
                      data-testid={`quote-setup-assignee-${u.id}`}
                    >
                      <span className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] text-xs font-bold",
                        active ? "bg-[#711419] text-white" : "bg-slate-100 text-slate-600",
                      )}>
                        {(u.displayName || "?").trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{u.displayName}</span>
                        <span className="block text-xs capitalize text-slate-500">{u.role}</span>
                      </span>
                      {active && <Check className="h-4 w-4 shrink-0 text-[#711419]" />}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200/80 pt-3">
          {stepIndex > 0 ? (
            <Button variant="outline" size="sm" onClick={goBack} data-testid="quote-setup-back">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
          ) : (
            <span />
          )}
          {step === "assignee" ? (
            <Button
              size="sm"
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              disabled={!canContinue}
              onClick={launch}
              data-testid="quote-setup-launch"
            >
              Open {kindLabel} <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              disabled={!canContinue}
              onClick={goNext}
              data-testid="quote-setup-next"
            >
              Continue <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
