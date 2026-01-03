import { useEffect, useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Save,
  X,
  Calendar,
  User,
  FileCheck,
  DollarSign,
  Loader2,
  Plus,
  Minus,
  Building2,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format, addMonths, addYears, addDays, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser, MaintenanceRegion, CrmCustomer, CrmProperty, CustomAgreementType } from "@shared/schema";

type CustomersResponse = {
  customers: CrmCustomer[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

function calculateMaintenancePrice(numSystems: number): number {
  let total = 0;
  for (let i = 0; i < numSystems; i++) {
    total += 229 - (10 * i);
  }
  return total;
}

function getPriceBreakdown(numSystems: number): { index: number; price: number }[] {
  const breakdown: { index: number; price: number }[] = [];
  for (let i = 0; i < numSystems; i++) {
    breakdown.push({ index: i + 1, price: 229 - (10 * i) });
  }
  return breakdown;
}

function formatPropertyAddress(property: CrmProperty): string {
  const parts = [property.address1];
  if (property.address2) parts.push(property.address2);
  parts.push(`${property.city}, ${property.state} ${property.zip}`);
  return parts.join(", ");
}

export default function CrmAgreementCreate() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();

  const queryParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const agreementType = queryParams.get("type") || "preventative";
  const customTypeId = queryParams.get("typeId");

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedCustomer, setSelectedCustomer] = useState<CrmCustomer | null>(null);
  const [propertyId, setPropertyId] = useState<string>("");
  const [numberOfSystems, setNumberOfSystems] = useState(1);

  const [agreementPlan, setAgreementPlan] = useState("Preventative Maintenance");
  const [contractDate, setContractDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [appointmentDate, setAppointmentDate] = useState(format(addMonths(new Date(), 1), "yyyy-MM-dd"));
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(addYears(new Date(), 1), "yyyy-MM-dd"));
  const [regionId, setRegionId] = useState("");
  const [autoRenew, setAutoRenew] = useState(true);
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("229.00");
  const [frequency, setFrequency] = useState<"weekly" | "monthly" | "annual">("annual");
  const [visitsPerPeriod, setVisitsPerPeriod] = useState(2);
  const [customTypeApplied, setCustomTypeApplied] = useState(false);

  const isPreventativeMaintenance = agreementType === "preventative";

  useEffect(() => {
    if (isPreventativeMaintenance) {
      const calculatedPrice = calculateMaintenancePrice(numberOfSystems);
      setPrice(calculatedPrice.toFixed(2));
    }
  }, [numberOfSystems, isPreventativeMaintenance]);

  const { data: customAgreementTypes = [] } = useQuery<CustomAgreementType[]>({
    queryKey: ["/api/crm/custom-agreement-types"],
    queryFn: async () => {
      const res = await fetch("/api/crm/custom-agreement-types", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch custom agreement types");
      return res.json();
    },
    enabled: agreementType === "custom" && !!customTypeId,
  });

  useEffect(() => {
    if (agreementType === "custom" && customTypeId && customAgreementTypes.length > 0 && !customTypeApplied) {
      const selectedType = customAgreementTypes.find(t => t.id === customTypeId);
      if (selectedType) {
        setAgreementPlan(selectedType.name);
        setFrequency(selectedType.frequency || "annual");
        setVisitsPerPeriod(selectedType.visitsPerPeriod);
        setPrice(selectedType.defaultPrice || "0.00");
        setCustomTypeApplied(true);
      }
    }
  }, [agreementType, customTypeId, customAgreementTypes, customTypeApplied]);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const { data: customersData, isLoading: customersLoading } = useQuery<CustomersResponse>({
    queryKey: ["/api/crm/customers", customerSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        limit: "50",
      });
      if (customerSearch) {
        params.set("search", customerSearch);
      }
      const res = await fetch(`/api/crm/customers?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const { data: customerProperties = [], isLoading: propertiesLoading } = useQuery<CrmProperty[]>({
    queryKey: ["/api/crm/customers", selectedCustomerId, "properties"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${selectedCustomerId}/properties`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
    enabled: !!selectedCustomerId,
  });

  const { data: regions = [] } = useQuery<MaintenanceRegion[]>({
    queryKey: ["/api/crm/maintenance-regions"],
    queryFn: async () => {
      const res = await fetch("/api/crm/maintenance-regions", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch regions");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const calculateEndDate = (startDateStr: string, freq: "weekly" | "monthly" | "annual") => {
    if (!startDateStr) return "";
    const startDateObj = parseISO(startDateStr);
    if (isPreventativeMaintenance) {
      return format(addYears(startDateObj, 1), "yyyy-MM-dd");
    }
    switch (freq) {
      case "weekly":
        // Weekly: exactly 7 days later
        return format(addDays(startDateObj, 7), "yyyy-MM-dd");
      case "monthly":
        // Monthly: exactly 30 days later
        return format(addDays(startDateObj, 30), "yyyy-MM-dd");
      case "annual":
      default:
        return format(addYears(startDateObj, 1), "yyyy-MM-dd");
    }
  };

  const handleContractDateChange = (newContractDate: string) => {
    setContractDate(newContractDate);
    setInvoiceDate(newContractDate);
    setStartDate(newContractDate);
    if (newContractDate) {
      const contractDateObj = parseISO(newContractDate);
      // For annual agreements: 1 month grace period before first appointment
      // For weekly/monthly: NO grace period - first appointment is same as contract date
      if (frequency === "annual" || isPreventativeMaintenance) {
        setAppointmentDate(format(addMonths(contractDateObj, 1), "yyyy-MM-dd"));
      } else {
        setAppointmentDate(newContractDate); // No grace period for weekly/monthly
      }
      setEndDate(calculateEndDate(newContractDate, frequency));
    }
  };

  useEffect(() => {
    if (contractDate) {
      setEndDate(calculateEndDate(contractDate, frequency));
      // Update appointment date based on frequency
      const contractDateObj = parseISO(contractDate);
      if (frequency === "annual" || isPreventativeMaintenance) {
        setAppointmentDate(format(addMonths(contractDateObj, 1), "yyyy-MM-dd"));
      } else {
        setAppointmentDate(contractDate); // No grace period for weekly/monthly
      }
    }
  }, [frequency, isPreventativeMaintenance]);

  const handleCustomerSelect = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const customer = customersData?.customers.find(c => c.id === customerId);
    setSelectedCustomer(customer || null);
    setPropertyId("");
  };

  const handleNumberOfSystemsChange = (delta: number) => {
    setNumberOfSystems(prev => Math.max(1, prev + delta));
  };

  const selectedProperty = customerProperties.find(p => p.id === propertyId);
  const requiresPropertySelection = customerProperties.length > 1;

  const createAgreementMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) {
        throw new Error("Please select a customer");
      }
      if (!agreementPlan.trim()) {
        throw new Error("Agreement plan name is required");
      }
      if (requiresPropertySelection && !propertyId) {
        throw new Error("Please select a property for this customer");
      }

      const agreementNumber = `AGR-${Date.now().toString(36).toUpperCase()}`;

      const agreementData = {
        agreementNumber,
        customerId: selectedCustomerId,
        customerName: selectedCustomer.name,
        agreementPlan,
        address: selectedProperty 
          ? formatPropertyAddress(selectedProperty)
          : selectedCustomer.fullAddress || "",
        contractDate,
        appointmentDate,
        startDate,
        endDate,
        nextServiceDate: appointmentDate,
        nextInvoiceDate: invoiceDate,
        price: parseFloat(price).toFixed(2),
        regionId: regionId || null,
        propertyId: propertyId || null,
        numberOfSystems,
        autoRenew,
        notes,
        status: "active" as const,
        frequency,
        visitsPerPeriod,
      };

      const res = await apiRequest("POST", "/api/crm/agreements", agreementData);
      const agreement = await res.json();

      return agreement;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/agreements"] });
      toast({ title: "Agreement created successfully" });
      navigate("/crm/agreements");
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Failed to create agreement", variant: "destructive" });
    },
  });

  const handleSave = () => {
    createAgreementMutation.mutate();
  };

  const getScheduledVisits = () => {
    if (!appointmentDate || visitsPerPeriod < 1) return [];
    try {
      const firstVisit = parseISO(appointmentDate);
      const visits: { visitNumber: number; date: string }[] = [];
      
      for (let i = 0; i < visitsPerPeriod; i++) {
        let visitDate: Date;
        
        if (frequency === "weekly") {
          // Weekly: 7 days ÷ visits = spacing between visits
          const daysApart = Math.floor(7 / visitsPerPeriod);
          visitDate = addDays(firstVisit, i * daysApart);
        } else if (frequency === "monthly") {
          // Monthly: 30 days ÷ visits = spacing between visits
          const daysApart = Math.floor(30 / visitsPerPeriod);
          visitDate = addDays(firstVisit, i * daysApart);
        } else {
          // Annual: spread evenly across the year (months apart)
          const monthsApart = Math.max(1, Math.floor(12 / visitsPerPeriod));
          visitDate = addMonths(firstVisit, i * monthsApart);
        }
        
        visits.push({
          visitNumber: i + 1,
          date: format(visitDate, "MMM d, yyyy"),
        });
      }
      
      return visits;
    } catch {
      return [];
    }
  };

  const scheduledVisits = getScheduledVisits();
  const priceBreakdown = getPriceBreakdown(numberOfSystems);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="min-h-screen bg-slate-50">
        <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/crm/agreements")}
                className="text-slate-600 hover:text-slate-900"
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="h-6 w-px bg-slate-200" />
              <h1 className="text-lg font-semibold text-slate-900" data-testid="text-page-title">
                New {isPreventativeMaintenance ? "Maintenance" : agreementPlan} Agreement
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/crm/agreements")}
                data-testid="button-cancel"
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-[#711419] hover:bg-[#5a1014]"
                onClick={handleSave}
                disabled={createAgreementMutation.isPending}
                data-testid="button-save"
              >
                {createAgreementMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Save Agreement
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex gap-6">
            <div className="flex-1 space-y-6">
              <Card data-testid="card-customer-info">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4 text-[#711419]" />
                    Customer & Agreement Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label htmlFor="customer" className="text-sm font-medium">Customer</Label>
                      <Select
                        value={selectedCustomerId}
                        onValueChange={handleCustomerSelect}
                      >
                        <SelectTrigger className="mt-1" data-testid="select-customer">
                          <SelectValue placeholder="Select a customer..." />
                        </SelectTrigger>
                        <SelectContent>
                          {customersData?.customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name} {customer.fullAddress ? `- ${customer.fullAddress}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedCustomerId && customerProperties.length > 0 && (
                      <div className="col-span-2">
                        <Label htmlFor="property" className="text-sm font-medium">
                          Property/Location {requiresPropertySelection && <span className="text-red-500">*</span>}
                        </Label>
                        <Select
                          value={propertyId}
                          onValueChange={setPropertyId}
                        >
                          <SelectTrigger className="mt-1" data-testid="select-property">
                            <SelectValue placeholder="Select a property..." />
                          </SelectTrigger>
                          <SelectContent>
                            {customerProperties.map((property) => (
                              <SelectItem key={property.id} value={property.id}>
                                {formatPropertyAddress(property)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {requiresPropertySelection && !propertyId && (
                          <p className="text-xs text-amber-600 mt-1">
                            This customer has multiple properties. Please select one.
                          </p>
                        )}
                      </div>
                    )}

                    <div className="col-span-2">
                      <Label htmlFor="agreementPlan" className="text-sm font-medium">Agreement Plan Name</Label>
                      <Input
                        id="agreementPlan"
                        value={agreementPlan}
                        onChange={(e) => setAgreementPlan(e.target.value)}
                        className={`mt-1 ${isPreventativeMaintenance ? "bg-slate-100 text-slate-600" : ""}`}
                        placeholder="e.g., Preventative Maintenance"
                        data-testid="input-agreement-plan"
                        disabled={isPreventativeMaintenance}
                      />
                    </div>

                    {isPreventativeMaintenance && (
                      <div className="col-span-2">
                        <Label htmlFor="numberOfSystems" className="text-sm font-medium">Number of Systems</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => handleNumberOfSystemsChange(-1)}
                            disabled={numberOfSystems <= 1}
                            data-testid="button-decrease-systems"
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <Input
                            id="numberOfSystems"
                            type="number"
                            min="1"
                            value={numberOfSystems}
                            onChange={(e) => setNumberOfSystems(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-20 text-center"
                            data-testid="input-number-of-systems"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => handleNumberOfSystemsChange(1)}
                            data-testid="button-increase-systems"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <span className="text-sm text-slate-500 ml-2">
                            (${229} first, ${10} discount per additional)
                          </span>
                        </div>
                      </div>
                    )}

                    {isPreventativeMaintenance ? (
                      <div>
                        <Label htmlFor="frequency" className="text-sm font-medium">Service Frequency</Label>
                        <div className="mt-1 px-3 py-2 bg-slate-100 rounded-md text-sm text-slate-700">
                          Annual (locked for Preventative Maintenance)
                        </div>
                      </div>
                    ) : (
                      <div>
                        <Label htmlFor="frequency" className="text-sm font-medium">Service Frequency</Label>
                        <Select value={frequency} onValueChange={(value: "weekly" | "monthly" | "annual") => setFrequency(value)}>
                          <SelectTrigger className="mt-1" data-testid="select-frequency">
                            <SelectValue placeholder="Select frequency..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="annual">Annual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div>
                      <Label htmlFor="visitsPerPeriod" className="text-sm font-medium">Visits Per Period</Label>
                      <Input
                        id="visitsPerPeriod"
                        type="number"
                        min="1"
                        value={visitsPerPeriod}
                        onChange={(e) => setVisitsPerPeriod(parseInt(e.target.value) || 1)}
                        className={`mt-1 ${isPreventativeMaintenance ? "bg-slate-100 text-slate-600" : ""}`}
                        data-testid="input-visits-per-period"
                        disabled={isPreventativeMaintenance}
                      />
                    </div>

                    <div>
                      <Label htmlFor="contractDate" className="text-sm font-medium">Contract Date</Label>
                      <Input
                        id="contractDate"
                        type="date"
                        value={contractDate}
                        onChange={(e) => handleContractDateChange(e.target.value)}
                        className="mt-1"
                        data-testid="input-contract-date"
                      />
                    </div>

                    <div>
                      <Label htmlFor="invoiceDate" className="text-sm font-medium">Payment Date</Label>
                      <Input
                        id="invoiceDate"
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="mt-1"
                        data-testid="input-invoice-date"
                      />
                    </div>

                    <div>
                      <Label htmlFor="appointmentDate" className="text-sm font-medium">First Appointment Date</Label>
                      <Input
                        id="appointmentDate"
                        type="date"
                        value={appointmentDate}
                        onChange={(e) => setAppointmentDate(e.target.value)}
                        className="mt-1"
                        data-testid="input-appointment-date"
                      />
                    </div>

                    <div>
                      <Label htmlFor="region" className="text-sm font-medium">Region</Label>
                      <Select value={regionId} onValueChange={setRegionId}>
                        <SelectTrigger className="mt-1" data-testid="select-region">
                          <SelectValue placeholder="Select region..." />
                        </SelectTrigger>
                        <SelectContent>
                          {regions.map((region) => (
                            <SelectItem key={region.id} value={region.id}>
                              {region.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="price" className="text-sm font-medium">Agreement Price</Label>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-sm text-slate-500">$</span>
                        <Input
                          id="price"
                          type="number"
                          step="0.01"
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          placeholder="0.00"
                          data-testid="input-price"
                          className={isPreventativeMaintenance ? "bg-slate-100 text-slate-600" : ""}
                          disabled={isPreventativeMaintenance}
                        />
                      </div>
                      {isPreventativeMaintenance && (
                        <p className="text-xs text-slate-500 mt-1">Auto-calculated from number of systems</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
                      <div>
                        <Label className="text-sm font-medium">Auto-Renew</Label>
                        <p className="text-xs text-slate-500">Automatically renew when it expires</p>
                      </div>
                      <Switch
                        checked={autoRenew}
                        onCheckedChange={setAutoRenew}
                        data-testid="switch-auto-renew"
                      />
                    </div>

                    <div className="col-span-2">
                      <Label htmlFor="notes" className="text-sm font-medium">Notes</Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="mt-1"
                        placeholder="Additional notes about this agreement..."
                        rows={3}
                        data-testid="textarea-notes"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="w-80 flex-shrink-0">
              <div className="sticky top-20">
                <Card className="border-[#711419]/20" data-testid="card-summary">
                  <CardHeader className="pb-3 bg-[#711419]/5 border-b">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileCheck className="h-4 w-4 text-[#711419]" />
                      Agreement Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide">Customer</p>
                      <p className="font-medium text-slate-900" data-testid="text-summary-customer">
                        {selectedCustomer?.name || "Not selected"}
                      </p>
                      {selectedCustomer?.fullAddress && !selectedProperty && (
                        <p className="text-xs text-slate-500 mt-0.5">{selectedCustomer.fullAddress}</p>
                      )}
                    </div>

                    {selectedProperty && (
                      <>
                        <div className="h-px bg-slate-100" />
                        <div>
                          <p className="text-xs text-slate-500 uppercase tracking-wide flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            Property
                          </p>
                          <p className="text-sm text-slate-700 mt-0.5" data-testid="text-summary-property">
                            {formatPropertyAddress(selectedProperty)}
                          </p>
                        </div>
                      </>
                    )}

                    <div className="h-px bg-slate-100" />

                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide">Plan</p>
                      <p className="font-medium text-slate-900" data-testid="text-summary-plan">
                        {agreementPlan || "Not specified"}
                      </p>
                    </div>

                    <div className="h-px bg-slate-100" />

                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide">Number of Systems</p>
                      <p className="font-medium text-slate-900" data-testid="text-summary-systems">
                        {numberOfSystems} system{numberOfSystems > 1 ? "s" : ""}
                      </p>
                    </div>

                    <div className="h-px bg-slate-100" />

                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide">Price</p>
                      <p className="text-xl font-bold text-[#711419]" data-testid="text-summary-total">
                        <DollarSign className="h-4 w-4 inline" />
                        {parseFloat(price || "0").toFixed(2)}
                      </p>
                      {numberOfSystems > 1 && (
                        <div className="mt-2 space-y-1" data-testid="text-price-breakdown">
                          {priceBreakdown.map((item) => (
                            <div key={item.index} className="flex justify-between text-xs text-slate-500">
                              <span>System {item.index}</span>
                              <span>${item.price.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="h-px bg-slate-100" />

                    {scheduledVisits.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Scheduled Visits</p>
                        <div className="space-y-1.5 max-h-32 overflow-y-auto">
                          {scheduledVisits.map((visit) => (
                            <div key={visit.visitNumber} className="flex items-center gap-2 text-sm">
                              <div className={`h-5 w-5 rounded-full flex items-center justify-center ${
                                visit.visitNumber === 1 ? "bg-green-100" : "bg-blue-100"
                              }`}>
                                <span className={`text-xs font-medium ${
                                  visit.visitNumber === 1 ? "text-green-700" : "text-blue-700"
                                }`}>{visit.visitNumber}</span>
                              </div>
                              <span>{visit.date}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="h-px bg-slate-100" />

                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide">Expires On</p>
                      <p className="font-medium text-slate-900" data-testid="text-summary-expires">
                        {endDate ? format(new Date(endDate), "MMM d, yyyy") : "—"}
                      </p>
                    </div>

                    {autoRenew && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg text-sm text-green-700">
                        <Calendar className="h-4 w-4" />
                        Auto-renew enabled
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CrmLayout>
  );
}
