import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Phone, Mail, MapPin, Navigation, FileText, Search, Users, ChevronDown, ChevronUp } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { Quote, Customer } from "@shared/schema";
import { formatPhoneNumber, validateEmail } from "@/lib/form-utils";

declare global {
  interface Window {
    google: any;
    initGooglePlaces: () => void;
  }
}

export default function CreateLeadPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    estimatedValue: "",
    status: "New",
    jobType: "",
    clientIssue: "",
    projectedCloseDate: "",
    customerType: "",
    leadSource: "",
    assignedEmployeeId: "",
    quoteId: "",
  });
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const addressContainerRef = useRef<HTMLDivElement>(null);
  const autocompleteElementRef = useRef<any>(null);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [isQuoteImportOpen, setIsQuoteImportOpen] = useState(false);
  const [quoteSearchTerm, setQuoteSearchTerm] = useState("");
  
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState("");
  const [isCustomerPopoverOpen, setIsCustomerPopoverOpen] = useState(false);
  const [importedCustomerId, setImportedCustomerId] = useState<string | null>(null);
  const [importedCustomerName, setImportedCustomerName] = useState("");
  const [searchAllFields, setSearchAllFields] = useState(false);

  const { data: technicians = [] } = useQuery<any[]>({
    queryKey: ["/api/technicians"],
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCustomerSearch(customerSearchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearchTerm]);

  const { data: customerSearchResults = [], isFetching: isSearchingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers/search", debouncedCustomerSearch, searchAllFields],
    queryFn: async () => {
      if (debouncedCustomerSearch.length < 2) return [];
      const params = new URLSearchParams({
        term: debouncedCustomerSearch,
        ...(searchAllFields && { searchAll: 'true' })
      });
      const res = await fetch(`/api/customers/search?${params}`);
      if (!res.ok) throw new Error("Failed to search customers");
      return res.json();
    },
    enabled: debouncedCustomerSearch.length >= 2,
    refetchOnWindowFocus: false,
  });

  const handleSelectCustomer = (customer: Customer) => {
    const cleanName = customer.displayName.replace(/^["']|["']$/g, '');
    setFormData({
      ...formData,
      name: cleanName,
      phone: customer.phone ? formatPhoneNumber(customer.phone) : "",
      email: customer.email || "",
      address: customer.fullAddress || "",
      customerType: customer.customerType || formData.customerType,
      leadSource: customer.leadSource || formData.leadSource,
    });
    setSelectedAddress(customer.fullAddress || "");
    setImportedCustomerId(customer.id);
    setImportedCustomerName(cleanName);
    setCustomerSearchTerm("");
    setIsCustomerPopoverOpen(false);
    toast({ description: `Customer "${cleanName}" imported from database`, duration: 2000 });
  };

  const { data: quotesData, isLoading: isLoadingQuotes } = useQuery<{ quotes: Quote[] }>({
    queryKey: ["/api/quotes"],
    enabled: isQuoteImportOpen,
  });

  const GOOGLE_PLACES_API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY || "";

  const allQuotes = quotesData?.quotes || [];
  const filteredQuotes = allQuotes.filter((quote) => {
    if (!quoteSearchTerm.trim()) return true;
    const searchLower = quoteSearchTerm.toLowerCase();
    return (
      quote.customerName.toLowerCase().includes(searchLower) ||
      quote.id.toLowerCase().includes(searchLower) ||
      quote.technician.toLowerCase().includes(searchLower)
    );
  });

  const handleImportQuote = (quote: Quote) => {
    setFormData({
      name: quote.customerName,
      phone: "",
      email: "",
      address: quote.jobNotes || "",
      estimatedValue: quote.total.toString(),
      status: "Quote Sent",
      jobType: "",
      clientIssue: `Quote #${quote.id.slice(0, 8)} - ${(quote.parts as any[]).map(p => p.description).join(', ')}`,
      projectedCloseDate: "",
      customerType: "",
      leadSource: "Quote Generated",
      assignedEmployeeId: "",
      quoteId: quote.id,
    });
    setSelectedAddress(quote.jobNotes || "");
    setIsQuoteImportOpen(false);
    setQuoteSearchTerm("");
    toast({ description: `Quote data imported for ${quote.customerName}`, duration: 2000 });
  };

  useEffect(() => {
    if (!GOOGLE_PLACES_API_KEY) {
      console.warn("Google Places API key not found - address autocomplete disabled");
      return;
    }

    async function loadPlacesAPI() {
      try {
        if (window.google?.maps?.places?.PlaceAutocompleteElement) {
          initializePlaceAutocomplete();
          return;
        }

        if (window.google?.maps?.importLibrary) {
          await window.google.maps.importLibrary('places');
          initializePlaceAutocomplete();
          return;
        }

        const callbackName = 'initGooglePlacesCallback_' + Date.now();
        
        (window as any)[callbackName] = async () => {
          try {
            await window.google.maps.importLibrary('places');
            initializePlaceAutocomplete();
          } catch (error) {
            console.error('Error importing places library:', error);
          }
        };

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_PLACES_API_KEY}&libraries=places&callback=${callbackName}`;
        script.async = true;
        script.defer = true;
        script.onerror = () => {
          console.error('Failed to load Google Maps script');
        };
        document.head.appendChild(script);
      } catch (error) {
        console.error('Error in loadPlacesAPI:', error);
      }
    }

    loadPlacesAPI();

    return () => {
      if (autocompleteElementRef.current) {
        autocompleteElementRef.current.remove();
      }
    };
  }, [GOOGLE_PLACES_API_KEY]);

  const initializePlaceAutocomplete = () => {
    if (!addressContainerRef.current || !window.google?.maps?.places?.PlaceAutocompleteElement) {
      console.warn('Cannot initialize PlaceAutocompleteElement');
      return;
    }
    
    const placeAutocomplete = new window.google.maps.places.PlaceAutocompleteElement({
      componentRestrictions: { country: ['us'] },
    });

    placeAutocomplete.style.width = '100%';
    
    addressContainerRef.current.innerHTML = '';
    addressContainerRef.current.appendChild(placeAutocomplete);
    autocompleteElementRef.current = placeAutocomplete;

    placeAutocomplete.addEventListener('gmp-placeselect', async (event: any) => {
      const place = event.place;
      
      try {
        await place.fetchFields({
          fields: ['formattedAddress']
        });
        
        const address = place.formattedAddress || '';
        
        setSelectedAddress(address);
        setFormData(prev => ({ ...prev, address }));
      } catch (error) {
        console.error('Error fetching place details:', error);
      }
    });
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setFormData({ ...formData, phone: formatted });
    
    const cleaned = formatted.replace(/\D/g, '');
    if (cleaned.length > 0 && cleaned.length < 10) {
      setPhoneError("Phone must be 10 digits");
    } else {
      setPhoneError("");
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const email = e.target.value;
    setFormData({ ...formData, email });
    
    if (email && !validateEmail(email)) {
      setEmailError("Invalid email format");
    } else {
      setEmailError("");
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ description: "Geolocation is not supported by your browser", variant: "destructive" });
      return;
    }

    if (!GOOGLE_PLACES_API_KEY) {
      toast({ 
        description: "Location feature unavailable - API key not configured", 
        variant: "destructive",
        duration: 3000
      });
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_PLACES_API_KEY}`
          );
          
          if (!response.ok) {
            throw new Error(`Reverse geocoding failed: ${response.status}`);
          }
          
          const data = await response.json();
          
          if (data.results && data.results.length > 0) {
            const address = data.results[0].formatted_address;
            setSelectedAddress(address);
            setFormData(prev => ({ ...prev, address }));
            toast({ description: "Address detected from your location", duration: 2000 });
          } else {
            toast({ description: "Could not find address for your location", variant: "destructive" });
          }
        } catch (error) {
          console.error("Reverse geocoding error:", error);
          toast({ description: "Failed to get address from location", variant: "destructive" });
        } finally {
          setIsGettingLocation(false);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        let errorMessage = "Failed to get your location";
        
        if (error.code === 1) {
          errorMessage = "Location permission denied - please enable location access";
        } else if (error.code === 2) {
          errorMessage = "Location unavailable - check your device settings";
        } else if (error.code === 3) {
          errorMessage = "Location request timed out - please try again";
        }
        
        toast({ description: errorMessage, variant: "destructive", duration: 3000 });
        setIsGettingLocation(false);
      }
    );
  };

  const createLeadMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/leads", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/metrics"] });
      toast({ description: "Lead created successfully", duration: 1000 });
      setLocation("/sales-prospects");
    },
    onError: () => {
      toast({ description: "Failed to create lead", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    
    if (formData.email && formData.email.trim() !== "" && !validateEmail(formData.email)) {
      toast({ description: "Please enter a valid email", variant: "destructive" });
      return;
    }
    const cleanedPhone = formData.phone.replace(/\D/g, '');
    if (cleanedPhone.length > 0 && cleanedPhone.length < 10) {
      toast({ description: "Please enter a valid 10-digit phone number", variant: "destructive" });
      return;
    }

    const tags: string[] = [];
    if (formData.jobType === "installation") {
      tags.push("installation");
    }
    if (formData.jobType === "maintenance") {
      tags.push("maintenance");
    }

    const submitData: any = {
      ...formData,
      estimatedValue: formData.estimatedValue ? formData.estimatedValue : undefined,
      quoteId: formData.quoteId || undefined,
      tags: tags.length > 0 ? tags : undefined,
    };

    delete submitData.jobType;

    if (formData.projectedCloseDate) {
      submitData.projectedCloseDate = new Date(formData.projectedCloseDate).toISOString();
    }

    createLeadMutation.mutate(submitData);
  };

  const handleCancel = () => {
    setLocation("/sales-prospects");
  };

  return (
    <div className="min-h-[100svh] bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="flex items-center gap-3 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCancel}
            className="h-11 w-11 shrink-0"
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Create New Lead</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto pb-24">
        <div className="p-4 space-y-4 max-w-lg mx-auto">
          <Collapsible open={isQuoteImportOpen} onOpenChange={setIsQuoteImportOpen}>
            <CollapsibleTrigger asChild>
              <Button 
                type="button" 
                variant="outline" 
                className="w-full min-h-[44px] justify-between" 
                data-testid="button-import-from-quote"
              >
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Import from Existing Quote
                </span>
                {isQuoteImportOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by customer name, quote ID, or technician..."
                  value={quoteSearchTerm}
                  onChange={(e) => setQuoteSearchTerm(e.target.value)}
                  className="pl-10 min-h-[44px] min-w-0 w-full"
                  data-testid="input-search-quotes"
                />
              </div>
              <ScrollArea className="max-h-64 border rounded-lg">
                {isLoadingQuotes ? (
                  <div className="p-3 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Card key={i} className="p-4">
                        <Skeleton className="h-4 w-3/4 mb-2" />
                        <Skeleton className="h-3 w-1/2" />
                      </Card>
                    ))}
                  </div>
                ) : filteredQuotes.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    {quoteSearchTerm ? "No quotes found matching your search" : "No quotes available"}
                  </div>
                ) : (
                  <div className="p-2 space-y-2">
                    {filteredQuotes.slice(0, 10).map((quote) => (
                      <Card
                        key={quote.id}
                        className="p-3 cursor-pointer hover:bg-accent transition-colors"
                        onClick={() => handleImportQuote(quote)}
                        data-testid={`card-quote-${quote.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-semibold text-sm truncate">
                                {quote.customerName}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {quote.id.slice(0, 8)}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <p>Total: ${parseFloat(quote.total).toFixed(2)}</p>
                              {quote.createdAt && (
                                <p>{format(new Date(quote.createdAt), "MMM dd, yyyy")}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>

          {formData.quoteId && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3" data-testid="quote-reference-banner">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-blue-900 dark:text-blue-100">
                  Imported from Quote #{formData.quoteId.slice(0, 8)}
                </span>
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                You can edit all fields before creating the lead
              </p>
            </div>
          )}

          {importedCustomerId && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3" data-testid="customer-reference-banner">
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="font-medium text-green-900 dark:text-green-100">
                  Customer imported from database: {importedCustomerName}
                </span>
              </div>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                You can edit all fields before creating the lead
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1.5">Search Existing Customer</label>
              <Popover open={isCustomerPopoverOpen && customerSearchTerm.length >= 2} onOpenChange={setIsCustomerPopoverOpen}>
                <PopoverTrigger asChild>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={searchAllFields ? "Search name, phone, email, address..." : "Search by name..."}
                      value={customerSearchTerm}
                      onChange={(e) => {
                        setCustomerSearchTerm(e.target.value);
                        if (e.target.value.length >= 2) {
                          setIsCustomerPopoverOpen(true);
                        }
                      }}
                      onFocus={() => {
                        if (customerSearchTerm.length >= 2) {
                          setIsCustomerPopoverOpen(true);
                        }
                      }}
                      className="pl-10 min-h-[44px] min-w-0 w-full"
                      data-testid="input-customer-search"
                    />
                  </div>
                </PopoverTrigger>
                <PopoverContent 
                  className="p-0 w-[var(--radix-popover-trigger-width)]" 
                  align="start"
                  side="bottom"
                  avoidCollisions={false}
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <ScrollArea className="max-h-64">
                    {isSearchingCustomers ? (
                      <div className="p-3 space-y-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ) : customerSearchResults.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        No customers found
                      </div>
                    ) : (
                      customerSearchResults.map((customer) => {
                        const cleanName = customer.displayName.replace(/^["']|["']$/g, '');
                        return (
                          <div
                            key={customer.id}
                            className="p-3 hover:bg-accent cursor-pointer border-b last:border-b-0 min-h-[44px]"
                            onClick={() => handleSelectCustomer(customer)}
                            data-testid={`customer-result-${customer.id}`}
                          >
                            <div className="font-medium text-sm">{cleanName}</div>
                            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
                              {customer.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {customer.phone}
                                </span>
                              )}
                              {customer.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {customer.email}
                                </span>
                              )}
                              {customer.fullAddress && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {customer.fullAddress.length > 30 
                                    ? customer.fullAddress.substring(0, 30) + "..." 
                                    : customer.fullAddress}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </ScrollArea>
                </PopoverContent>
              </Popover>
              <div className="flex flex-wrap items-center justify-between gap-1 mt-2">
                <p className="text-xs text-muted-foreground">Type 2+ chars to search</p>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer shrink-0">
                  <Checkbox
                    checked={searchAllFields}
                    onCheckedChange={(checked) => setSearchAllFields(checked === true)}
                    className="h-4 w-4"
                    data-testid="checkbox-search-all-fields-lead"
                  />
                  All fields
                </label>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="min-h-[44px] min-w-0 w-full"
                data-testid="input-lead-name"
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Phone</label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={handlePhoneChange}
                placeholder="(555) 123-4567"
                className={`min-h-[44px] min-w-0 w-full ${phoneError ? "border-red-500" : ""}`}
                data-testid="input-lead-phone"
              />
              {phoneError && <p className="text-xs text-red-500 mt-1">{phoneError}</p>}
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Email</label>
              <Input
                type="email"
                value={formData.email}
                onChange={handleEmailChange}
                placeholder="email@example.com"
                className={`min-h-[44px] min-w-0 w-full ${emailError ? "border-red-500" : ""}`}
                data-testid="input-lead-email"
              />
              {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Address</label>
              <div className="flex gap-2 items-center">
                <div 
                  ref={addressContainerRef} 
                  className="flex-1 min-w-0"
                  data-testid="autocomplete-address-container"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 h-11 w-11"
                  onClick={getCurrentLocation}
                  disabled={isGettingLocation}
                  title="Use current location"
                  data-testid="button-geolocation"
                >
                  <Navigation className={`h-4 w-4 ${isGettingLocation ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              {selectedAddress && (
                <p className="text-xs text-muted-foreground mt-1">Selected: {selectedAddress}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Estimated Value</label>
              <Input
                type="number"
                step="0.01"
                value={formData.estimatedValue}
                onChange={(e) => setFormData({ ...formData, estimatedValue: e.target.value })}
                className="min-h-[44px] min-w-0 w-full"
                data-testid="input-lead-value"
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Status</label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger className="min-h-[44px] min-w-0 w-full" data-testid="select-lead-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="New">New</SelectItem>
                  <SelectItem value="Contacted">Contacted</SelectItem>
                  <SelectItem value="Quote Sent">Quote Sent</SelectItem>
                  <SelectItem value="Negotiating">Negotiating</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Job Type</label>
              <Select value={formData.jobType} onValueChange={(value) => setFormData({ ...formData, jobType: value })}>
                <SelectTrigger className="min-h-[44px] min-w-0 w-full" data-testid="select-job-type">
                  <SelectValue placeholder="Select job type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="installation">Installation</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              {formData.jobType === "installation" && (
                <p className="text-xs text-muted-foreground mt-1">This lead will appear on the Installation board when Won</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Client Issue</label>
              <Textarea
                value={formData.clientIssue}
                onChange={(e) => setFormData({ ...formData, clientIssue: e.target.value })}
                className="min-w-0 w-full min-h-[100px]"
                data-testid="textarea-lead-issue"
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Projected Close Date</label>
              <Input
                type="date"
                value={formData.projectedCloseDate}
                onChange={(e) => setFormData({ ...formData, projectedCloseDate: e.target.value })}
                className="min-h-[44px] min-w-0 w-full"
                data-testid="input-lead-close-date"
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Customer Type</label>
              <Input
                value={formData.customerType}
                onChange={(e) => setFormData({ ...formData, customerType: e.target.value })}
                placeholder="e.g., Residential, Commercial"
                className="min-h-[44px] min-w-0 w-full"
                data-testid="input-lead-customer-type"
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Lead Source</label>
              <Input
                value={formData.leadSource}
                onChange={(e) => setFormData({ ...formData, leadSource: e.target.value })}
                placeholder="e.g., Referral, Website, Ad"
                className="min-h-[44px] min-w-0 w-full"
                data-testid="input-lead-source"
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Assigned Employee</label>
              <Select 
                value={formData.assignedEmployeeId || undefined} 
                onValueChange={(value) => setFormData({ ...formData, assignedEmployeeId: value })}
              >
                <SelectTrigger className="min-h-[44px] min-w-0 w-full" data-testid="select-assigned-employee">
                  <SelectValue placeholder="None (Optional)" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                className="flex-1 min-h-[44px]"
                data-testid="button-cancel-lead"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="flex-1 min-h-[44px]" 
                disabled={createLeadMutation.isPending}
                data-testid="button-submit-lead"
              >
                {createLeadMutation.isPending ? "Creating..." : "Create Lead"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
