import { useState, useEffect, useMemo, useCallback } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ArrowLeft,
  UserPlus,
  Users,
  Check,
  Search,
  Loader2,
  Phone,
  Mail,
  MapPin,
  ChevronsUpDown,
  AlertCircle,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { cn } from "@/lib/utils";
import type { CrmUser, CrmCustomer, InterestLevel } from "@shared/schema";

type ProspectMode = "choose" | "existing";

const INTEREST_LEVELS: { value: InterestLevel; label: string }[] = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];

export default function CrmAddProspect() {
  usePageTitle("Add Lead");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  // Check for customerId URL param on initial mount (passed from customer account page)
  const urlParams = new URLSearchParams(window.location.search);
  const preselectedCustomerId = urlParams.get("customerId") || "";
  
  const [mode, setMode] = useState<ProspectMode>(() => preselectedCustomerId ? "existing" : "choose");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(() => preselectedCustomerId);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [potentialValue, setPotentialValue] = useState("");
  const [assignedSalesRepId, setAssignedSalesRepId] = useState("");
  const [interestLevel, setInterestLevel] = useState<InterestLevel | "">("");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Server-side search for customers - fetches from all 11k+ customers
  const { data: customersData, isLoading: customersLoading } = useQuery<{ customers: CrmCustomer[] }>({
    queryKey: ["/api/crm/customers", { search: debouncedSearch, limit: "100" }],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }
      const res = await fetch(`/api/crm/customers?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
    enabled: !!currentUser && mode === "existing",
  });

  // Fetch selected customer separately if not in search results
  const { data: selectedCustomerData } = useQuery<CrmCustomer>({
    queryKey: ["/api/crm/customers", selectedCustomerId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${selectedCustomerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch customer");
      return res.json();
    },
    enabled: !!currentUser && !!selectedCustomerId,
  });

  // Fetch CRM users for sales rep dropdown (sales role only)
  const { data: salesUsers } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users/by-role", "sales"],
    queryFn: async () => {
      const response = await fetch(`/api/crm/users/by-role?exactRole=sales`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch sales users");
      return response.json();
    },
    enabled: !!currentUser,
  });

  const salesReps = useMemo(() => {
    if (!salesUsers) return [];
    return salesUsers.map(u => ({ value: u.id, label: u.name }));
  }, [salesUsers]);

  const customers = customersData?.customers || [];

  // Use selectedCustomerData if available, otherwise find from search results
  const selectedCustomer = useMemo(() => {
    if (selectedCustomerData) return selectedCustomerData;
    return customers.find((c) => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId, selectedCustomerData]);

  // No client-side filtering needed - API handles search
  const filteredCustomers = customers;

  // Check if customer is already in the sales funnel (has a salesStage)
  const isAlreadyProspect = !!selectedCustomer?.salesStage;

  const convertToProspectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/crm/customers/${selectedCustomerId}`, {
        customerStatus: "prospect",
        salesStage: "new",
        potentialValue: potentialValue ? parseFloat(potentialValue) : null,
        assignedSalesRepId: assignedSalesRepId || null,
        interestLevel: interestLevel || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects/overview-analytics"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers"], exact: false });
      toast({ title: "Customer converted to lead successfully" });
      navigate("/crm/prospect-funnel");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to convert customer", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!selectedCustomerId) {
      toast({ title: "Please select a customer", variant: "destructive" });
      return;
    }
    if (isAlreadyProspect) {
      toast({ title: "This customer is already in the lead funnel", variant: "destructive" });
      return;
    }
    if (!potentialValue) {
      toast({ title: "Please enter potential value", variant: "destructive" });
      return;
    }
    if (!assignedSalesRepId) {
      toast({ title: "Please select a sales person", variant: "destructive" });
      return;
    }
    convertToProspectMutation.mutate();
  };

  const handleModeSelect = (selectedMode: "new" | "existing") => {
    if (selectedMode === "new") {
      navigate("/crm/accounts/new");
    } else {
      setMode("existing");
    }
  };

  if (authLoading || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => mode === "choose" ? navigate("/crm/prospect-funnel") : setMode("choose")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Add Lead</h1>
            <p className="text-muted-foreground">
              {mode === "choose" ? "Choose how to add a new lead" : "Convert existing customer to lead"}
            </p>
          </div>
        </div>

        {mode === "choose" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              className="cursor-pointer hover:border-primary hover:shadow-md transition-all"
              onClick={() => handleModeSelect("new")}
              data-testid="card-create-new"
            >
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center gap-4">
                  <div className="p-4 rounded-full bg-primary/10">
                    <UserPlus className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg mb-2">Create New Customer</CardTitle>
                    <CardDescription>
                      Add a brand new customer and set them up as a lead
                    </CardDescription>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary hover:shadow-md transition-all"
              onClick={() => handleModeSelect("existing")}
              data-testid="card-select-existing"
            >
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center gap-4">
                  <div className="p-4 rounded-full bg-primary/10">
                    <Users className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg mb-2">Select Existing Customer</CardTitle>
                    <CardDescription>
                      Convert an existing customer into a sales lead
                    </CardDescription>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {mode === "existing" && (
          <Card>
            <CardHeader>
              <CardTitle>Convert Customer to Lead</CardTitle>
              <CardDescription>
                Select an existing customer and enter lead details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Search Customer</Label>
                <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={customerSearchOpen}
                      className="w-full justify-between"
                      data-testid="button-customer-search"
                    >
                      {selectedCustomer ? selectedCustomer.name : "Select a customer..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search by name, phone, or email..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                        data-testid="input-customer-search"
                      />
                      <CommandList className="max-h-[300px]">
                        <CommandEmpty>
                          {customersLoading ? (
                            <div className="flex items-center gap-2 justify-center py-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Searching...
                            </div>
                          ) : searchQuery ? "No customers found matching your search." : "Type to search all customers..."}
                        </CommandEmpty>
                        <CommandGroup>
                          {filteredCustomers.map((customer) => {
                            const isProspect = !!customer.salesStage;
                            return (
                              <CommandItem
                                key={customer.id}
                                value={`${customer.name} ${customer.phone || ''} ${customer.email || ''}`}
                                onSelect={() => {
                                  setSelectedCustomerId(customer.id);
                                  setCustomerSearchOpen(false);
                                  setSearchQuery("");
                                }}
                                data-testid={`customer-option-${customer.id}`}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedCustomerId === customer.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{customer.name}</span>
                                    {isProspect && (
                                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                        Already a Lead
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {customer.phone || customer.email || "No contact info"}
                                  </span>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {selectedCustomer && (
                <>
                  {isAlreadyProspect && (
                    <Alert variant="destructive" className="border-amber-500 bg-amber-50 text-amber-800">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        This customer is already in the lead funnel. You cannot convert them again.
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                      Customer Details
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Name</Label>
                        <p className="font-medium" data-testid="text-customer-name">
                          {selectedCustomer.name}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Phone</Label>
                        <p className="font-medium flex items-center gap-2" data-testid="text-customer-phone">
                          {selectedCustomer.phone ? (
                            <>
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              {selectedCustomer.phone}
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Email</Label>
                        <p className="font-medium flex items-center gap-2" data-testid="text-customer-email">
                          {selectedCustomer.email ? (
                            <>
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              {selectedCustomer.email}
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Address</Label>
                        <p className="font-medium flex items-center gap-2" data-testid="text-customer-address">
                          {selectedCustomer.fullAddress ? (
                            <>
                              <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm">{selectedCustomer.fullAddress}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-6 space-y-4">
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                      Lead Details
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="potentialValue">
                          Potential Value <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            $
                          </span>
                          <Input
                            id="potentialValue"
                            type="number"
                            placeholder="0.00"
                            value={potentialValue}
                            onChange={(e) => setPotentialValue(e.target.value)}
                            className="pl-7"
                            data-testid="input-potential-value"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="salesRep">
                          Assigned Sales Person <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={assignedSalesRepId}
                          onValueChange={setAssignedSalesRepId}
                        >
                          <SelectTrigger data-testid="select-sales-rep">
                            <SelectValue placeholder="Select sales person" />
                          </SelectTrigger>
                          <SelectContent>
                            {salesReps.map((rep) => (
                              <SelectItem key={rep.value} value={rep.value}>
                                {rep.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="interestLevel">Interest Level</Label>
                        <Select
                          value={interestLevel}
                          onValueChange={(val) => setInterestLevel(val as InterestLevel | "")}
                        >
                          <SelectTrigger data-testid="select-interest-level">
                            <SelectValue placeholder="Select level (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            {INTEREST_LEVELS.map((level) => (
                              <SelectItem key={level.value} value={level.value}>
                                {level.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setMode("choose");
                        setSelectedCustomerId("");
                        setPotentialValue("");
                        setAssignedSalesRepId("");
                        setInterestLevel("");
                      }}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={convertToProspectMutation.isPending || isAlreadyProspect}
                      data-testid="button-submit"
                    >
                      {convertToProspectMutation.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      {isAlreadyProspect ? "Already a Lead" : "Convert to Lead"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </CrmLayout>
  );
}
