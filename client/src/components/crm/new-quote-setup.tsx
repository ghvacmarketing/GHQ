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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  Check,
  FileText,
  Loader2,
  Search,
  Zap,
} from "lucide-react";

/** New Quote setup — two modals: (1) which kind of quote, then (2) ONE form
 *  collecting customer, property, optional link, and salesperson together.
 *  The chosen builder then opens with all of it prefilled and its own
 *  redundant questions hidden. */

type QuoteKind = "quick" | "proposal" | "worksheet";

const KINDS: Array<{ value: QuoteKind; label: string; description: string; icon: typeof Zap }> = [
  { value: "proposal", label: "Proposal Builder", description: "Full system proposal from the pricebook", icon: FileText },
  { value: "worksheet", label: "Custom Pricing", description: "Install worksheet with labor, materials, and margins", icon: Calculator },
  { value: "quick", label: "Quick Quote", description: "Simple quote with line items", icon: Zap },
];

type CustomerLite = {
  id: string;
  name: string;
  phone?: string | null;
  fullAddress?: string | null;
  salesStage?: string | null;
};

export function NewQuoteSetup({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"type" | "details">("type");
  const [kind, setKind] = useState<QuoteKind | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [propertyId, setPropertyId] = useState<string>("none");
  const [linkValue, setLinkValue] = useState<string>("none"); // none | lead | wo:<id> | pr:<id>
  const [assigneeId, setAssigneeId] = useState<string>("");

  // Fresh dialog every open
  useEffect(() => {
    if (open) {
      setStep("type");
      setKind(null);
      setCustomerSearch("");
      setCustomer(null);
      setPropertyId("none");
      setLinkValue("none");
      setAssigneeId("");
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
    enabled: open && step === "details" && !customer && customerSearch.trim().length >= 2,
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

  const { data: workOrdersData } = useQuery<{ workOrders: Array<{ id: string; title: string | null; status: string }> }>({
    queryKey: ["/api/crm/work-orders", "quote-setup", customer?.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders?customerId=${customer!.id}&limit=10`, { credentials: "include" });
      if (!res.ok) return { workOrders: [] };
      return res.json();
    },
    enabled: open && !!customer,
  });

  const { data: projectsData } = useQuery<any>({
    queryKey: ["/api/crm/projects", "quote-setup", customer?.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects?customerId=${customer!.id}&limit=10`, { credentials: "include" });
      if (!res.ok) return { projects: [] };
      return res.json();
    },
    enabled: open && !!customer,
  });

  const { data: salesUsers = [], isLoading: usersLoading } = useQuery<Array<{ id: string; displayName: string; role: string }>>({
    queryKey: ["/api/crm/users/by-role", "sales", "quote-setup"],
    queryFn: async () => {
      const res = await fetch("/api/crm/users/by-role?exactRole=sales", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && step === "details",
  });

  const workOrders = workOrdersData?.workOrders || [];
  const projects: Array<{ id: string; title: string | null; status: string }> = projectsData?.projects || (Array.isArray(projectsData) ? projectsData : []);
  const hasOpenLead = !!customer?.salesStage && !["won", "lost"].includes(customer.salesStage);
  const nothingToLink = workOrders.length === 0 && projects.length === 0 && !hasOpenLead;

  const launch = () => {
    if (!kind || !customer || !assigneeId) return;
    const params = new URLSearchParams({ setup: "1", assignedToId: assigneeId });
    if (propertyId && propertyId !== "none") params.set("propertyId", propertyId);
    if (linkValue.startsWith("wo:")) params.set("workOrderId", linkValue.slice(3));
    if (linkValue.startsWith("pr:")) params.set("projectId", linkValue.slice(3));
    if (linkValue === "lead") params.set("sourceType", "lead");

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
        {step === "type" ? (
          <>
            <DialogHeader>
              <DialogTitle>New Quote</DialogTitle>
              <DialogDescription>What kind of quote is this?</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {KINDS.map((k) => {
                const Icon = k.icon;
                return (
                  <button
                    key={k.value}
                    onClick={() => { setKind(k.value); setStep("details"); }}
                    className="flex w-full items-center gap-3 rounded-[4px] border border-slate-300/70 p-3.5 text-left transition-colors hover:border-[#711419] hover:bg-[#711419]/[0.03]"
                    data-testid={`quote-setup-kind-${k.value}`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[3px] bg-slate-100 text-slate-600">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{k.label}</span>
                      <span className="block text-xs text-slate-500">{k.description}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{kindLabel}</DialogTitle>
              <DialogDescription>Who and what is this quote for?</DialogDescription>
            </DialogHeader>

            <div className="-mx-1 max-h-[60vh] space-y-4 overflow-y-auto px-1">
              {/* Customer */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</Label>
                {customer ? (
                  <div className="flex items-center justify-between rounded-[4px] border border-[#711419]/25 bg-[#711419]/[0.05] px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{customer.name}</p>
                      {customer.fullAddress && <p className="truncate text-xs text-slate-500">{customer.fullAddress}</p>}
                    </div>
                    <button
                      onClick={() => { setCustomer(null); setPropertyId("none"); setLinkValue("none"); setCustomerSearch(""); }}
                      className="shrink-0 text-xs font-medium text-[#711419] hover:underline"
                    >
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
                        className="pl-9 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none focus-visible:border-slate-400"
                        data-testid="quote-setup-customer-search"
                      />
                    </div>
                    {customerSearch.trim().length >= 2 && (
                      <div className="max-h-44 overflow-y-auto rounded-[4px] border border-slate-300/70">
                        {searching ? (
                          <div className="flex justify-center py-5"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
                        ) : customerResults.length === 0 ? (
                          <p className="py-5 text-center text-sm text-slate-400">No customers match.</p>
                        ) : (
                          customerResults.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => { setCustomer(c); setPropertyId("none"); setLinkValue("none"); }}
                              className="flex w-full items-center justify-between border-b border-slate-200/80 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50"
                              data-testid={`quote-setup-customer-${c.id}`}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-slate-900">{c.name}</span>
                                {c.fullAddress && <span className="block truncate text-xs text-slate-500">{c.fullAddress}</span>}
                              </span>
                              {c.phone && <span className="shrink-0 text-xs text-slate-500">{c.phone}</span>}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Property */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Property</Label>
                {!customer ? (
                  <p className="text-xs text-slate-400">Pick a customer first.</p>
                ) : propertiesLoading ? (
                  <p className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading properties…</p>
                ) : properties.length === 0 ? (
                  <p className="text-xs text-slate-400">No properties on file — you can continue without one.</p>
                ) : (
                  <Select value={propertyId} onValueChange={setPropertyId}>
                    <SelectTrigger className="focus:ring-0 focus:ring-offset-0" data-testid="quote-setup-property">
                      <SelectValue placeholder="Select a property" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific property</SelectItem>
                      {properties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nickname || p.address1 || "Property"}{p.city ? ` — ${p.city}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Link to (optional) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Link to (optional)</Label>
                {!customer ? (
                  <p className="text-xs text-slate-400">Pick a customer first.</p>
                ) : nothingToLink ? (
                  <p className="text-xs text-slate-400">No work orders or projects for {customer.name} yet.</p>
                ) : (
                  <Select value={linkValue} onValueChange={setLinkValue}>
                    <SelectTrigger className="focus:ring-0 focus:ring-offset-0" data-testid="quote-setup-link">
                      <SelectValue placeholder="Don't link" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Don't link — standalone quote</SelectItem>
                      {hasOpenLead && (
                        <SelectItem value="lead">
                          Their open lead ({(customer.salesStage || "").replace(/_/g, " ")})
                        </SelectItem>
                      )}
                      {workOrders.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Work orders</SelectLabel>
                          {workOrders.map((wo) => (
                            <SelectItem key={wo.id} value={`wo:${wo.id}`}>
                              {wo.title || "Work order"} ({wo.status.replace(/_/g, " ")})
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {projects.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Projects</SelectLabel>
                          {projects.map((pr) => (
                            <SelectItem key={pr.id} value={`pr:${pr.id}`}>
                              {pr.title || "Project"} ({(pr.status || "").replace(/_/g, " ")})
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Salesperson */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Salesperson</Label>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger className="focus:ring-0 focus:ring-offset-0" data-testid="quote-setup-assignee">
                    <SelectValue placeholder={usersLoading ? "Loading…" : "Assign to…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {salesUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.displayName} ({u.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200/80 pt-3">
              <Button variant="outline" size="sm" onClick={() => setStep("type")} data-testid="quote-setup-back">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
              </Button>
              <Button
                size="sm"
                className="bg-[#711419] hover:bg-[#8a1a1f]"
                disabled={!customer || !assigneeId}
                onClick={launch}
                data-testid="quote-setup-launch"
              >
                <Check className="mr-1.5 h-4 w-4" /> Open {kindLabel}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
