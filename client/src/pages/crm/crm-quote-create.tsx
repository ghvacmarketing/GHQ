import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
  ArrowLeft,
  ArrowRight,
  Zap,
  FileText,
  Check,
  Plus,
  Trash2,
  Calculator,
  Tag,
  Search,
  User,
  Loader2,
  Package,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser, CrmCustomer, CrmItem } from "@shared/schema";

const QUOTE_TYPES = [
  {
    value: "quick",
    label: "Quick Quote",
    description: "Create a simple quote with line items",
    icon: Zap,
  },
  {
    value: "proposal",
    label: "From Proposal Builder",
    description: "Build a detailed proposal with templates",
    icon: FileText,
  },
  {
    value: "worksheet",
    label: "Install Pricing Worksheet (Manual)",
    description: "Calculate install pricing with labor, materials, and margins",
    icon: Calculator,
  },
];

type FormStep = 1 | 2 | 3 | 4;

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineType?: "item" | "discount";
  taxable?: boolean;
  isDiscountLine?: boolean;
  discountKind?: "promotion" | "maintenance";
  itemCategory?: "install" | "service" | "maintenance";
  crmItemId?: string;
}

interface FormData {
  quoteType: "quick" | "proposal";
  customerId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceAddress: string;
  title: string;
  description: string;
  lineItems: LineItem[];
  notes: string;
}

const initialFormData: FormData = {
  quoteType: "quick",
  customerId: null,
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  serviceAddress: "",
  title: "",
  description: "",
  lineItems: [],
  notes: "",
};

export default function CrmQuoteCreate() {
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState<FormStep>(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [discountKind, setDiscountKind] = useState<"promotion" | "maintenance">("promotion");
  const [discountMode, setDiscountMode] = useState<"amount" | "percentage">("amount");
  const [discountValue, setDiscountValue] = useState("");

  // Customer search state
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CrmCustomer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // CRM Items catalog state
  const [itemsCatalogOpen, setItemsCatalogOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "install" | "service" | "maintenance">("all");

  // Customer search query
  const { data: customerSearchResults, isLoading: isSearchingCustomers } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/crm/customers", "search", customerSearch],
    queryFn: async () => {
      if (!customerSearch.trim()) return [];
      const response = await fetch(`/api/crm/customers?search=${encodeURIComponent(customerSearch)}`);
      if (!response.ok) throw new Error("Failed to search customers");
      const data = await response.json();
      return data.customers || [];
    },
    enabled: customerSearch.trim().length >= 2,
  });

  // CRM Items search query
  const { data: itemSearchResults, isLoading: isSearchingItems } = useQuery<CrmItem[]>({
    queryKey: ["/api/crm/items", "search", itemSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (itemSearch.trim()) {
        params.set("search", itemSearch.trim());
      }
      const response = await fetch(`/api/crm/items?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to search items");
      const data = await response.json();
      return data.items || data || [];
    },
    enabled: itemsCatalogOpen,
  });

  const handleAddItemFromCatalog = (item: CrmItem) => {
    const newLineItem: LineItem = {
      id: Date.now().toString(),
      description: item.name,
      quantity: 1,
      unitPrice: parseFloat(item.rate || "0"),
      itemCategory: (item.category as "install" | "service" | "maintenance") || "install",
      taxable: item.taxable ?? true,
      crmItemId: item.id,
    };
    updateField("lineItems", [...formData.lineItems, newLineItem]);
    setItemsCatalogOpen(false);
    setItemSearch("");
    setCategoryFilter("all");
    toast({
      title: "Item Added",
      description: `"${item.name}" has been added to line items.`,
    });
  };

  const filteredItems = itemSearchResults?.filter(item => {
    if (categoryFilter === "all") return true;
    return item.category === categoryFilter;
  }) || [];

  const handleCustomerSelect = (customer: CrmCustomer) => {
    setSelectedCustomer(customer);
    setFormData(prev => ({
      ...prev,
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email || "",
      customerPhone: customer.phone || "",
      serviceAddress: customer.fullAddress || "",
    }));
    setCustomerSearch("");
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setFormData(prev => ({
      ...prev,
      customerId: null,
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      serviceAddress: "",
    }));
  };

  useEffect(() => {
    setTimeout(() => {
      if (stepContainerRef.current) {
        const firstInput = stepContainerRef.current.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          'input:not([type="hidden"]):not([disabled]), textarea:not([disabled])'
        );
        if (firstInput) {
          firstInput.focus();
        }
      }
    }, 100);
  }, [currentStep]);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleQuoteTypeSelect = (type: "quick" | "proposal" | "worksheet") => {
    if (type === "proposal") {
      navigate("/crm/quotes/proposal");
      return;
    }
    if (type === "worksheet") {
      navigate("/crm/quotes/install-worksheet/new");
      return;
    }
    updateField("quoteType", type);
    setCurrentStep(2);
  };

  const addLineItem = () => {
    const newItem: LineItem = {
      id: Date.now().toString(),
      description: "",
      quantity: 1,
      unitPrice: 0,
      itemCategory: "install",
    };
    updateField("lineItems", [...formData.lineItems, newItem]);
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: string | number) => {
    const updated = formData.lineItems.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    );
    updateField("lineItems", updated);
  };

  const removeLineItem = (id: string) => {
    const item = formData.lineItems.find(i => i.id === id);
    if (item?.isDiscountLine || formData.lineItems.filter(i => !i.isDiscountLine).length > 1) {
      updateField("lineItems", formData.lineItems.filter(i => i.id !== id));
    }
  };

  const calculateSubtotal = () => {
    return formData.lineItems
      .filter(item => !item.isDiscountLine && item.unitPrice > 0)
      .reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  };

  const calculateDiscounts = () => {
    return formData.lineItems
      .filter(item => item.isDiscountLine)
      .reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateDiscounts();
  };

  const calculateEligibleSubtotal = (kind: "promotion" | "maintenance") => {
    return formData.lineItems
      .filter(item => {
        if (item.isDiscountLine || item.unitPrice <= 0) return false;
        const category = item.itemCategory || "install";
        if (kind === "promotion") {
          return category === "install" || category === "service";
        } else {
          return category === "maintenance";
        }
      })
      .reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  };

  const hasDiscount = (kind: "promotion" | "maintenance") => {
    return formData.lineItems.some(item => item.isDiscountLine && item.discountKind === kind);
  };

  const openDiscountModal = () => {
    setDiscountKind("promotion");
    setDiscountMode("amount");
    setDiscountValue("");
    setDiscountModalOpen(true);
  };

  const applyDiscount = () => {
    const value = parseFloat(discountValue);
    if (isNaN(value) || value <= 0) {
      toast({
        title: "Invalid Value",
        description: "Please enter a valid positive number for the discount.",
        variant: "destructive",
      });
      return;
    }

    if (hasDiscount(discountKind)) {
      toast({
        title: "Discount Exists",
        description: `A ${discountKind} discount already exists. Remove it first to add a new one.`,
        variant: "destructive",
      });
      return;
    }

    const regularItems = formData.lineItems.filter(
      item => !item.isDiscountLine && item.description.trim() && item.unitPrice > 0
    );

    if (regularItems.length === 0) {
      toast({
        title: "No Eligible Items",
        description: "Add line items with prices before applying a discount.",
        variant: "destructive",
      });
      return;
    }

    let discountAmount: number;
    if (discountMode === "amount") {
      discountAmount = value;
    } else {
      const eligibleSubtotal = calculateEligibleSubtotal(discountKind);
      if (eligibleSubtotal <= 0) {
        toast({
          title: "No Eligible Items",
          description: discountKind === "promotion" 
            ? "No install or service items found to apply promotion discount."
            : "No maintenance items found to apply maintenance discount.",
          variant: "destructive",
        });
        return;
      }
      discountAmount = eligibleSubtotal * (value / 100);
    }

    const discountItem: LineItem = {
      id: `discount-${discountKind}-${Date.now()}`,
      description: discountKind === "promotion" ? "Promotion Discount" : "Maintenance Discount",
      quantity: 1,
      unitPrice: -Math.abs(discountAmount),
      lineType: "discount",
      taxable: false,
      isDiscountLine: true,
      discountKind: discountKind,
    };

    updateField("lineItems", [...formData.lineItems, discountItem]);
    setDiscountModalOpen(false);
    toast({
      title: "Discount Applied",
      description: `${discountItem.description} of $${Math.abs(discountAmount).toFixed(2)} has been applied.`,
    });
  };

  const handleNext = () => {
    if (currentStep < 4 && canProceed(currentStep)) {
      setCurrentStep((prev) => (prev + 1) as FormStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as FormStep);
    }
  };

  const handleCreateQuote = async () => {
    if (isSubmitting) return;

    const validLineItems = formData.lineItems.filter(item => item.description.trim().length > 0);
    if (validLineItems.length === 0) {
      toast({
        title: "Error",
        description: "At least one line item with a description is required.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.customerId) {
      toast({
        title: "Error",
        description: "Please select a customer.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiRequest("POST", "/api/crm/quotes/quick", {
        customerId: formData.customerId,
        title: formData.title || "Quick Quote",
        description: formData.description || undefined,
        notes: formData.notes || undefined,
        lineItems: validLineItems.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxable: item.taxable !== false,
          isDiscountLine: item.isDiscountLine || false,
          discountKind: item.discountKind,
          lineType: item.isDiscountLine ? "discount" : "part",
        })),
      });

      const data = await response.json();
      
      toast({
        title: "Quote Created",
        description: "Your quote has been created successfully.",
      });

      navigate(`/crm/quotes/${data.quoteId}`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create quote. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const canProceed = (step: FormStep): boolean => {
    switch (step) {
      case 1:
        return true;
      case 2:
        return formData.customerId !== null;
      case 3:
        return formData.lineItems.some(item => item.description.trim().length > 0);
      case 4:
        return true;
      default:
        return true;
    }
  };

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
    { number: 1, label: "Quote Type" },
    { number: 2, label: "Customer Info" },
    { number: 3, label: "Line Items" },
    { number: 4, label: "Review" },
  ];

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/crm/quotes")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-page-title">Create New Quote</h1>
            <p className="text-slate-500 text-sm mt-1">Choose how you want to create your quote</p>
          </div>
        </div>

        <div className="flex items-center justify-between mb-8">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center">
              <div
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors",
                  currentStep === step.number
                    ? "border-[#d3b07d] bg-[#d3b07d] text-white"
                    : currentStep > step.number
                    ? "border-green-500 bg-green-500 text-white"
                    : "border-slate-300 bg-white text-slate-400"
                )}
                data-testid={`step-indicator-${step.number}`}
              >
                {currentStep > step.number ? <Check className="h-5 w-5" /> : step.number}
              </div>
              <span
                className={cn(
                  "ml-2 text-sm font-medium hidden sm:block",
                  currentStep === step.number ? "text-[#d3b07d]" : "text-slate-500"
                )}
              >
                {step.label}
              </span>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "w-12 lg:w-24 h-0.5 mx-2",
                    currentStep > step.number ? "bg-green-500" : "bg-slate-200"
                  )}
                />
              )}
            </div>
          ))}
        </div>

        <Card className="bg-white shadow-sm">
          <CardContent ref={stepContainerRef} className="p-6">
            {currentStep === 1 && (
              <div className="space-y-6">
                <CardHeader className="px-0 pt-0">
                  <CardTitle>Select Quote Type</CardTitle>
                  <CardDescription>Choose how you want to create your quote</CardDescription>
                </CardHeader>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {QUOTE_TYPES.map((type) => {
                    const Icon = type.icon;
                    const isSelected = formData.quoteType === type.value;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => handleQuoteTypeSelect(type.value as "quick" | "proposal" | "worksheet")}
                        className={cn(
                          "flex flex-col items-center p-6 rounded-lg border-2 transition-all text-left",
                          isSelected
                            ? "border-[#d3b07d] bg-[#faf6ef]"
                            : "border-slate-200 hover:border-[#e5cfa6] hover:bg-slate-50"
                        )}
                        data-testid={`select-type-${type.value}`}
                      >
                        <div
                          className={cn(
                            "p-3 rounded-full mb-3",
                            isSelected ? "bg-[#d3b07d] text-white" : "bg-slate-100 text-slate-600"
                          )}
                        >
                          <Icon className="h-6 w-6" />
                        </div>
                        <h3 className={cn("font-semibold", isSelected ? "text-[#b8944d]" : "text-slate-900")}>
                          {type.label}
                        </h3>
                        <p className="text-sm text-slate-500 text-center mt-1">{type.description}</p>
                        {isSelected && (
                          <div className="mt-3">
                            <Check className="h-5 w-5 text-[#d3b07d]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6">
                <CardHeader className="px-0 pt-0">
                  <CardTitle>Customer Information</CardTitle>
                  <CardDescription>Search and select a customer from the database</CardDescription>
                </CardHeader>
                
                {/* Customer Search/Selection */}
                {!selectedCustomer ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="customerSearch">Search Customer *</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          id="customerSearch"
                          placeholder="Search by name, phone, email, or address..."
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          className="pl-10"
                          data-testid="input-customer-search"
                        />
                        {isSearchingCustomers && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
                        )}
                      </div>
                    </div>

                    {/* Search Results */}
                    {customerSearch.trim().length >= 2 && (
                      <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                        {isSearchingCustomers ? (
                          <div className="p-4 text-center text-slate-500">
                            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                            Searching...
                          </div>
                        ) : customerSearchResults && customerSearchResults.length > 0 ? (
                          <div className="divide-y">
                            {customerSearchResults.map((customer) => (
                              <button
                                key={customer.id}
                                type="button"
                                onClick={() => handleCustomerSelect(customer)}
                                className="w-full p-3 text-left hover:bg-slate-50 transition-colors"
                                data-testid={`customer-result-${customer.id}`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="p-2 bg-slate-100 rounded-full">
                                    <User className="h-4 w-4 text-slate-600" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-slate-900 truncate">{customer.name}</p>
                                    <p className="text-sm text-slate-500 truncate">
                                      {customer.phone || customer.email || "No contact info"}
                                    </p>
                                    {customer.fullAddress && (
                                      <p className="text-sm text-slate-400 truncate">{customer.fullAddress}</p>
                                    )}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="p-4 text-center text-slate-500">
                            No customers found matching "{customerSearch}"
                          </div>
                        )}
                      </div>
                    )}

                    {customerSearch.trim().length > 0 && customerSearch.trim().length < 2 && (
                      <p className="text-sm text-slate-500">Type at least 2 characters to search</p>
                    )}
                  </div>
                ) : (
                  /* Selected Customer Display */
                  <div className="border-2 border-[#d3b07d] bg-[#faf6ef] rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-[#d3b07d] rounded-full">
                          <User className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{selectedCustomer.name}</p>
                          {selectedCustomer.phone && (
                            <p className="text-sm text-slate-600">{selectedCustomer.phone}</p>
                          )}
                          {selectedCustomer.email && (
                            <p className="text-sm text-slate-600">{selectedCustomer.email}</p>
                          )}
                          {selectedCustomer.fullAddress && (
                            <p className="text-sm text-slate-500 mt-1">{selectedCustomer.fullAddress}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearCustomer}
                        className="text-slate-500 hover:text-slate-700"
                        data-testid="button-clear-customer"
                      >
                        Change
                      </Button>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="title">Quote Title</Label>
                  <Input
                    id="title"
                    placeholder="HVAC Service Quote"
                    value={formData.title}
                    onChange={(e) => updateField("title", e.target.value)}
                    data-testid="input-quote-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of the quote..."
                    value={formData.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    rows={3}
                    data-testid="input-quote-description"
                  />
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6">
                <CardHeader className="px-0 pt-0">
                  <CardTitle>Line Items</CardTitle>
                  <CardDescription>Add items to your quote</CardDescription>
                </CardHeader>
                <div className="space-y-4">
                  {formData.lineItems.filter(item => !item.isDiscountLine).map((item, index) => (
                    <div key={item.id} className="flex gap-4 items-start p-4 border rounded-lg bg-slate-50">
                      <div className="w-32 space-y-2">
                        <Label htmlFor={`item-cat-${item.id}`}>Category</Label>
                        <Select
                          value={item.itemCategory || "install"}
                          onValueChange={(value) => updateLineItem(item.id, "itemCategory", value as "install" | "service" | "maintenance")}
                        >
                          <SelectTrigger id={`item-cat-${item.id}`} data-testid={`select-line-item-category-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="install">Install</SelectItem>
                            <SelectItem value="service">Service</SelectItem>
                            <SelectItem value="maintenance">Maintenance</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label htmlFor={`item-desc-${item.id}`}>Description</Label>
                        <Input
                          id={`item-desc-${item.id}`}
                          placeholder="Service or product description"
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                          data-testid={`input-line-item-description-${index}`}
                        />
                      </div>
                      <div className="w-24 space-y-2">
                        <Label htmlFor={`item-qty-${item.id}`}>Qty</Label>
                        <Input
                          id={`item-qty-${item.id}`}
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value) || 1)}
                          data-testid={`input-line-item-quantity-${index}`}
                        />
                      </div>
                      <div className="w-32 space-y-2">
                        <Label htmlFor={`item-price-${item.id}`}>Unit Price</Label>
                        <Input
                          id={`item-price-${item.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateLineItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                          data-testid={`input-line-item-price-${index}`}
                        />
                      </div>
                      <div className="w-24 space-y-2">
                        <Label>Total</Label>
                        <div className="h-10 flex items-center text-sm font-medium">
                          ${(item.quantity * item.unitPrice).toFixed(2)}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mt-8"
                        onClick={() => removeLineItem(item.id)}
                        disabled={formData.lineItems.filter(i => !i.isDiscountLine).length === 1}
                        data-testid={`button-remove-line-item-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>

                {formData.lineItems.filter(item => item.isDiscountLine).length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-slate-600">Applied Discounts</Label>
                    {formData.lineItems.filter(item => item.isDiscountLine).map((item) => (
                      <div 
                        key={item.id} 
                        className="flex justify-between items-center p-3 border border-red-200 rounded-lg bg-red-50"
                        data-testid={`discount-line-${item.discountKind}`}
                      >
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-red-600" />
                          <span className="text-red-700 font-medium">{item.description}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-red-600 font-semibold">
                            -${Math.abs(item.unitPrice).toFixed(2)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeLineItem(item.id)}
                            data-testid={`button-remove-discount-${item.discountKind}`}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 flex-wrap">
                  <Button 
                    variant="outline" 
                    onClick={() => setItemsCatalogOpen(true)}
                    className="border-blue-400 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                    data-testid="button-add-from-catalog"
                  >
                    <Package className="h-4 w-4 mr-2" />
                    Add from Items Catalog
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={openDiscountModal}
                    className="border-[#d3b07d] text-[#b8944d] hover:bg-[#faf6ef] hover:text-[#9a7d3f]"
                    data-testid="button-add-discount"
                  >
                    <Tag className="h-4 w-4 mr-2" />
                    Add Discount
                  </Button>
                  <Button variant="outline" onClick={addLineItem} data-testid="button-add-line-item">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Line Item
                  </Button>
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <div className="text-right space-y-1">
                    <div className="flex justify-between gap-8">
                      <span className="text-sm text-slate-500">Subtotal</span>
                      <span className="text-sm font-medium text-slate-700" data-testid="text-quote-subtotal">
                        ${calculateSubtotal().toFixed(2)}
                      </span>
                    </div>
                    {calculateDiscounts() < 0 && (
                      <div className="flex justify-between gap-8">
                        <span className="text-sm text-red-500">Discounts</span>
                        <span className="text-sm font-medium text-red-600" data-testid="text-quote-discounts">
                          -${Math.abs(calculateDiscounts()).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between gap-8 pt-2 border-t">
                      <span className="text-slate-700 font-medium">Total</span>
                      <span className="text-2xl font-bold text-slate-900" data-testid="text-quote-total">
                        ${calculateTotal().toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-6">
                <CardHeader className="px-0 pt-0">
                  <CardTitle>Review Quote</CardTitle>
                  <CardDescription>Review your quote details before creating</CardDescription>
                </CardHeader>
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <h3 className="font-semibold text-slate-900 mb-2">Customer Information</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-slate-500">Name:</span>{" "}
                        <span className="font-medium" data-testid="review-customer-name">{formData.customerName || "—"}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Email:</span>{" "}
                        <span className="font-medium">{formData.customerEmail || "—"}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Phone:</span>{" "}
                        <span className="font-medium">{formData.customerPhone || "—"}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Address:</span>{" "}
                        <span className="font-medium">{formData.serviceAddress || "—"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <h3 className="font-semibold text-slate-900 mb-2">Quote Details</h3>
                    <div className="text-sm space-y-1">
                      <div>
                        <span className="text-slate-500">Title:</span>{" "}
                        <span className="font-medium">{formData.title || "—"}</span>
                      </div>
                      {formData.description && (
                        <div>
                          <span className="text-slate-500">Description:</span>{" "}
                          <span className="font-medium">{formData.description}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <h3 className="font-semibold text-slate-900 mb-2">Line Items</h3>
                    <div className="space-y-2">
                      {formData.lineItems.filter(item => item.description && !item.isDiscountLine).map((item, index) => (
                        <div key={item.id} className="flex justify-between text-sm" data-testid={`review-line-item-${index}`}>
                          <span>
                            {item.description} (x{item.quantity})
                          </span>
                          <span className="font-medium">${(item.quantity * item.unitPrice).toFixed(2)}</span>
                        </div>
                      ))}
                      {formData.lineItems.filter(item => item.isDiscountLine).map((item) => (
                        <div key={item.id} className="flex justify-between text-sm text-red-600" data-testid={`review-discount-${item.discountKind}`}>
                          <span className="flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            {item.description}
                          </span>
                          <span className="font-medium">-${Math.abs(item.unitPrice).toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="pt-2 border-t space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Subtotal</span>
                          <span className="font-medium">${calculateSubtotal().toFixed(2)}</span>
                        </div>
                        {calculateDiscounts() < 0 && (
                          <div className="flex justify-between text-sm text-red-600">
                            <span>Discounts</span>
                            <span className="font-medium">-${Math.abs(calculateDiscounts()).toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-base font-bold pt-1 border-t">
                          <span>Total</span>
                          <span data-testid="review-total">${calculateTotal().toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Additional Notes</Label>
                    <Textarea
                      id="notes"
                      placeholder="Any additional notes for this quote..."
                      value={formData.notes}
                      onChange={(e) => updateField("notes", e.target.value)}
                      rows={3}
                      data-testid="input-notes"
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {currentStep > 1 && (
          <div className="flex justify-between">
            <Button variant="outline" onClick={handleBack} data-testid="button-previous">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
            {currentStep < 4 ? (
              <Button onClick={handleNext} disabled={!canProceed(currentStep)} data-testid="button-next">
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button 
                className="bg-green-600 hover:bg-green-700" 
                onClick={handleCreateQuote}
                disabled={isSubmitting}
                data-testid="button-create-quote"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Create Quote
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </div>

      <Dialog open={discountModalOpen} onOpenChange={setDiscountModalOpen}>
        <DialogContent className="sm:max-w-md" data-testid="discount-modal">
          <DialogHeader>
            <DialogTitle>Add Discount</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <Label>Discount Type</Label>
              <RadioGroup
                value={discountKind}
                onValueChange={(value) => setDiscountKind(value as "promotion" | "maintenance")}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem 
                    value="promotion" 
                    id="discount-promotion" 
                    disabled={hasDiscount("promotion")}
                    data-testid="radio-discount-promotion"
                  />
                  <Label 
                    htmlFor="discount-promotion" 
                    className={cn(hasDiscount("promotion") && "text-slate-400")}
                  >
                    Promotion Discount
                    {hasDiscount("promotion") && <span className="text-xs ml-2">(Already applied)</span>}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem 
                    value="maintenance" 
                    id="discount-maintenance"
                    disabled={hasDiscount("maintenance")}
                    data-testid="radio-discount-maintenance"
                  />
                  <Label 
                    htmlFor="discount-maintenance"
                    className={cn(hasDiscount("maintenance") && "text-slate-400")}
                  >
                    Maintenance Discount
                    {hasDiscount("maintenance") && <span className="text-xs ml-2">(Already applied)</span>}
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <Label>Discount Mode</Label>
              <RadioGroup
                value={discountMode}
                onValueChange={(value) => setDiscountMode(value as "amount" | "percentage")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="amount" id="mode-amount" data-testid="radio-mode-amount" />
                  <Label htmlFor="mode-amount">$ Amount</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="percentage" id="mode-percentage" data-testid="radio-mode-percentage" />
                  <Label htmlFor="mode-percentage">% Percentage</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="discount-value">
                {discountMode === "amount" ? "Discount Amount ($)" : "Discount Percentage (%)"}
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                  {discountMode === "amount" ? "$" : "%"}
                </span>
                <Input
                  id="discount-value"
                  type="number"
                  min="0"
                  step={discountMode === "amount" ? "0.01" : "1"}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountMode === "amount" ? "0.00" : "0"}
                  className="pl-8"
                  data-testid="input-discount-value"
                />
              </div>
              {discountMode === "percentage" && discountValue && (
                <p className="text-sm text-slate-500">
                  ≈ ${(calculateEligibleSubtotal(discountKind) * (parseFloat(discountValue) || 0) / 100).toFixed(2)} off ${calculateEligibleSubtotal(discountKind).toFixed(2)} eligible subtotal
                  <br />
                  <span className="text-xs text-slate-400">
                    {discountKind === "promotion" ? "Applies to install & service items" : "Applies to maintenance items only"}
                  </span>
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setDiscountModalOpen(false)}
              data-testid="button-discount-cancel"
            >
              Cancel
            </Button>
            <Button 
              onClick={applyDiscount}
              className="bg-[#d3b07d] hover:bg-[#b8944d] text-white"
              data-testid="button-discount-apply"
            >
              Apply Discount
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={itemsCatalogOpen} onOpenChange={(open) => {
        setItemsCatalogOpen(open);
        if (!open) {
          setItemSearch("");
          setCategoryFilter("all");
        }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col" data-testid="items-catalog-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Items Catalog
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by name or part number..."
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-item-search"
                />
              </div>
              <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as "all" | "install" | "service" | "maintenance")}>
                <SelectTrigger className="w-[140px]" data-testid="select-category-filter">
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

            <div className="border rounded-lg overflow-hidden flex-1 overflow-y-auto min-h-[300px] max-h-[400px]">
              {isSearchingItems ? (
                <div className="p-8 text-center text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Loading items...
                </div>
              ) : filteredItems.length > 0 ? (
                <div className="divide-y">
                  {filteredItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAddItemFromCatalog(item)}
                      className="w-full p-4 text-left hover:bg-slate-50 transition-colors"
                      data-testid={`item-result-${item.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 truncate">{item.name}</p>
                          <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                            {item.partNumber && (
                              <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">
                                {item.partNumber}
                              </span>
                            )}
                            <span className={cn(
                              "px-2 py-0.5 rounded text-xs capitalize",
                              item.category === "install" && "bg-blue-100 text-blue-700",
                              item.category === "service" && "bg-green-100 text-green-700",
                              item.category === "maintenance" && "bg-amber-100 text-amber-700"
                            )}>
                              {item.category || "install"}
                            </span>
                            {item.taxable && (
                              <span className="text-xs text-slate-400">Taxable</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-slate-900">
                            ${parseFloat(item.rate || "0").toFixed(2)}
                          </p>
                          <p className="text-xs text-slate-400">{item.unit || "each"}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : itemSearchResults && itemSearchResults.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p>No items found</p>
                  {itemSearch && <p className="text-sm">Try a different search term</p>}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500">
                  <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p>Search for items or browse by category</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setItemsCatalogOpen(false)}
              data-testid="button-items-catalog-close"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
