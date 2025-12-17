import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { User, Search, Database, Loader2 } from "lucide-react";
import type { Technician, Customer } from "@shared/schema";

interface CustomerInfoProps {
  customerName: string;
  technician: string;
  technicians: Technician[];
  onUpdate: (updates: { customerName?: string; technician?: string }) => void;
  hasErrors?: {
    customerName?: boolean;
    technician?: boolean;
  };
  disabled?: boolean;
}

export default function CustomerInfo({
  customerName,
  technician,
  technicians,
  onUpdate,
  hasErrors,
  disabled = false,
}: CustomerInfoProps) {
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [importedCustomer, setImportedCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(customerSearchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearchTerm]);

  const { data: searchResults = [], isFetching } = useQuery<Customer[]>({
    queryKey: ["/api/customers/search", debouncedSearch],
    queryFn: async () => {
      if (debouncedSearch.length < 2) return [];
      const res = await fetch(`/api/customers/search?term=${encodeURIComponent(debouncedSearch)}`);
      if (!res.ok) throw new Error("Failed to search customers");
      return res.json();
    },
    enabled: debouncedSearch.length >= 2,
    refetchOnWindowFocus: false,
  });

  const handleSelectCustomer = (customer: Customer) => {
    onUpdate({ customerName: customer.displayName });
    setImportedCustomer(customer);
    setCustomerSearchTerm("");
    setIsPopoverOpen(false);
  };

  return (
    <Card className="slide-in">
      <CardContent className="p-6">
        <div className="flex items-center mb-4">
          <User className="text-primary mr-3 h-5 w-5" />
          <h2 className="text-lg font-semibold text-card-foreground">Customer Information</h2>
        </div>
        <div className="space-y-4">
          {importedCustomer && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm">
                <Database className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="font-medium text-green-900 dark:text-green-100">
                  Customer imported: {importedCustomer.displayName}
                </span>
              </div>
              {importedCustomer.fullAddress && (
                <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                  {importedCustomer.fullAddress}
                </p>
              )}
            </div>
          )}

          <div>
            <Label className="block text-sm font-medium text-card-foreground mb-2">
              <Search className="h-3 w-3 inline mr-1" />
              Search Customer Database
            </Label>
            <Popover open={isPopoverOpen && searchResults.length > 0} onOpenChange={setIsPopoverOpen}>
              <PopoverTrigger asChild>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Type to search by name, phone, or address..."
                    value={customerSearchTerm}
                    onChange={(e) => {
                      setCustomerSearchTerm(e.target.value);
                      if (e.target.value.length >= 2) {
                        setIsPopoverOpen(true);
                      }
                    }}
                    onFocus={() => {
                      if (customerSearchTerm.length >= 2 && searchResults.length > 0) {
                        setIsPopoverOpen(true);
                      }
                    }}
                    className="pl-10"
                    disabled={disabled}
                    data-testid="input-customer-search"
                  />
                  {isFetching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </PopoverTrigger>
              <PopoverContent 
                className="w-[var(--radix-popover-trigger-width)] p-0" 
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <div className="max-h-60 overflow-y-auto">
                  {searchResults.map((customer) => (
                    <div
                      key={customer.id}
                      className="p-3 hover:bg-accent cursor-pointer border-b last:border-b-0"
                      onClick={() => handleSelectCustomer(customer)}
                      data-testid={`customer-result-${customer.id}`}
                    >
                      <div className="font-medium">{customer.displayName}</div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {customer.phone && <div>{customer.phone}</div>}
                        {customer.email && <div>{customer.email}</div>}
                        {customer.fullAddress && (
                          <div className="truncate">{customer.fullAddress.slice(0, 40)}...</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground mt-1">
              Find existing customers from the imported FieldEdge database
            </p>
          </div>

          <div>
            <Label htmlFor="customerName" className="block text-sm font-medium text-card-foreground mb-2">
              Customer Name
            </Label>
            <Input
              id="customerName"
              type="text"
              placeholder="Enter customer name"
              value={customerName}
              onChange={(e) => onUpdate({ customerName: e.target.value })}
              className={`w-full ${hasErrors?.customerName ? 'border-destructive focus:border-destructive' : ''}`}
              data-testid="input-customer-name"
              disabled={disabled}
            />
            {hasErrors?.customerName && (
              <p className="text-xs text-destructive mt-1">Customer name is required</p>
            )}
          </div>
          <div>
            <Label htmlFor="technician" className="block text-sm font-medium text-card-foreground mb-2">
              Technician
            </Label>
            <Select value={technician} onValueChange={(value) => onUpdate({ technician: value })} disabled={disabled}>
              <SelectTrigger className={`w-full ${hasErrors?.technician ? 'border-destructive focus:border-destructive' : ''}`} data-testid="select-technician">
                <SelectValue placeholder="Select technician" />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground">
                {technicians.map((tech) => (
                  <SelectItem key={tech.id} value={tech.name} className="text-popover-foreground">
                    {tech.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasErrors?.technician && (
              <p className="text-xs text-destructive mt-1">Please select a technician</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
