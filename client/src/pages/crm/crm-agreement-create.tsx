import { useEffect, useState } from "react";
import { useLocation } from "wouter";
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
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format, addMonths, addYears } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser, MaintenanceRegion, CrmCustomer } from "@shared/schema";

type CustomersResponse = {
  customers: CrmCustomer[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export default function CrmAgreementCreate() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedCustomer, setSelectedCustomer] = useState<CrmCustomer | null>(null);

  const [agreementPlan, setAgreementPlan] = useState("Annual Maintenance Agreement");
  const [contractDate, setContractDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [appointmentDate, setAppointmentDate] = useState(format(addMonths(new Date(), 1), "yyyy-MM-dd"));
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(addYears(new Date(), 1), "yyyy-MM-dd"));
  const [regionId, setRegionId] = useState("");
  const [autoRenew, setAutoRenew] = useState(true);
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("229.00");

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

  const handleContractDateChange = (newContractDate: string) => {
    setContractDate(newContractDate);
    setInvoiceDate(newContractDate);
    setStartDate(newContractDate);
    if (newContractDate) {
      const contractDateObj = new Date(newContractDate);
      setAppointmentDate(format(addMonths(contractDateObj, 1), "yyyy-MM-dd"));
      setEndDate(format(addYears(contractDateObj, 1), "yyyy-MM-dd"));
    }
  };

  const handleCustomerSelect = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const customer = customersData?.customers.find(c => c.id === customerId);
    setSelectedCustomer(customer || null);
  };

  const createAgreementMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) {
        throw new Error("Please select a customer");
      }
      if (!agreementPlan.trim()) {
        throw new Error("Agreement plan name is required");
      }

      const agreementNumber = `AGR-${Date.now().toString(36).toUpperCase()}`;

      const agreementData = {
        agreementNumber,
        customerId: selectedCustomerId,
        customerName: selectedCustomer.name,
        agreementPlan,
        address: selectedCustomer.fullAddress || "",
        contractDate,
        appointmentDate,
        startDate,
        endDate,
        nextServiceDate: appointmentDate,
        nextInvoiceDate: invoiceDate,
        price: parseFloat(price).toFixed(2),
        regionId: regionId || null,
        autoRenew,
        notes,
        status: "active" as const,
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

  const getVisitSummary = () => {
    if (!appointmentDate) return null;
    try {
      const firstVisit = new Date(appointmentDate);
      const secondVisit = addMonths(firstVisit, 6);
      return {
        firstVisit: format(firstVisit, "MMM d, yyyy"),
        secondVisit: format(secondVisit, "MMM d, yyyy"),
      };
    } catch {
      return null;
    }
  };

  const visitSummary = getVisitSummary();

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
                New Maintenance Agreement
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

                    <div className="col-span-2">
                      <Label htmlFor="agreementPlan" className="text-sm font-medium">Agreement Plan Name</Label>
                      <Input
                        id="agreementPlan"
                        value={agreementPlan}
                        onChange={(e) => setAgreementPlan(e.target.value)}
                        className="mt-1"
                        placeholder="e.g., Annual Maintenance Agreement"
                        data-testid="input-agreement-plan"
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
                      <Label htmlFor="invoiceDate" className="text-sm font-medium">Invoice Date</Label>
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
                      <Label htmlFor="startDate" className="text-sm font-medium">Start Date</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="mt-1"
                        data-testid="input-start-date"
                      />
                    </div>

                    <div>
                      <Label htmlFor="endDate" className="text-sm font-medium">End Date</Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="mt-1"
                        data-testid="input-end-date"
                      />
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
                        />
                      </div>
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
                      {selectedCustomer?.fullAddress && (
                        <p className="text-xs text-slate-500 mt-0.5">{selectedCustomer.fullAddress}</p>
                      )}
                    </div>

                    <div className="h-px bg-slate-100" />

                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide">Plan</p>
                      <p className="font-medium text-slate-900" data-testid="text-summary-plan">
                        {agreementPlan || "Not specified"}
                      </p>
                    </div>

                    <div className="h-px bg-slate-100" />

                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide">Price</p>
                      <p className="text-xl font-bold text-[#711419]" data-testid="text-summary-total">
                        <DollarSign className="h-4 w-4 inline" />
                        {parseFloat(price || "0").toFixed(2)}
                      </p>
                    </div>

                    <div className="h-px bg-slate-100" />

                    {visitSummary && (
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Scheduled Visits</p>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-sm">
                            <div className="h-5 w-5 rounded-full bg-green-100 flex items-center justify-center">
                              <span className="text-xs font-medium text-green-700">1</span>
                            </div>
                            <span>{visitSummary.firstVisit}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <div className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-xs font-medium text-blue-700">2</span>
                            </div>
                            <span>{visitSummary.secondVisit}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="h-px bg-slate-100" />

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-slate-500">Start</p>
                        <p className="font-medium">{startDate ? format(new Date(startDate), "MMM d, yyyy") : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">End</p>
                        <p className="font-medium">{endDate ? format(new Date(endDate), "MMM d, yyyy") : "—"}</p>
                      </div>
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
