import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { cn } from "@/lib/utils";
import type { CrmUser, CrmCustomer, InterestLevel } from "@shared/schema";

type ProspectMode = "choose" | "existing";

const SALES_REPS = [
  { value: "chandler", label: "Chandler" },
  { value: "earnest", label: "Earnest" },
];

const INTEREST_LEVELS: { value: InterestLevel; label: string }[] = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];

export default function CrmAddProspect() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<ProspectMode>("choose");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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

  const { data: customersData, isLoading: customersLoading } = useQuery<{ customers: CrmCustomer[] }>({
    queryKey: ["/api/crm/customers"],
    enabled: !!currentUser && mode === "existing",
  });

  const customers = customersData?.customers || [];

  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return customers;
    const query = searchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        c.name?.toLowerCase().includes(query) ||
        c.phone?.toLowerCase().includes(query) ||
        c.email?.toLowerCase().includes(query)
    );
  }, [customers, searchQuery]);

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
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers"] });
      toast({ title: "Customer converted to prospect successfully" });
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
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Add Prospect</h1>
            <p className="text-muted-foreground">
              {mode === "choose" ? "Choose how to add a new prospect" : "Convert existing customer to prospect"}
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
                      Add a brand new customer and set them up as a prospect
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
                      Convert an existing customer into a sales prospect
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
              <CardTitle>Convert Customer to Prospect</CardTitle>
              <CardDescription>
                Select an existing customer and enter prospect details
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
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search customers..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                        data-testid="input-customer-search"
                      />
                      <CommandList>
                        <CommandEmpty>
                          {customersLoading ? "Loading..." : "No customers found."}
                        </CommandEmpty>
                        <CommandGroup>
                          {filteredCustomers.slice(0, 50).map((customer) => (
                            <CommandItem
                              key={customer.id}
                              value={customer.id}
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
                              <div className="flex flex-col">
                                <span className="font-medium">{customer.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {customer.phone || customer.email || "No contact info"}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {selectedCustomer && (
                <>
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
                      Prospect Details
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
                            {SALES_REPS.map((rep) => (
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
                      disabled={convertToProspectMutation.isPending}
                      data-testid="button-submit"
                    >
                      {convertToProspectMutation.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Convert to Prospect
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
