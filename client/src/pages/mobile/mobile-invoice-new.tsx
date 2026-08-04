import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { format, subDays } from "date-fns";
import { Search, X, ChevronRight, Loader2, Minus, Plus, FileCheck } from "lucide-react";
import { visitTypeBadge } from "@/pages/mobile/mobile-work-orders";
import { LineItemsEditor, type CatalogPick } from "@/components/mobile/line-items-editor";
import { customerTypeBadge } from "./mobile-quote-new";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MobileCreatePage } from "@/components/mobile/mobile-create-page";
import type { CrmCustomer, CrmProperty, CrmQuoteLineItem, CrmWorkOrder } from "@shared/schema";

/** New Invoice — one-page invoice creator. Pick a job (customer → work
 *  order), add line items, submit. The payload mirrors the in-job InvoiceTab
 *  exactly so records are identical. */

interface WorkOrderWithRelations extends CrmWorkOrder {
  customer: CrmCustomer | null;
  property: CrmProperty | null;
}

interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineType: "service" | "discount" | "part" | "maintenance";
}

function calculateLineTotal(item: { quantity: number; unitPrice: number }): number {
  return item.quantity * item.unitPrice;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const inputClass = "focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none";

function formatCurrency(amount: number | string) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num || 0);
}

export default function MobileInvoiceNew({
  jobId: jobIdProp,
  fromQuoteId: fromQuoteIdProp,
  onClose,
}: { jobId?: string; fromQuoteId?: string; onClose?: () => void } = {}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // --- Job picker state ---
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [pickedCustomer, setPickedCustomer] = useState<CrmCustomer | null>(null);
  const [pickedWorkOrder, setPickedWorkOrder] = useState<WorkOrderWithRelations | null>(null);

  // Launched from inside a job — as an OVERLAY (props + onClose, the sheet
  // rides over the live job page) or via ?job=<id> — the work order is
  // already known, so the picker never shows.
  const searchParams = new URLSearchParams(useSearch());
  const presetJobId = jobIdProp ?? searchParams.get("job");
  const fromQuoteId = fromQuoteIdProp ?? searchParams.get("fromQuote");
  const { data: presetJob, isLoading: presetLoading } = useQuery<WorkOrderWithRelations | null>({
    queryKey: ["/api/crm/work-orders", "create-preset", presetJobId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders/${presetJobId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!presetJobId,
  });
  useEffect(() => {
    if (presetJob && !pickedWorkOrder) {
      setPickedWorkOrder(presetJob);
      setPickedCustomer(presetJob.customer ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetJob]);
  const waitingOnPreset = !!presetJobId && !pickedWorkOrder && presetLoading;

  // "Create from Quote": prefill the line items from that quote, once —
  // the same conversion the old in-job flow used.
  const { data: fromQuote } = useQuery<{ lineItems?: CrmQuoteLineItem[] } | null>({
    queryKey: ["/api/crm/quotes", "invoice-prefill", fromQuoteId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quotes/${fromQuoteId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!fromQuoteId,
  });
  const prefilledFromQuote = useRef(false);
  useEffect(() => {
    if (!fromQuote?.lineItems?.length || prefilledFromQuote.current) return;
    prefilledFromQuote.current = true;
    setLineItems(fromQuote.lineItems.map((item, i) => ({
      id: `${Date.now()}-${i}`,
      description: item.description,
      quantity: parseFloat(item.quantity || "1"),
      unitPrice: parseFloat(item.unitPrice || "0"),
      lineType: (item.lineType === "discount"
        ? "discount"
        : item.lineType === "part"
          ? "part"
          : item.lineType === "maintenance"
            ? "maintenance"
            : "service") as InvoiceLineItem["lineType"],
    })));
    toast({ title: "Quote Imported", description: `${fromQuote.lineItems.length} line items imported from quote.` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromQuote]);

  // ── Maintenance agreement intercept — picking Preventative Maintenance
  // from the price book sets up a REAL agreement (ported from the old
  // in-job invoice form, so the "+" flow finally has it too). ──
  const [showAgreementSheet, setShowAgreementSheet] = useState(false);
  const [agreementNumberOfSystems, setAgreementNumberOfSystems] = useState(1);
  const [agreementContractDate, setAgreementContractDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [agreementBillingPreference, setAgreementBillingPreference] = useState<"pay_on_visit" | "auto_invoice">("auto_invoice");
  const [agreementAutoRenew, setAgreementAutoRenew] = useState(true);
  const [agreementNotes, setAgreementNotes] = useState("");
  const [agreementPayingNow, setAgreementPayingNow] = useState(false);
  // $229 first system, $10 off each additional
  const agreementPrice = Array.from({ length: agreementNumberOfSystems }, (_, i) => 229 - 10 * i).reduce((a, b) => a + b, 0);

  const createAgreementMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/mobile/work-orders/${pickedWorkOrder!.id}/create-agreement`, {
        numberOfSystems: agreementNumberOfSystems,
        contractDate: agreementContractDate,
        billingPreference: agreementBillingPreference,
        autoRenew: agreementAutoRenew,
        notes: agreementNotes,
        payingNow: agreementPayingNow,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to create agreement");
      }
      return response.json();
    },
    onSuccess: (data: { payingNow?: boolean; lineItemData?: { description: string; unitPrice: string } }) => {
      if (data.payingNow) {
        toast({ title: "Agreement Created", description: "Maintenance agreement created and payment recorded." });
      } else {
        toast({ title: "Agreement Created", description: "Maintenance agreement created. Line item added to this invoice." });
        if (data.lineItemData) {
          setLineItems((prev) => [...prev, {
            id: Date.now().toString(),
            description: data.lineItemData!.description,
            quantity: 1,
            unitPrice: parseFloat(data.lineItemData!.unitPrice),
            lineType: "maintenance",
          }]);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/crm/agreements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      setShowAgreementSheet(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create agreement", variant: "destructive" });
    },
  });

  // --- Invoice form state (mirrors in-job InvoiceTab) ---
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);

  // Customer search — same endpoint as the mobile Customers page
  const { data: customers, isLoading: customersLoading } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/mobile/customers", { search: debouncedSearch, limit: 20 }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("limit", "20");
      const res = await fetch(`/api/mobile/customers?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
    enabled: !pickedCustomer,
  });

  // Recent work orders for the picked customer (past 6 months through upcoming)
  const { data: workOrdersData, isLoading: workOrdersLoading } = useQuery<{ workOrders: WorkOrderWithRelations[] }>({
    queryKey: ["/api/crm/work-orders", "new-invoice-picker", pickedCustomer?.id],
    queryFn: async () => {
      const dateFrom = subDays(new Date(), 180).toISOString();
      const res = await fetch(
        `/api/crm/work-orders?customerId=${pickedCustomer!.id}&limit=10&dateFrom=${encodeURIComponent(dateFrom)}`,
        { credentials: "include" },
      );
      if (!res.ok) return { workOrders: [] };
      return res.json();
    },
    enabled: !!pickedCustomer && !pickedWorkOrder,
  });

  const workOrders = workOrdersData?.workOrders || [];

  // Create invoice mutation — payload mirrors the in-job InvoiceTab exactly
  const createInvoiceMutation = useMutation({
    mutationFn: async (data: {
      lineItems: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number; lineType: string }>;
      subtotal: number;
      total: number;
    }) => {
      const workOrder = pickedWorkOrder!;
      const formattedLineItems = data.lineItems.map((item, index) => ({
        description: item.description,
        quantity: item.quantity.toFixed(2),
        unitPrice: item.unitPrice.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
        lineType: item.lineType,
        isDiscountLine: item.lineType === "discount",
        discountKind: item.lineType === "discount" ? "fixed" : undefined,
        sortOrder: index,
      }));

      const customerName = workOrder.customer?.name || "Unknown Customer";
      const customerEmail = workOrder.customer?.email || "";
      const customerPhone = workOrder.customer?.phone || "";
      const serviceAddress = workOrder.property
        ? [workOrder.property.address1, workOrder.property.city, workOrder.property.state, workOrder.property.zip].filter(Boolean).join(", ")
        : "";

      const response = await apiRequest("POST", "/api/crm/invoices", {
        workOrderId: workOrder.id,
        customerId: workOrder.customerId,
        propertyId: workOrder.propertyId,
        customerName,
        customerEmail,
        customerPhone,
        serviceAddress,
        lineItems: formattedLineItems,
        subtotal: data.subtotal.toFixed(2),
        laborTotal: "0.00",
        taxTotal: "0.00",
        total: data.total.toFixed(2),
        amountPaid: "0.00",
        balanceDue: data.total.toFixed(2),
        status: "draft",
      });
      return response.json();
    },
    onSuccess: (invoice: { id?: string }) => {
      toast({ title: "Invoice Created", description: "Your invoice has been created as a draft." });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      // Overlay mode just closes back onto the live job tab; the route
      // flavors navigate — job tab or the new invoice itself.
      if (onClose) onClose();
      else if (presetJobId) navigate(`/mobile/job/${presetJobId}?tab=invoice`);
      else if (invoice?.id) navigate(`/mobile/invoices/${invoice.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create invoice", variant: "destructive" });
    },
  });

  const addLineItem = () => {
    setLineItems([...lineItems, { id: Date.now().toString(), description: "", quantity: 1, unitPrice: 0, lineType: "service" }]);
  };

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof InvoiceLineItem, value: string | number) => {
    setLineItems(lineItems.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const addFromCatalog = (item: CatalogPick) => {
    const cat = (item.category || "").toLowerCase();
    // Preventative Maintenance is never a plain line item — it means a
    // maintenance AGREEMENT, so the intercept opens the agreement setup.
    const isPreventativeMaintenance = cat === "maintenance" &&
      ((item.name || "").toLowerCase().includes("preventative") || (item.name || "").toLowerCase().includes("preventive"));
    if (isPreventativeMaintenance && pickedWorkOrder) {
      setAgreementNumberOfSystems(1);
      setAgreementContractDate(format(new Date(), "yyyy-MM-dd"));
      setAgreementBillingPreference("auto_invoice");
      setAgreementAutoRenew(true);
      setAgreementNotes("");
      setAgreementPayingNow(false);
      setShowAgreementSheet(true);
      return;
    }
    const lineType: InvoiceLineItem["lineType"] =
      cat === "service" ? "service" : cat === "maintenance" ? "maintenance" : "part";
    setLineItems((prev) => [
      ...prev,
      { id: Date.now().toString(), description: item.name, quantity: 1, unitPrice: item.rate, lineType },
    ]);
  };

  const subtotal = lineItems.reduce((sum, item) => sum + calculateLineTotal(item), 0);
  const total = subtotal;

  // Same validation as the in-job InvoiceTab: items need a description, and at
  // least one line must have a positive total.
  const validItems = lineItems.filter((item) => item.description.trim());
  const hasPositiveTotal = validItems.some((item) => calculateLineTotal(item) > 0);
  const canSubmit = !!pickedWorkOrder && validItems.length > 0 && hasPositiveTotal && !createInvoiceMutation.isPending;
  // Launched from a job, the pre-selected work order doesn't count as
  // "your work" — only touched line items do. The "+" flow counts the
  // manual customer/job picking too.
  const dirty = presetJobId
    ? lineItems.length > 0
    : !!pickedCustomer || !!pickedWorkOrder || lineItems.length > 0;

  const handleCreateInvoice = () => {
    if (!canSubmit) return;
    createInvoiceMutation.mutate({
      lineItems: validItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: calculateLineTotal(item),
        lineType: item.lineType,
      })),
      subtotal,
      total,
    });
  };

  return (
    <MobileCreatePage
      title="New invoice"
      dirty={dirty}
      onClose={onClose}
      exitTo={!onClose && presetJobId ? `/mobile/job/${presetJobId}?tab=invoice` : undefined}
      testid="mobile-invoice-new-page"
    >
      <div className="space-y-4">
        {/* --- Job picker --- */}
        {waitingOnPreset ? (
          <div className="space-y-2 rounded-[4px] border border-slate-300/70 bg-white px-4 py-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-56" />
          </div>
        ) : pickedWorkOrder ? (
          <div
            className="flex items-center justify-between gap-3 rounded-[4px] border border-[#711419]/25 bg-[#711419]/[0.05] px-4 py-3"
            data-testid="picked-job"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#711419]/70">Invoice for</p>
              <p className="truncate font-semibold text-slate-900">{pickedWorkOrder.customer?.name || "Customer"}</p>
              <p className="truncate text-xs text-slate-500">
                {[
                  pickedWorkOrder.title || "Work order",
                  pickedWorkOrder.scheduledStart ? format(new Date(pickedWorkOrder.scheduledStart), "MMM d, yyyy") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <button
              onClick={() => setPickedWorkOrder(null)}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 active:scale-95"
              data-testid="button-change-job"
            >
              Change
            </button>
          </div>
        ) : pickedCustomer ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-[4px] border border-[#711419]/25 bg-[#711419]/[0.05] px-4 py-3" data-testid="picked-customer">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#711419]/70">Customer</p>
                <p className="truncate font-semibold text-slate-900">{pickedCustomer.name}</p>
              </div>
              <button
                onClick={() => setPickedCustomer(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 active:scale-95"
                aria-label="Clear customer"
                data-testid="button-clear-customer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Label className="block">Pick a work order</Label>
            {workOrdersLoading ? (
              <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
                {[1, 2, 3].map((i) => (
                  <div key={i} className={`space-y-2 px-3.5 py-3 ${i > 1 ? "border-t border-slate-200/80" : ""}`}>
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                ))}
              </div>
            ) : workOrders.length > 0 ? (
              <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="work-order-results">
                {workOrders.map((wo, i) => (
                  <button
                    key={wo.id}
                    onClick={() => setPickedWorkOrder(wo)}
                    className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                    data-testid={`work-order-${wo.id}`}
                  >
                    <img src={visitTypeBadge(wo.visitType)} alt="" className="h-9 w-9 shrink-0 select-none" draggable={false} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{wo.title || "Work order"}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {[
                          wo.scheduledStart ? format(new Date(wo.scheduledStart), "EEE, MMM d, yyyy") : "Unscheduled",
                          wo.status ? wo.status.replace(/_/g, " ") : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-8 text-center" data-testid="no-work-orders">
                <p className="text-sm font-medium text-slate-600">No recent work orders</p>
                <p className="mt-0.5 px-6 text-xs text-slate-400">Invoices must be tied to a work order. Create a job for this customer first.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Search customers by name or phone"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-slate-100 pl-9 pr-9 text-[16px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-300 focus:bg-white"
                data-testid="customer-search-input"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md bg-slate-300 text-white"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {customersLoading ? (
              <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={`space-y-2 px-3.5 py-3 ${i > 1 ? "border-t border-slate-200/80" : ""}`}>
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                ))}
              </div>
            ) : customers && customers.slice(0, 5).length > 0 ? (
              <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="customer-results">
                {customers.slice(0, 5).map((customer, i) => (
                  <button
                    key={customer.id}
                    onClick={() => setPickedCustomer(customer)}
                    className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                    data-testid={`customer-card-${customer.id}`}
                  >
                    <img
                      src={customerTypeBadge(customer.customerType)}
                      alt=""
                      className="h-9 w-9 shrink-0 select-none"
                      draggable={false}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{customer.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {[customer.phone, customer.fullAddress].filter(Boolean).join(" · ") || "No contact info"}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-8 text-center" data-testid="empty-customers">
                <p className="text-sm font-medium text-slate-600">No customers found</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {searchQuery ? "Try adjusting your search terms." : "Start typing to search for customers."}
                </p>
              </div>
            )}
          </div>
        )}

        {/* --- Invoice fields (same page, no steps) --- */}
        {/* Customer-first: nothing to fill until a job is picked */}
        {pickedWorkOrder && (
        <div className="space-y-5">
          <LineItemsEditor
            items={lineItems}
            onAdd={addLineItem}
            onRemove={removeLineItem}
            onUpdate={(id, field, value) => updateLineItem(id, field, value)}
            onAddFromCatalog={addFromCatalog}
            subtotal={subtotal}
            total={total}
            totalsTestPrefix="invoice"
          />
        </div>
        )}

        {pickedWorkOrder && (
        <Button
          className="h-12 w-full rounded-[4px] bg-[#711419] text-base font-semibold hover:bg-[#8a1a1f]"
          onClick={handleCreateInvoice}
          disabled={!canSubmit}
          data-testid="button-create-invoice"
        >
          {createInvoiceMutation.isPending && <Loader2 className="mr-1.5 h-5 w-5 animate-spin" />}
          Create invoice
        </Button>
        )}
      </div>

      {/* Maintenance agreement setup — the Preventative Maintenance intercept */}
      <DraggableSheet tall open={showAgreementSheet} onOpenChange={setShowAgreementSheet} title="Create maintenance agreement" testid="sheet-create-agreement">
        <div className="flex items-center gap-2">
          <FileCheck className="h-5 w-5 text-[#711419]" />
          <h2 className="text-lg font-semibold text-slate-900">Maintenance agreement</h2>
        </div>
        <p className="mt-0.5 text-sm text-slate-500">
          {pickedWorkOrder?.customer?.name || "Customer"} — preventative maintenance plan.
        </p>
        <div className="mt-4 space-y-4 pb-2">
          <div>
            <Label className="mb-1.5 block">Number of systems</Label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAgreementNumberOfSystems((prev) => Math.max(1, prev - 1))}
                disabled={agreementNumberOfSystems <= 1}
                className="flex h-11 w-11 items-center justify-center rounded-[4px] border border-slate-300/70 bg-white text-slate-700 transition-transform active:scale-95 disabled:opacity-40"
                data-testid="button-decrease-agreement-systems"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-12 text-center text-lg font-bold tabular-nums text-slate-900" data-testid="text-agreement-systems">
                {agreementNumberOfSystems}
              </span>
              <button
                type="button"
                onClick={() => setAgreementNumberOfSystems((prev) => prev + 1)}
                className="flex h-11 w-11 items-center justify-center rounded-[4px] border border-slate-300/70 bg-white text-slate-700 transition-transform active:scale-95"
                data-testid="button-increase-agreement-systems"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">$229 first system, $10 off each additional</p>
          </div>

          <div className="flex items-center justify-between rounded-[4px] border border-emerald-200 bg-emerald-50 px-3.5 py-3">
            <span className="text-sm font-medium text-emerald-800">Annual agreement price</span>
            <span className="text-xl font-bold tabular-nums text-emerald-700">${agreementPrice.toFixed(2)}</span>
          </div>

          <div>
            <Label htmlFor="agreement-date" className="mb-1.5 block">Contract date</Label>
            <Input
              id="agreement-date"
              type="date"
              value={agreementContractDate}
              onChange={(e) => setAgreementContractDate(e.target.value)}
              className={inputClass}
              data-testid="input-agreement-contract-date"
            />
          </div>

          <div>
            <Label className="mb-1.5 block">Billing preference</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAgreementBillingPreference("auto_invoice")}
                className={`h-11 flex-1 rounded-[4px] border text-sm font-semibold transition-transform active:scale-[0.98] ${agreementBillingPreference === "auto_invoice" ? "border-[#711419] bg-[#711419]/[0.06] text-[#711419]" : "border-slate-300/70 bg-white text-slate-600"}`}
                data-testid="agreement-billing-auto"
              >
                Bill immediately
              </button>
              <button
                type="button"
                onClick={() => setAgreementBillingPreference("pay_on_visit")}
                className={`h-11 flex-1 rounded-[4px] border text-sm font-semibold transition-transform active:scale-[0.98] ${agreementBillingPreference === "pay_on_visit" ? "border-[#711419] bg-[#711419]/[0.06] text-[#711419]" : "border-slate-300/70 bg-white text-slate-600"}`}
                data-testid="agreement-billing-visit"
              >
                Pay on visit
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {agreementBillingPreference === "auto_invoice"
                ? "The maintenance line lands on this invoice."
                : "The customer pays when the technician arrives for the first visit."}
            </p>
          </div>

          <div className="flex items-center justify-between py-1">
            <div>
              <Label className="text-sm font-medium">Auto renew</Label>
              <p className="text-xs text-slate-500">Renew the agreement each year automatically</p>
            </div>
            <Switch
              checked={agreementAutoRenew}
              onCheckedChange={setAgreementAutoRenew}
              data-testid="switch-agreement-auto-renew"
            />
          </div>

          <div className="flex items-center justify-between border-t border-slate-200/80 py-3">
            <div>
              <Label className="text-sm font-medium">Customer paying now?</Label>
              <p className="text-xs text-slate-500">Record payment immediately and activate</p>
            </div>
            <Switch
              checked={agreementPayingNow}
              onCheckedChange={setAgreementPayingNow}
              data-testid="switch-agreement-paying-now"
            />
          </div>

          <div>
            <Label htmlFor="agreement-notes" className="mb-1.5 block">Notes (optional)</Label>
            <Textarea
              id="agreement-notes"
              value={agreementNotes}
              onChange={(e) => setAgreementNotes(e.target.value)}
              placeholder="Any additional notes about this agreement..."
              rows={3}
              className={inputClass}
              data-testid="textarea-agreement-notes"
            />
          </div>

          <button
            onClick={() => createAgreementMutation.mutate()}
            disabled={createAgreementMutation.isPending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[4px] bg-[#711419] text-base font-semibold text-white shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
            data-testid="button-create-agreement"
          >
            {createAgreementMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <FileCheck className="h-4 w-4" />
            )}
            Create Agreement
          </button>
        </div>
      </DraggableSheet>
    </MobileCreatePage>
  );
}
