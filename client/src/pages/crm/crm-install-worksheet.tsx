import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  CheckCircle,
  Plus,
  Trash2,
  Loader2,
  Search,
  User,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { calcWorksheet, type WorksheetInputs, type WorksheetLine } from "@shared/calcWorksheet";
import type { CrmUser, CrmCustomer } from "@shared/schema";

type InstallSubtype = "residential" | "commercial" | "crawlspace";
type LineCategory = "equipment" | "materials" | "accessories" | "subcontractor" | "permit" | "spiff" | "other";

const INSTALL_SUBTYPES: { value: InstallSubtype; label: string }[] = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "crawlspace", label: "Crawlspace" },
];

const LINE_CATEGORIES: { value: LineCategory; label: string }[] = [
  { value: "equipment", label: "Equipment" },
  { value: "materials", label: "Materials" },
  { value: "accessories", label: "Accessories" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "permit", label: "Permit" },
  { value: "spiff", label: "Spiff" },
  { value: "other", label: "Other" },
];

interface LocalLine {
  id: string;
  category: LineCategory;
  description: string;
  cost: number;
  taxable: boolean;
}

const defaultInputs: WorksheetInputs = {
  hoursToInstall: 8,
  topManHourlyRate: 35,
  laborBenefitsPct: 0.40,
  overheadPct: 0.25,
  profitPct: 0.10,
  financingPct: 0.03,
  commissionPct: 0.03,
  taxRate: 0.08,
  warrantyReserveDollar: 25,
  crewDayHours: 16,
  discountDollar: 0,
};

export default function CrmInstallWorksheet() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [inputs, setInputs] = useState<WorksheetInputs>(defaultInputs);
  const [installSubtype, setInstallSubtype] = useState<InstallSubtype>("residential");
  const [lines, setLines] = useState<LocalLine[]>([]);

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CrmCustomer | null>(null);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: searchResults, isLoading: searchLoading } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/crm/customers", "search", customerSearch],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers?search=${encodeURIComponent(customerSearch)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to search customers");
      const data = await res.json();
      return data.customers || [];
    },
    enabled: showCustomerModal && customerSearch.length >= 2,
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const finalizeMutation = useMutation({
    mutationFn: async (data: {
      customerId: string;
      installSubtype: string;
      inputs: WorksheetInputs;
      lines: Array<{ category: string; description: string; cost: number; taxable: boolean }>;
    }) => {
      const res = await apiRequest("POST", "/api/crm/quotes/from-worksheet", data);
      return res.json();
    },
    onSuccess: (data: { quoteId: string }) => {
      toast({ title: "Quote created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers"] });
      navigate(`/crm/quotes/${data.quoteId}`);
    },
    onError: (error: Error) => {
      toast({ title: "Error creating quote", description: error.message, variant: "destructive" });
    },
  });

  const handleFinalizeClick = () => {
    if (lines.length === 0) {
      toast({ title: "No line items", description: "Add at least one line item before creating a quote", variant: "destructive" });
      return;
    }
    setShowCustomerModal(true);
  };

  const handleCreateQuote = () => {
    if (!selectedCustomer) {
      toast({ title: "Select a customer", description: "Please search and select a customer", variant: "destructive" });
      return;
    }

    finalizeMutation.mutate({
      customerId: selectedCustomer.id,
      installSubtype,
      inputs,
      lines: lines.map((l) => ({
        category: l.category,
        description: l.description,
        cost: l.cost,
        taxable: l.taxable,
      })),
    });
  };

  const updateInput = <K extends keyof WorksheetInputs>(key: K, value: number) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}`,
        category: "equipment",
        description: "",
        cost: 0,
        taxable: true,
      },
    ]);
  };

  const updateLine = (id: string, field: keyof LocalLine, value: string | number | boolean) => {
    setLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, [field]: value } : line))
    );
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const worksheetLines: WorksheetLine[] = lines.map((l) => ({
    cost: l.cost,
    taxable: l.taxable,
  }));

  const calcs = calcWorksheet(inputs, worksheetLines);

  const linesByCategory = LINE_CATEGORIES.map((cat) => ({
    category: cat,
    items: lines.filter((l) => l.category === cat.value),
  })).filter((group) => group.items.length > 0);

  const isFinalizing = finalizeMutation.isPending;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-3 gap-6">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) return null;

  const formatCurrency = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatPercent = (n: number) => `${(n * 100).toFixed(2)}%`;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/crm/quotes/new")} data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900" data-testid="text-page-title">
                Custom Pricing
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                Calculate install pricing with labor, materials, and margins
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={installSubtype}
              onValueChange={(v) => setInstallSubtype(v as InstallSubtype)}
            >
              <SelectTrigger className="w-40" data-testid="select-install-subtype">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INSTALL_SUBTYPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="bg-[#d3b07d] hover:bg-[#c4a06e] text-white"
              onClick={handleFinalizeClick}
              disabled={isFinalizing || lines.length === 0}
              data-testid="button-finalize"
            >
              {isFinalizing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Finalize → Create Quote
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Inputs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="hoursToInstall">Hours to Install</Label>
                <Input
                  id="hoursToInstall"
                  type="number"
                  step="0.5"
                  min="0"
                  value={inputs.hoursToInstall}
                  onChange={(e) => updateInput("hoursToInstall", parseFloat(e.target.value) || 0)}
                  data-testid="input-hours-to-install"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topManHourlyRate">Top Man Hourly Rate ($)</Label>
                <Input
                  id="topManHourlyRate"
                  type="number"
                  step="1"
                  min="0"
                  value={inputs.topManHourlyRate}
                  onChange={(e) => updateInput("topManHourlyRate", parseFloat(e.target.value) || 0)}
                  data-testid="input-top-man-rate"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="laborBenefitsPct">Labor Benefits (%)</Label>
                <Input
                  id="laborBenefitsPct"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={(inputs.laborBenefitsPct * 100).toFixed(0)}
                  onChange={(e) => updateInput("laborBenefitsPct", (parseFloat(e.target.value) || 0) / 100)}
                  data-testid="input-labor-benefits"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="overheadPct">Overhead (%)</Label>
                <Input
                  id="overheadPct"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={(inputs.overheadPct * 100).toFixed(0)}
                  onChange={(e) => updateInput("overheadPct", (parseFloat(e.target.value) || 0) / 100)}
                  data-testid="input-overhead"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profitPct">Profit (%)</Label>
                <Input
                  id="profitPct"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={(inputs.profitPct * 100).toFixed(0)}
                  onChange={(e) => updateInput("profitPct", (parseFloat(e.target.value) || 0) / 100)}
                  data-testid="input-profit"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="financingPct">Financing (%)</Label>
                <Input
                  id="financingPct"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={(inputs.financingPct * 100).toFixed(0)}
                  onChange={(e) => updateInput("financingPct", (parseFloat(e.target.value) || 0) / 100)}
                  data-testid="input-financing"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commissionPct">Commission (%)</Label>
                <Input
                  id="commissionPct"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={(inputs.commissionPct * 100).toFixed(0)}
                  onChange={(e) => updateInput("commissionPct", (parseFloat(e.target.value) || 0) / 100)}
                  data-testid="input-commission"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxRate">Tax Rate (%)</Label>
                <Input
                  id="taxRate"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={(inputs.taxRate * 100).toFixed(1)}
                  onChange={(e) => updateInput("taxRate", (parseFloat(e.target.value) || 0) / 100)}
                  data-testid="input-tax-rate"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warrantyReserveDollar">Warranty Reserve ($)</Label>
                <Input
                  id="warrantyReserveDollar"
                  type="number"
                  step="1"
                  min="0"
                  value={inputs.warrantyReserveDollar}
                  onChange={(e) => updateInput("warrantyReserveDollar", parseFloat(e.target.value) || 0)}
                  data-testid="input-warranty-reserve"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crewDayHours">Crew Day Hours</Label>
                <Input
                  id="crewDayHours"
                  type="number"
                  step="1"
                  min="1"
                  value={inputs.crewDayHours}
                  onChange={(e) => updateInput("crewDayHours", parseFloat(e.target.value) || 16)}
                  data-testid="input-crew-day-hours"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discountDollar">Discount ($)</Label>
                <Input
                  id="discountDollar"
                  type="number"
                  step="1"
                  min="0"
                  value={inputs.discountDollar}
                  onChange={(e) => updateInput("discountDollar", parseFloat(e.target.value) || 0)}
                  data-testid="input-discount"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Line Items</CardTitle>
                <Button variant="outline" size="sm" onClick={addLine} data-testid="button-add-line">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Line
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {lines.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No line items yet. Click "Add Line" to get started.
                </div>
              ) : (
                <div className="space-y-6">
                  {linesByCategory.map((group) => (
                    <div key={group.category.value}>
                      <h4 className="text-sm font-semibold text-slate-700 mb-2 uppercase tracking-wide border-b pb-1">
                        {group.category.label}
                      </h4>
                      <div className="space-y-2">
                        {group.items.map((line) => (
                          <div
                            key={line.id}
                            className="flex items-center gap-2 p-2 bg-slate-50 rounded-md"
                            data-testid={`line-item-${line.id}`}
                          >
                            <Select
                              value={line.category}
                              onValueChange={(v) => updateLine(line.id, "category", v)}
                            >
                              <SelectTrigger className="w-32" data-testid={`select-category-${line.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {LINE_CATEGORIES.map((c) => (
                                  <SelectItem key={c.value} value={c.value}>
                                    {c.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder="Description"
                              value={line.description}
                              onChange={(e) => updateLine(line.id, "description", e.target.value)}
                              className="flex-1"
                              data-testid={`input-description-${line.id}`}
                            />
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Cost"
                              value={line.cost || ""}
                              onChange={(e) => updateLine(line.id, "cost", parseFloat(e.target.value) || 0)}
                              className="w-28"
                              data-testid={`input-cost-${line.id}`}
                            />
                            <div className="flex items-center gap-1">
                              <Checkbox
                                id={`taxable-${line.id}`}
                                checked={line.taxable}
                                onCheckedChange={(checked) => updateLine(line.id, "taxable", !!checked)}
                                data-testid={`checkbox-taxable-${line.id}`}
                              />
                              <Label htmlFor={`taxable-${line.id}`} className="text-xs">Tax</Label>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeLine(line.id)}
                              data-testid={`button-delete-${line.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {lines.length > 0 && linesByCategory.length === 0 && (
                    lines.map((line) => (
                      <div
                        key={line.id}
                        className="flex items-center gap-2 p-2 bg-slate-50 rounded-md"
                        data-testid={`line-item-${line.id}`}
                      >
                        <Select
                          value={line.category}
                          onValueChange={(v) => updateLine(line.id, "category", v)}
                        >
                          <SelectTrigger className="w-32" data-testid={`select-category-${line.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LINE_CATEGORIES.map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Description"
                          value={line.description}
                          onChange={(e) => updateLine(line.id, "description", e.target.value)}
                          className="flex-1"
                          data-testid={`input-description-${line.id}`}
                        />
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Cost"
                          value={line.cost || ""}
                          onChange={(e) => updateLine(line.id, "cost", parseFloat(e.target.value) || 0)}
                          className="w-28"
                          data-testid={`input-cost-${line.id}`}
                        />
                        <div className="flex items-center gap-1">
                          <Checkbox
                            id={`taxable-${line.id}`}
                            checked={line.taxable}
                            onCheckedChange={(checked) => updateLine(line.id, "taxable", !!checked)}
                            data-testid={`checkbox-taxable-${line.id}`}
                          />
                          <Label htmlFor={`taxable-${line.id}`} className="text-xs">Tax</Label>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(line.id)}
                          data-testid={`button-delete-${line.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Calculated Totals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 pb-3 border-b">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Labor Payroll</span>
                  <span data-testid="calc-labor-payroll">{formatCurrency(calcs.laborPayroll)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Labor Benefits</span>
                  <span data-testid="calc-labor-benefits">{formatCurrency(calcs.laborBenefits)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Lines Total</span>
                  <span data-testid="calc-lines-total">{formatCurrency(calcs.linesTotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Sales Tax</span>
                  <span data-testid="calc-sales-tax">{formatCurrency(calcs.salesTax)}</span>
                </div>
              </div>

              <div className="space-y-2 pb-3 border-b">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Direct Cost</span>
                  <span data-testid="calc-direct-cost">{formatCurrency(calcs.directCost)}</span>
                </div>
              </div>

              <div className="py-3 border-b">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-lg">Sell Price</span>
                  <span className="text-2xl font-bold text-[#d3b07d]" data-testid="calc-sell-price">
                    {formatCurrency(calcs.sellPrice)}
                  </span>
                </div>
              </div>

              <div className="space-y-2 pb-3 border-b">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Gross Profit</span>
                  <span data-testid="calc-gross-profit">{formatCurrency(calcs.grossProfit)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Gross Margin %</span>
                  <span data-testid="calc-gross-margin">{formatPercent(calcs.grossMarginPct)}</span>
                </div>
              </div>

              <div className="space-y-2 pb-3 border-b">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Crew Days</span>
                  <span data-testid="calc-crew-days">{calcs.crewDays.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">GP per Crew Day</span>
                  <span data-testid="calc-gp-per-crew-day">{formatCurrency(calcs.grossProfitPerCrewDay)}</span>
                </div>
              </div>

              {inputs.discountDollar > 0 && (
                <div className="space-y-2 pt-2 bg-amber-50 -mx-4 px-4 py-3 rounded-b-lg">
                  <h4 className="text-sm font-semibold text-amber-800">With Discount</h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-700">Discounted Price</span>
                    <span data-testid="calc-discounted-price">{formatCurrency(calcs.discountedSellPrice)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-700">Discounted GP</span>
                    <span data-testid="calc-discounted-gp">{formatCurrency(calcs.discountedGrossProfit)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-700">Discounted Margin</span>
                    <span data-testid="calc-discounted-margin">{formatPercent(calcs.discountedGrossMarginPct)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-700">Discounted GP/Day</span>
                    <span data-testid="calc-discounted-gp-day">{formatCurrency(calcs.discountedGpPerCrewDay)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showCustomerModal} onOpenChange={setShowCustomerModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Customer for Quote</DialogTitle>
            <DialogDescription>
              Search and select an existing customer for this quote.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search customers..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="pl-10"
                data-testid="input-customer-search"
              />
            </div>

            {searchLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            )}

            {!searchLoading && searchResults && searchResults.length > 0 && (
              <div className="max-h-60 overflow-y-auto space-y-2">
                {searchResults.map((customer) => (
                  <div
                    key={customer.id}
                    className={`p-3 rounded-md border cursor-pointer transition-colors ${
                      selectedCustomer?.id === customer.id
                        ? "border-[#d3b07d] bg-amber-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                    onClick={() => setSelectedCustomer(customer)}
                    data-testid={`customer-option-${customer.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-400" />
                      <span className="font-medium">{customer.name}</span>
                    </div>
                    {customer.email && (
                      <p className="text-sm text-slate-500 ml-6">{customer.email}</p>
                    )}
                    {customer.phone && (
                      <p className="text-sm text-slate-500 ml-6">{customer.phone}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!searchLoading && customerSearch.length >= 2 && searchResults?.length === 0 && (
              <p className="text-center text-slate-500 py-4">No customers found</p>
            )}

            {customerSearch.length < 2 && (
              <p className="text-center text-slate-500 py-4 text-sm">
                Type at least 2 characters to search
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowCustomerModal(false)}
              data-testid="button-cancel-customer"
            >
              Cancel
            </Button>
            <Button
              className="bg-[#d3b07d] hover:bg-[#c4a06e] text-white"
              onClick={handleCreateQuote}
              disabled={isFinalizing}
              data-testid="button-confirm-create-quote"
            >
              {isFinalizing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Create Quote
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
