import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, subDays } from "date-fns";
import { Search, X, ChevronRight, Plus, Trash2, Briefcase, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MobileCreatePage } from "@/components/mobile/mobile-create-page";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import type { CrmCustomer, CrmProperty, CrmUser, CrmWorkOrder } from "@shared/schema";

/** New Quote — customer-first flow: pick the customer (top recents up
 *  front), their work orders pop up in a sheet, and only then does the quote
 *  form appear. The payload mirrors the in-job QuoteTab exactly so records
 *  are identical. */

interface WorkOrderWithRelations extends CrmWorkOrder {
  customer: CrmCustomer | null;
  property: CrmProperty | null;
}

interface QuickQuoteLineItem {
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

export default function MobileQuoteNew() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // --- Job picker state ---
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [pickedCustomer, setPickedCustomer] = useState<CrmCustomer | null>(null);
  const [pickedWorkOrder, setPickedWorkOrder] = useState<WorkOrderWithRelations | null>(null);

  // --- Quote form state (mirrors in-job QuoteTab) ---
  const [quoteTitle, setQuoteTitle] = useState("");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("");
  const [lineItems, setLineItems] = useState<QuickQuoteLineItem[]>([]);

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
    queryKey: ["/api/crm/work-orders", "new-quote-picker", pickedCustomer?.id],
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

  // Fetch users with admin role only for quote assignee selection (same as in-job QuoteTab)
  const { data: adminUsers } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users", "admin-only"],
    queryFn: async () => {
      const res = await fetch("/api/crm/users", { credentials: "include" });
      if (!res.ok) return [];
      const users = await res.json();
      return users.filter((u: CrmUser) => u.role === "admin" && u.isActive);
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Create quote mutation — payload mirrors the in-job QuoteTab exactly
  const createQuoteMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      lineItems: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number; lineType: string }>;
      subtotal: number;
      total: number;
    }) => {
      const workOrder = pickedWorkOrder!;
      const customerName = workOrder.customer?.name || "Unknown Customer";
      const customerEmail = workOrder.customer?.email || "";
      const customerPhone = workOrder.customer?.phone || "";
      const serviceAddress = workOrder.property
        ? [workOrder.property.address1, workOrder.property.city, workOrder.property.state, workOrder.property.zip].filter(Boolean).join(", ")
        : "";

      const formattedLineItems = data.lineItems.map((item, index) => ({
        description: item.description,
        quantity: item.quantity.toFixed(2),
        unitPrice: item.unitPrice.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
        lineType: item.lineType,
        sortOrder: index,
      }));

      const response = await apiRequest("POST", "/api/crm/quotes", {
        scope: "work_order",
        workOrderId: workOrder.id,
        customerId: workOrder.customerId,
        propertyId: workOrder.propertyId,
        customerName,
        customerEmail,
        customerPhone,
        serviceAddress,
        title: data.title || `Quick Quote for WO-${workOrder.id.slice(-6)}`,
        lineItems: formattedLineItems,
        subtotal: data.subtotal.toFixed(2),
        laborTotal: "0",
        taxRate: "0.0825",
        taxAmount: "0",
        taxTotal: "0",
        total: data.total.toFixed(2),
        status: "draft",
        quoteType: "quick",
        assignedToId: selectedAssigneeId || undefined,
      });
      return response.json();
    },
    onSuccess: (quote: { id?: string }) => {
      toast({ title: "Quote Created", description: "Your quick quote has been created as a draft." });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      if (quote?.id) navigate(`/mobile/quotes/${quote.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create quote", variant: "destructive" });
    },
  });

  const addLineItem = () => {
    setLineItems([...lineItems, { id: Date.now().toString(), description: "", quantity: 1, unitPrice: 0, lineType: "service" }]);
  };

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof QuickQuoteLineItem, value: string | number) => {
    setLineItems(lineItems.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const subtotal = lineItems.reduce((sum, item) => sum + calculateLineTotal(item), 0);
  const total = subtotal; // No tax for quick quote

  const validItems = lineItems.filter((item) => item.description.trim() && item.unitPrice !== 0);
  const canSubmit = !!pickedWorkOrder && validItems.length > 0 && !!selectedAssigneeId && !createQuoteMutation.isPending;
  const dirty = !!pickedCustomer || !!pickedWorkOrder || quoteTitle.trim().length > 0 || lineItems.length > 0 || !!selectedAssigneeId;

  const handleCreateQuote = () => {
    if (!canSubmit) return;
    createQuoteMutation.mutate({
      title: quoteTitle,
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

  const showRecents = !searchQuery.trim();
  const shownCustomers = showRecents ? (customers || []).slice(0, 5) : customers || [];

  return (
    <MobileCreatePage
      title="New quote"
      dirty={dirty}
      onSave={pickedWorkOrder ? handleCreateQuote : undefined}
      saveLabel="Create quote"
      saveDisabled={!canSubmit}
      saving={createQuoteMutation.isPending}
      testid="mobile-quote-new-page"
    >
      <div className="space-y-4">
        {/* --- Step 1: who is this quote for --- */}
        {pickedWorkOrder ? (
          <div
            className="flex items-center justify-between gap-3 rounded-[4px] border border-[#711419]/25 bg-[#711419]/[0.05] px-4 py-3"
            data-testid="picked-job"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#711419]/70">Quote for</p>
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
              onClick={() => { setPickedWorkOrder(null); setPickedCustomer(null); }}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 active:scale-95"
              data-testid="button-change-job"
            >
              Change
            </button>
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

            {showRecents && (
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Recent customers</h3>
            )}
            {customersLoading ? (
              <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={`space-y-2 px-3.5 py-3 ${i > 1 ? "border-t border-slate-200/80" : ""}`}>
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                ))}
              </div>
            ) : shownCustomers.length > 0 ? (
              <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="customer-results">
                {shownCustomers.map((customer, i) => (
                  <button
                    key={customer.id}
                    onClick={() => setPickedCustomer(customer)}
                    className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                    data-testid={`customer-card-${customer.id}`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] border border-[#711419]/20 bg-[#711419]/5 text-[13px] font-bold text-[#711419]">
                      {(customer.name || "?").trim().charAt(0).toUpperCase()}
                    </span>
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

        {/* --- Step 2: the quote itself — appears once a job is picked --- */}
        {pickedWorkOrder && (
        <div className="space-y-4 rounded-[4px] border border-slate-300/70 bg-white p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#711419]" />
            <h2 className="text-sm font-semibold text-slate-900">Quote details</h2>
          </div>

          <div>
            <Label htmlFor="quote-title" className="mb-1.5 block">
              Quote title (optional)
            </Label>
            <Input
              id="quote-title"
              placeholder="e.g., AC Repair Quote"
              value={quoteTitle}
              onChange={(e) => setQuoteTitle(e.target.value)}
              className={`min-h-[44px] ${inputClass}`}
              data-testid="input-quote-title"
            />
          </div>

          <div>
            <Label htmlFor="quote-assignee" className="mb-1.5 block">
              Assign to admin personnel <span className="text-red-500">*</span>
            </Label>
            <Select value={selectedAssigneeId} onValueChange={setSelectedAssigneeId}>
              <SelectTrigger className="min-h-[44px]" data-testid="select-quote-assignee">
                <SelectValue placeholder="Select an admin..." />
              </SelectTrigger>
              <SelectContent>
                {adminUsers?.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Line items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <span className="rounded-[3px] bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {lineItems.length} item{lineItems.length !== 1 ? "s" : ""}
              </span>
            </div>

            {lineItems.length === 0 ? (
              <div className="rounded-[4px] border border-dashed border-slate-300 p-6 text-center text-slate-400">
                <p className="text-sm">No items added yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {lineItems.map((item, index) => (
                  <div key={item.id} className="space-y-2 rounded-[4px] border border-slate-300/70 bg-slate-50 p-3" data-testid={`line-item-${item.id}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">Item {index + 1}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-700"
                        onClick={() => removeLineItem(item.id)}
                        data-testid={`button-remove-item-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <Input
                      placeholder="Description (e.g., Labor - AC Repair)"
                      value={item.description}
                      onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                      className={`min-h-[44px] ${inputClass}`}
                      data-testid={`input-description-${item.id}`}
                    />
                    <div className="flex gap-2">
                      <div className="w-20">
                        <Label className="text-xs text-slate-500">Qty</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value) || 1)}
                          onFocus={(e) => e.target.select()}
                          className={`min-h-[44px] ${inputClass}`}
                          data-testid={`input-quantity-${item.id}`}
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs text-slate-500">Price</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={item.unitPrice || ""}
                          onChange={(e) => updateLineItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                          onFocus={(e) => e.target.select()}
                          className={`min-h-[44px] ${inputClass}`}
                          data-testid={`input-unit-price-${item.id}`}
                        />
                      </div>
                      <div className="w-24 text-right">
                        <Label className="text-xs text-slate-500">Total</Label>
                        <p className="flex min-h-[44px] items-center justify-end font-medium" data-testid={`line-total-${item.id}`}>
                          {formatCurrency(calculateLineTotal(item))}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              variant="outline"
              className="min-h-[44px] w-full rounded-[4px] border-slate-300/70"
              onClick={addLineItem}
              data-testid="button-add-line-item"
            >
              <Plus className="mr-1 h-4 w-4" />
              Add line item
            </Button>
          </div>

          {/* Totals */}
          <div className="space-y-2 border-t border-slate-200/80 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Subtotal</span>
              <span className="font-medium" data-testid="quote-subtotal">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-lg font-semibold">
              <span>Total</span>
              <span className={total >= 0 ? "text-green-700" : "text-red-600"} data-testid="quote-total">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Work-order picker — pops up the moment a customer is chosen */}
      <DraggableSheet
        tall
        open={!!pickedCustomer && !pickedWorkOrder}
        onOpenChange={(o) => { if (!o) setPickedCustomer(null); }}
        title={pickedCustomer ? `${pickedCustomer.name}'s work orders` : "Pick a work order"}
        testid="sheet-quote-work-order"
      >
        <h2 className="text-lg font-semibold text-slate-900">Which visit is this quote for?</h2>
        <p className="mt-0.5 truncate text-sm text-slate-500">{pickedCustomer?.name}</p>
        <div className="mt-4 space-y-2 pb-2">
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
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] border border-[#711419]/20 bg-[#711419]/5">
                    <Briefcase className="h-4 w-4 text-[#711419]" />
                  </span>
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
              <p className="mt-0.5 px-6 text-xs text-slate-400">Quotes need a work order. Create a job for this customer first.</p>
            </div>
          )}
        </div>
      </DraggableSheet>
    </MobileCreatePage>
  );
}
