import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Check,
  Plus,
  Trash2,
  Search,
  Loader2,
  Package,
  ClipboardList,
  Zap,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser, CrmWorkOrder, CrmQuote, CrmQuoteLineItem, CrmItem, CrmCustomer } from "@shared/schema";
import { format } from "date-fns";

const INVOICE_MODES = [
  {
    value: "manual",
    label: "Manual Entry",
    description: "Build an invoice from scratch with line items",
    icon: Zap,
  },
  {
    value: "from-quote",
    label: "From Quote",
    description: "Create invoice from an existing accepted quote",
    icon: FileText,
  },
];

type FormStep = 1 | 2 | 3 | 4;

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineType: "part" | "labor" | "service" | "other" | "discount";
  taxable: boolean;
  isDiscountLine?: boolean;
  discountKind?: "promotion" | "maintenance";
  crmItemId?: string;
}

interface FormData {
  mode: "manual" | "from-quote";
  workOrderId: string | null;
  quoteId: string | null;
  selectedOption: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceAddress: string;
  description: string;
  lineItems: LineItem[];
  notes: string;
  taxRate: number;
}

const initialFormData: FormData = {
  mode: "manual",
  workOrderId: null,
  quoteId: null,
  selectedOption: null,
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  serviceAddress: "",
  description: "",
  lineItems: [],
  notes: "",
  taxRate: 7,
};

type WorkOrderWithCustomer = CrmWorkOrder & {
  customer?: CrmCustomer | null;
  customerName?: string | null;
};

type QuoteWithItems = CrmQuote & {
  lineItems?: CrmQuoteLineItem[];
  customer?: CrmCustomer | null;
  customerName?: string | null;
};

export default function CrmInvoiceCreate() {
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState<FormStep>(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const [workOrderSearch, setWorkOrderSearch] = useState("");
  const [quoteSearch, setQuoteSearch] = useState("");
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrderWithCustomer | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<QuoteWithItems | null>(null);
  
  const [itemSearchOpen, setItemSearchOpen] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState<"all" | "install" | "service" | "maintenance">("all");

  const urlParams = new URLSearchParams(window.location.search);
  const workOrderIdFromUrl = urlParams.get("workOrderId");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const { data: workOrders, isLoading: workOrdersLoading } = useQuery<{ workOrders: WorkOrderWithCustomer[] }>({
    queryKey: ["/api/crm/work-orders", "for-invoice"],
    queryFn: async () => {
      const res = await fetch("/api/crm/work-orders?limit=100", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch work orders");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const { data: quotes, isLoading: quotesLoading } = useQuery<{ quotes: QuoteWithItems[] }>({
    queryKey: ["/api/crm/quotes", "accepted"],
    queryFn: async () => {
      const res = await fetch("/api/crm/quotes?status=accepted", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch quotes");
      return res.json();
    },
    enabled: !!currentUser && formData.mode === "from-quote",
  });

  const { data: crmItems } = useQuery<CrmItem[]>({
    queryKey: ["/api/crm/items"],
    enabled: !!currentUser && formData.mode === "manual",
  });

  useEffect(() => {
    if (workOrderIdFromUrl && workOrders?.workOrders) {
      const wo = workOrders.workOrders.find(w => w.id === workOrderIdFromUrl);
      if (wo) {
        setSelectedWorkOrder(wo);
        setFormData(prev => ({
          ...prev,
          workOrderId: wo.id,
          customerName: wo.customerName || wo.customer?.name || "",
          customerEmail: wo.customer?.email || "",
          customerPhone: wo.customer?.phone || "",
          serviceAddress: wo.customer?.fullAddress || "",
        }));
      }
    }
  }, [workOrderIdFromUrl, workOrders]);

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: {
      workOrderId: string;
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      serviceAddress?: string;
      description?: string;
      lineItems: Array<{
        lineType: string;
        description: string;
        quantity: string;
        unitPrice: string;
        lineTotal: string;
        taxable: boolean;
        isDiscountLine?: boolean;
        discountKind?: string;
        itemId?: string;
      }>;
      subtotal: string;
      tax: string;
      total: string;
    }) => {
      const res = await apiRequest("POST", "/api/crm/invoices", {
        ...data,
        balanceDue: data.total,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      toast({ title: "Invoice created successfully" });
      navigate(`/crm/invoices/${data.id}`);
    },
    onError: (err: any) => {
      toast({
        title: "Failed to create invoice",
        description: err.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const createFromQuoteMutation = useMutation({
    mutationFn: async (data: {
      quoteId: string;
      selectedOption?: string;
      workOrderId?: string;
    }) => {
      const res = await apiRequest("POST", "/api/crm/invoices/from-quote", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      toast({ title: "Invoice created from quote successfully" });
      navigate(`/crm/invoices/${data.id}`);
    },
    onError: (err: any) => {
      toast({
        title: "Failed to create invoice",
        description: err.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addLineItem = () => {
    const newItem: LineItem = {
      id: crypto.randomUUID(),
      description: "",
      quantity: 1,
      unitPrice: 0,
      lineType: "service",
      taxable: true,
    };
    setFormData(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, newItem],
    }));
  };

  const updateLineItem = (id: string, updates: Partial<LineItem>) => {
    setFormData(prev => ({
      ...prev,
      lineItems: prev.lineItems.map(item =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }));
  };

  const removeLineItem = (id: string) => {
    setFormData(prev => ({
      ...prev,
      lineItems: prev.lineItems.filter(item => item.id !== id),
    }));
  };

  const addFromCatalog = (item: CrmItem) => {
    const newItem: LineItem = {
      id: crypto.randomUUID(),
      description: item.name || item.description || "",
      quantity: 1,
      unitPrice: parseFloat(item.rate || "0"),
      lineType: item.itemType === "service" ? "service" : "part",
      taxable: item.taxable ?? true,
      crmItemId: item.id,
    };
    setFormData(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, newItem],
    }));
    setItemSearchOpen(false);
    setItemSearchQuery("");
  };

  const calculateSubtotal = () => {
    return formData.lineItems.reduce((sum, item) => {
      const lineTotal = item.quantity * item.unitPrice;
      return sum + (item.isDiscountLine ? -lineTotal : lineTotal);
    }, 0);
  };

  const calculateTax = () => {
    const taxableTotal = formData.lineItems
      .filter(item => item.taxable && !item.isDiscountLine)
      .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    return taxableTotal * (formData.taxRate / 100);
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax();
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return true;
      case 2:
        return !!formData.workOrderId;
      case 3:
        if (formData.mode === "from-quote") {
          return !!formData.quoteId;
        }
        return formData.lineItems.length > 0;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const handleSubmit = () => {
    if (formData.mode === "from-quote" && formData.quoteId) {
      createFromQuoteMutation.mutate({
        quoteId: formData.quoteId,
        selectedOption: formData.selectedOption || undefined,
        workOrderId: formData.workOrderId || undefined,
      });
    } else if (formData.workOrderId) {
      const subtotal = calculateSubtotal();
      const tax = calculateTax();
      const total = calculateTotal();

      createInvoiceMutation.mutate({
        workOrderId: formData.workOrderId,
        customerName: formData.customerName || undefined,
        customerEmail: formData.customerEmail || undefined,
        customerPhone: formData.customerPhone || undefined,
        serviceAddress: formData.serviceAddress || undefined,
        description: formData.description || undefined,
        lineItems: formData.lineItems.map((item, idx) => {
          const isDiscount = Boolean(item.isDiscountLine);
          const rawQty = Number(item.quantity) || 1;
          const rawPrice = Number(item.unitPrice) || 0;
          const qty = isDiscount ? 1 : Math.max(rawQty, 0);
          const unitPrice = isDiscount ? -Math.abs(rawPrice) : rawPrice;
          const lineTotal = qty * unitPrice;
          return {
            lineType: isDiscount ? "discount" as const : (item.lineType ?? "service"),
            description: item.description.trim(),
            quantity: qty.toFixed(2),
            unitPrice: unitPrice.toFixed(2),
            lineTotal: lineTotal.toFixed(2),
            taxable: !isDiscount && item.taxable !== false,
            isDiscountLine: isDiscount,
            discountKind: item.discountKind ?? null,
            itemId: item.crmItemId ?? null,
            sortOrder: idx,
          };
        }),
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
      });
    }
  };

  const filteredWorkOrders = workOrders?.workOrders?.filter(wo => {
    if (!workOrderSearch) return true;
    const search = workOrderSearch.toLowerCase();
    return (
      wo.title?.toLowerCase().includes(search) ||
      wo.workOrderNumber?.toString().includes(search) ||
      wo.customerName?.toLowerCase().includes(search) ||
      wo.customer?.name?.toLowerCase().includes(search)
    );
  }) || [];

  const filteredQuotes = quotes?.quotes?.filter(q => {
    if (!quoteSearch) return true;
    const search = quoteSearch.toLowerCase();
    return (
      q.quoteNumber?.toLowerCase().includes(search) ||
      q.title?.toLowerCase().includes(search) ||
      q.customerName?.toLowerCase().includes(search)
    );
  }) || [];

  const filteredCatalogItems = crmItems?.filter(item => {
    if (catalogCategoryFilter !== "all" && item.category !== catalogCategoryFilter) {
      return false;
    }
    if (!itemSearchQuery) return true;
    const search = itemSearchQuery.toLowerCase();
    return (
      item.name?.toLowerCase().includes(search) ||
      item.description?.toLowerCase().includes(search) ||
      item.partNumber?.toLowerCase().includes(search)
    );
  }) || [];

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const steps = [
    { number: 1, label: "Mode" },
    { number: 2, label: "Work Order" },
    { number: 3, label: formData.mode === "from-quote" ? "Select Quote" : "Line Items" },
    { number: 4, label: "Review" },
  ];

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/crm/invoices")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Invoices
          </Button>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="border-b bg-slate-50/50">
            <CardTitle className="text-lg font-semibold">Create New Invoice</CardTitle>
            <CardDescription>
              Create an invoice for a completed work order
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex border-b">
              {steps.map((step, idx) => (
                <button
                  key={step.number}
                  onClick={() => step.number <= currentStep && setCurrentStep(step.number as FormStep)}
                  disabled={step.number > currentStep}
                  className={cn(
                    "flex-1 py-4 px-2 text-center text-sm font-medium transition-colors relative",
                    currentStep === step.number
                      ? "text-[#711419] bg-white"
                      : step.number < currentStep
                      ? "text-slate-600 hover:text-slate-900"
                      : "text-slate-400"
                  )}
                  data-testid={`step-${step.number}`}
                >
                  <span className="flex items-center justify-center gap-2">
                    <span
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-xs",
                        currentStep === step.number
                          ? "bg-[#711419] text-white"
                          : step.number < currentStep
                          ? "bg-green-500 text-white"
                          : "bg-slate-200 text-slate-500"
                      )}
                    >
                      {step.number < currentStep ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        step.number
                      )}
                    </span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </span>
                  {currentStep === step.number && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#711419]" />
                  )}
                </button>
              ))}
            </div>

            <div ref={stepContainerRef} className="p-6">
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold mb-1">How would you like to create this invoice?</h3>
                    <p className="text-sm text-slate-500">
                      Choose to build manually or import from an accepted quote
                    </p>
                  </div>

                  <RadioGroup
                    value={formData.mode}
                    onValueChange={(v) => updateField("mode", v as "manual" | "from-quote")}
                    className="grid gap-4"
                  >
                    {INVOICE_MODES.map((mode) => {
                      const Icon = mode.icon;
                      return (
                        <label
                          key={mode.value}
                          className={cn(
                            "flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all",
                            formData.mode === mode.value
                              ? "border-[#711419] bg-red-50/50"
                              : "border-slate-200 hover:border-slate-300"
                          )}
                          data-testid={`mode-${mode.value}`}
                        >
                          <RadioGroupItem value={mode.value} className="mt-1" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 font-medium">
                              <Icon className="h-4 w-4 text-[#711419]" />
                              {mode.label}
                            </div>
                            <p className="text-sm text-slate-500 mt-1">
                              {mode.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </RadioGroup>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold mb-1">Select Work Order</h3>
                    <p className="text-sm text-slate-500">
                      Invoices must be tied to a work order
                    </p>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search by title, number, or customer..."
                      value={workOrderSearch}
                      onChange={(e) => setWorkOrderSearch(e.target.value)}
                      className="pl-9"
                      data-testid="input-work-order-search"
                    />
                  </div>

                  <div className="max-h-80 overflow-y-auto border rounded-lg">
                    {workOrdersLoading ? (
                      <div className="p-4 space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} className="h-16 w-full" />
                        ))}
                      </div>
                    ) : filteredWorkOrders.length === 0 ? (
                      <div className="p-8 text-center text-slate-500">
                        <ClipboardList className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                        No work orders found
                      </div>
                    ) : (
                      <div className="divide-y">
                        {filteredWorkOrders.map((wo) => (
                          <button
                            key={wo.id}
                            onClick={() => {
                              setSelectedWorkOrder(wo);
                              updateField("workOrderId", wo.id);
                              setFormData(prev => ({
                                ...prev,
                                customerName: wo.customerName || wo.customer?.name || "",
                                customerEmail: wo.customer?.email || "",
                                customerPhone: wo.customer?.phone || "",
                                serviceAddress: wo.customer?.fullAddress || "",
                              }));
                            }}
                            className={cn(
                              "w-full p-4 text-left hover:bg-slate-50 transition-colors",
                              formData.workOrderId === wo.id && "bg-red-50"
                            )}
                            data-testid={`work-order-${wo.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">
                                  WO #{wo.workOrderNumber} - {wo.title || "Untitled"}
                                </div>
                                <div className="text-sm text-slate-500">
                                  {wo.customerName || wo.customer?.name || "No customer"}
                                </div>
                              </div>
                              <div className="text-right">
                                <Badge variant="outline" className="text-xs">
                                  {wo.visitType || wo.workSubtype}
                                </Badge>
                                {wo.scheduledStart && (
                                  <div className="text-xs text-slate-400 mt-1">
                                    {format(new Date(wo.scheduledStart), "MMM d, yyyy")}
                                  </div>
                                )}
                              </div>
                            </div>
                            {formData.workOrderId === wo.id && (
                              <div className="mt-2 flex items-center text-[#711419] text-sm">
                                <Check className="h-4 w-4 mr-1" />
                                Selected
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {currentStep === 3 && formData.mode === "from-quote" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold mb-1">Select Quote</h3>
                    <p className="text-sm text-slate-500">
                      Choose an accepted quote to create an invoice from
                    </p>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search by quote number, title, or customer..."
                      value={quoteSearch}
                      onChange={(e) => setQuoteSearch(e.target.value)}
                      className="pl-9"
                      data-testid="input-quote-search"
                    />
                  </div>

                  <div className="max-h-80 overflow-y-auto border rounded-lg">
                    {quotesLoading ? (
                      <div className="p-4 space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} className="h-16 w-full" />
                        ))}
                      </div>
                    ) : filteredQuotes.length === 0 ? (
                      <div className="p-8 text-center text-slate-500">
                        <FileText className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                        No accepted quotes found
                      </div>
                    ) : (
                      <div className="divide-y">
                        {filteredQuotes.map((quote) => (
                          <button
                            key={quote.id}
                            onClick={() => {
                              setSelectedQuote(quote);
                              updateField("quoteId", quote.id);
                            }}
                            className={cn(
                              "w-full p-4 text-left hover:bg-slate-50 transition-colors",
                              formData.quoteId === quote.id && "bg-red-50"
                            )}
                            data-testid={`quote-${quote.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">
                                  {quote.quoteNumber} - {quote.title || "Untitled"}
                                </div>
                                <div className="text-sm text-slate-500">
                                  {quote.customerName || "No customer"}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-medium text-[#711419]">
                                  {formatCurrency(parseFloat(quote.total || "0"))}
                                </div>
                                {quote.acceptedAt && (
                                  <div className="text-xs text-slate-400 mt-1">
                                    Accepted {format(new Date(quote.acceptedAt), "MMM d")}
                                  </div>
                                )}
                              </div>
                            </div>
                            {formData.quoteId === quote.id && (
                              <div className="mt-2 flex items-center text-[#711419] text-sm">
                                <Check className="h-4 w-4 mr-1" />
                                Selected
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {currentStep === 3 && formData.mode === "manual" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold mb-1">Line Items</h3>
                      <p className="text-sm text-slate-500">
                        Add items, services, or parts to this invoice
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setItemSearchOpen(true)}
                        data-testid="button-add-from-catalog"
                      >
                        <Package className="h-4 w-4 mr-1" />
                        From Catalog
                      </Button>
                      <Button
                        size="sm"
                        onClick={addLineItem}
                        className="bg-[#711419] hover:bg-[#5a1014] text-white"
                        data-testid="button-add-line-item"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Item
                      </Button>
                    </div>
                  </div>

                  {formData.lineItems.length === 0 ? (
                    <div className="border-2 border-dashed rounded-lg p-8 text-center">
                      <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 mb-2">No items added yet</p>
                      <p className="text-sm text-slate-400">
                        Click "Add Item" or "From Catalog" to add line items
                      </p>
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50">
                            <TableHead className="w-[40%]">Description</TableHead>
                            <TableHead className="w-[15%]">Type</TableHead>
                            <TableHead className="w-[10%] text-right">Qty</TableHead>
                            <TableHead className="w-[15%] text-right">Price</TableHead>
                            <TableHead className="w-[15%] text-right">Total</TableHead>
                            <TableHead className="w-[5%]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {formData.lineItems.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                <Input
                                  value={item.description}
                                  onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                                  placeholder="Item description"
                                  className="h-8"
                                  data-testid={`input-description-${item.id}`}
                                />
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={item.lineType}
                                  onValueChange={(v) => updateLineItem(item.id, { lineType: v as LineItem["lineType"] })}
                                >
                                  <SelectTrigger className="h-8" data-testid={`select-type-${item.id}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="part">Part</SelectItem>
                                    <SelectItem value="labor">Labor</SelectItem>
                                    <SelectItem value="service">Service</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => updateLineItem(item.id, { quantity: parseInt(e.target.value) || 1 })}
                                  className="h-8 text-right"
                                  data-testid={`input-qty-${item.id}`}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.unitPrice}
                                  onChange={(e) => updateLineItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                                  className="h-8 text-right"
                                  data-testid={`input-price-${item.id}`}
                                />
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(item.quantity * item.unitPrice)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeLineItem(item.id)}
                                  className="h-8 w-8 p-0 text-slate-400 hover:text-red-600"
                                  data-testid={`button-remove-${item.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      <div className="border-t bg-slate-50 p-4">
                        <div className="flex justify-end">
                          <div className="w-64 space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Subtotal</span>
                              <span className="font-medium">{formatCurrency(calculateSubtotal())}</span>
                            </div>
                            <div className="flex justify-between text-sm items-center">
                              <span className="text-slate-600">Tax ({formData.taxRate}%)</span>
                              <span className="font-medium">{formatCurrency(calculateTax())}</span>
                            </div>
                            <div className="border-t pt-2 flex justify-between">
                              <span className="font-semibold">Total</span>
                              <span className="font-bold text-lg text-[#711419]">
                                {formatCurrency(calculateTotal())}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold mb-1">Review Invoice</h3>
                    <p className="text-sm text-slate-500">
                      Confirm the details before creating the invoice
                    </p>
                  </div>

                  <div className="grid gap-4">
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm font-medium">Work Order</CardTitle>
                      </CardHeader>
                      <CardContent className="py-3">
                        {selectedWorkOrder ? (
                          <div>
                            <div className="font-medium">
                              WO #{selectedWorkOrder.workOrderNumber} - {selectedWorkOrder.title}
                            </div>
                            <div className="text-sm text-slate-500">
                              {selectedWorkOrder.customerName || selectedWorkOrder.customer?.name}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">No work order selected</span>
                        )}
                      </CardContent>
                    </Card>

                    {formData.mode === "from-quote" && selectedQuote && (
                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm font-medium">Quote</CardTitle>
                        </CardHeader>
                        <CardContent className="py-3">
                          <div className="flex justify-between">
                            <div>
                              <div className="font-medium">{selectedQuote.quoteNumber}</div>
                              <div className="text-sm text-slate-500">{selectedQuote.title}</div>
                            </div>
                            <div className="text-right font-bold text-[#711419]">
                              {formatCurrency(parseFloat(selectedQuote.total || "0"))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {formData.mode === "manual" && (
                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm font-medium">
                            Line Items ({formData.lineItems.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="py-3">
                          <div className="space-y-2">
                            {formData.lineItems.map((item) => (
                              <div key={item.id} className="flex justify-between text-sm">
                                <span>
                                  {item.quantity}x {item.description || "Untitled item"}
                                </span>
                                <span className="font-medium">
                                  {formatCurrency(item.quantity * item.unitPrice)}
                                </span>
                              </div>
                            ))}
                            <div className="border-t pt-2 mt-2 flex justify-between font-semibold">
                              <span>Total</span>
                              <span className="text-[#711419]">{formatCurrency(calculateTotal())}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="notes">Invoice Notes (Optional)</Label>
                        <Textarea
                          id="notes"
                          value={formData.notes}
                          onChange={(e) => updateField("notes", e.target.value)}
                          placeholder="Add any notes for this invoice..."
                          className="mt-1"
                          data-testid="input-notes"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t p-4 flex justify-between">
              <Button
                variant="outline"
                onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1) as FormStep)}
                disabled={currentStep === 1}
                data-testid="button-prev"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>

              {currentStep < 4 ? (
                <Button
                  onClick={() => setCurrentStep((prev) => Math.min(4, prev + 1) as FormStep)}
                  disabled={!canProceed()}
                  className="bg-[#711419] hover:bg-[#5a1014] text-white"
                  data-testid="button-next"
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={createInvoiceMutation.isPending || createFromQuoteMutation.isPending}
                  className="bg-[#711419] hover:bg-[#5a1014] text-white"
                  data-testid="button-create-invoice"
                >
                  {(createInvoiceMutation.isPending || createFromQuoteMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  )}
                  Create Invoice
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={itemSearchOpen} onOpenChange={setItemSearchOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Add from Catalog</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search parts, services..."
                  value={itemSearchQuery}
                  onChange={(e) => setItemSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-catalog-search"
                />
              </div>
              <Select value={catalogCategoryFilter} onValueChange={(v) => setCatalogCategoryFilter(v as any)}>
                <SelectTrigger className="w-40" data-testid="select-catalog-category">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="install">Install</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="max-h-80 overflow-y-auto border rounded-lg">
              {filteredCatalogItems.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <Package className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                  No items found
                </div>
              ) : (
                <div className="divide-y">
                  {filteredCatalogItems.slice(0, 50).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => addFromCatalog(item)}
                      className="w-full p-3 text-left hover:bg-slate-50 transition-colors"
                      data-testid={`catalog-item-${item.id}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-sm">
                            {item.name || item.description}
                          </div>
                          {item.partNumber && (
                            <div className="text-xs text-slate-500">{item.partNumber}</div>
                          )}
                        </div>
                        <div className="font-medium text-[#711419]">
                          {formatCurrency(parseFloat(item.rate || "0"))}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemSearchOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
