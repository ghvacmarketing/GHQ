import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Home,
  Users,
  Check,
  CalendarIcon,
  Search,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatPhoneNumber, validateEmail, validatePhone } from "@/lib/form-utils";
import type { CrmUser, AccountType, AccountStatus, LeadSource, CrmAccount } from "@shared/schema";

const ACCOUNT_TYPES: { value: AccountType; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "RESIDENTIAL", label: "Residential", description: "Individual homeowners and renters", icon: Home },
  { value: "PROPERTY_MANAGER", label: "Property Manager", description: "Property management companies with multiple sites", icon: Users },
  { value: "COMMERCIAL", label: "Commercial", description: "Business and commercial properties", icon: Building2 },
];

const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: "WEBSITE", label: "Website" },
  { value: "REFERRAL", label: "Referral" },
  { value: "GOOGLE", label: "Google" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "YELP", label: "Yelp" },
  { value: "HOME_ADVISOR", label: "HomeAdvisor" },
  { value: "ANGI", label: "Angi" },
  { value: "THUMBTACK", label: "Thumbtack" },
  { value: "WALK_IN", label: "Walk-In" },
  { value: "PHONE", label: "Phone" },
  { value: "REPEAT_CUSTOMER", label: "Repeat Customer" },
  { value: "FIELDEDGE", label: "FieldEdge" },
  { value: "OTHER", label: "Other" },
];

const BILLING_METHODS = ["Invoice", "Credit Card on File", "Check", "ACH"];

type FormStep = 1 | 2 | 3 | 4 | 5;

interface FormData {
  accountType: AccountType;
  status: AccountStatus;
  firstName: string;
  lastName: string;
  companyName: string;
  displayName: string;
  phone: string;
  email: string;
  parentAccountId: string;
  customerSince: Date;
  leadSource: LeadSource | "";
  noCallRecording: boolean;
  pinnedNote: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  accessInstructions: string;
  gateCode: string;
  specialInstructions: string;
  managementCompanyName: string;
  portfolioSize: string;
  requiresApprovalBefore: boolean;
  approvalThreshold: string;
  defaultBillingMethod: string;
  pmNetTerms: string;
  pmBillingTerms: string;
  pmDefaultBillTo: string;
  pmMainOfficePhone: string;
  pmMainOfficeEmail: string;
  pmBillingApEmail: string;
  tenantName: string;
  tenantPhone: string;
  tenantEmail: string;
  taxExempt: boolean;
  taxExemptNumber: string;
  requiresPO: boolean;
  poPrefix: string;
  commercialNetTerms: string;
  billingAddressDifferent: boolean;
  billingAddress: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  w9OnFile: boolean;
  isProspect: boolean;
  salesStage: string;
  interestLevel: string;
  potentialValue: string;
  scheduleFollowUp: boolean;
  followUpType: string;
  followUpDate: Date | null;
  followUpNotes: string;
}

const initialFormData: FormData = {
  accountType: "RESIDENTIAL",
  status: "PROSPECT",
  firstName: "",
  lastName: "",
  companyName: "",
  displayName: "",
  phone: "",
  email: "",
  parentAccountId: "",
  customerSince: new Date(),
  leadSource: "",
  noCallRecording: false,
  pinnedNote: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  zip: "",
  accessInstructions: "",
  gateCode: "",
  specialInstructions: "",
  managementCompanyName: "",
  portfolioSize: "",
  requiresApprovalBefore: false,
  approvalThreshold: "",
  defaultBillingMethod: "",
  pmNetTerms: "30",
  pmBillingTerms: "NET_30",
  pmDefaultBillTo: "PM",
  pmMainOfficePhone: "",
  pmMainOfficeEmail: "",
  pmBillingApEmail: "",
  tenantName: "",
  tenantPhone: "",
  tenantEmail: "",
  taxExempt: false,
  taxExemptNumber: "",
  requiresPO: false,
  poPrefix: "",
  commercialNetTerms: "30",
  billingAddressDifferent: false,
  billingAddress: "",
  billingCity: "",
  billingState: "",
  billingZip: "",
  w9OnFile: false,
  isProspect: true,
  salesStage: "new",
  interestLevel: "",
  potentialValue: "",
  scheduleFollowUp: false,
  followUpType: "call",
  followUpDate: null,
  followUpNotes: "",
};

export default function CrmAccountCreate() {
  usePageTitle("Create Account");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<FormStep>(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const lastAutoGeneratedName = useRef<string>("");
  const [displayNameManuallyEdited, setDisplayNameManuallyEdited] = useState(false);

  // Auto-focus first input when step changes
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

  const generateDisplayName = useMemo(() => {
    const { firstName, lastName, companyName, accountType } = formData;
    // For PM accounts, always use company name
    if (accountType === "PROPERTY_MANAGER") {
      return companyName || "";
    }
    if (companyName) {
      return companyName;
    }
    const parts = [firstName, lastName].filter(Boolean);
    return parts.join(" ");
  }, [formData.firstName, formData.lastName, formData.companyName, formData.accountType]);

  useEffect(() => {
    if (!displayNameManuallyEdited) {
      setFormData(prev => ({ ...prev, displayName: generateDisplayName }));
      lastAutoGeneratedName.current = generateDisplayName;
    }
  }, [generateDisplayName, displayNameManuallyEdited]);

  const handleDisplayNameChange = (value: string) => {
    setFormData(prev => ({ ...prev, displayName: value }));
    // If user clears the field or types back to match auto-generated, resume auto-fill
    if (!value.trim() || value === lastAutoGeneratedName.current) {
      setDisplayNameManuallyEdited(false);
    } else {
      setDisplayNameManuallyEdited(true);
    }
  };

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const createCustomerMutation = useMutation({
    mutationFn: async () => {
      const customerTypeMap: Record<AccountType, string> = {
        "RESIDENTIAL": "Residential",
        "COMMERCIAL": "Commercial",
        "PROPERTY_MANAGER": "Property Manager",
      };

      const fullAddress = `${formData.address1}${formData.address2 ? ', ' + formData.address2 : ''}, ${formData.city}, ${formData.state} ${formData.zip}`;

      // Property Managers: address is HQ/Mailing, NOT a site - don't auto-create property
      const shouldCreateProperty = formData.accountType !== "PROPERTY_MANAGER";

      const payload = {
        customer: {
          name: formData.displayName,
          companyName: formData.companyName || null,
          email: formData.accountType === "PROPERTY_MANAGER" ? formData.pmMainOfficeEmail : formData.email || null,
          phone: formData.accountType === "PROPERTY_MANAGER" ? formData.pmMainOfficePhone : formData.phone || null,
          customerType: customerTypeMap[formData.accountType],
          customerStatus: "prospect",
          fullAddress: fullAddress,
          leadSource: formData.leadSource || null,
          notes: formData.pinnedNote || null,
          ...(formData.isProspect && {
            salesStage: formData.salesStage,
            interestLevel: formData.interestLevel || null,
            potentialValue: formData.potentialValue || null,
          }),
        },
        property: shouldCreateProperty ? {
          address1: formData.address1,
          address2: formData.address2 || null,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
          notes: formData.accessInstructions || formData.gateCode ? `Access: ${formData.accessInstructions || ''} Gate: ${formData.gateCode || ''}`.trim() : null,
        } : null,
      };

      const res = await apiRequest("POST", "/api/crm/customers/create-with-property", payload);
      const data = await res.json();

      if (formData.scheduleFollowUp && formData.followUpDate && data?.customer?.id) {
        await apiRequest("POST", "/api/crm/follow-ups", {
          customerId: data.customer.id,
          followUpType: formData.followUpType,
          dueAt: formData.followUpDate.toISOString(),
          notes: formData.followUpNotes || "Initial follow-up",
        });
      }

      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Customer created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/prospects/metrics"] });
      if (data?.customer?.id) {
        navigate(`/crm/customers/${data.customer.id}`);
      } else {
        navigate(`/crm/customers`);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create customer",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const checkValidation = (step: FormStep): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    switch (step) {
      case 1:
        break;
      case 2:
        if (formData.accountType === "PROPERTY_MANAGER") {
          if (!formData.companyName.trim()) errors.push("Company name is required for property manager accounts");
          if (!formData.pmMainOfficePhone.trim()) errors.push("Main office phone is required");
          if (formData.pmMainOfficePhone && !validatePhone(formData.pmMainOfficePhone)) {
            errors.push("Please fix the phone number format");
          }
          if (formData.pmMainOfficeEmail && !validateEmail(formData.pmMainOfficeEmail)) {
            errors.push("Please fix the main office email format");
          }
          if (formData.pmBillingApEmail && !validateEmail(formData.pmBillingApEmail)) {
            errors.push("Please fix the billing/AP email format");
          }
        } else {
          if (!formData.firstName.trim()) errors.push("First name is required");
          if (formData.accountType === "COMMERCIAL" && !formData.companyName.trim()) {
            errors.push("Company name is required for commercial accounts");
          }
          if (formData.phone && !validatePhone(formData.phone)) {
            errors.push("Please fix the phone number format");
          }
          if (formData.email && !validateEmail(formData.email)) {
            errors.push("Please fix the email format");
          }
        }
        if (!formData.displayName.trim()) errors.push("Display name is required");
        break;
      case 3:
        if (!formData.address1.trim()) errors.push("Address Line 1 is required");
        if (!formData.city.trim()) errors.push("City is required");
        if (!formData.state.trim()) errors.push("State is required");
        if (!formData.zip.trim()) errors.push("ZIP code is required");
        break;
      case 4:
        if (formData.scheduleFollowUp && !formData.followUpDate) {
          errors.push("Follow-up date is required when scheduling a follow-up");
        }
        break;
      case 5:
        const step2Check = checkValidation(2);
        const step3Check = checkValidation(3);
        const step4Check = checkValidation(4);
        errors.push(...step2Check.errors, ...step3Check.errors, ...step4Check.errors);
        break;
    }

    return { valid: errors.length === 0, errors };
  };

  const validateStep = (step: FormStep): { valid: boolean; errors: string[] } => {
    return checkValidation(step);
  };

  const canProceed = (step: FormStep): boolean => {
    return checkValidation(step).valid;
  };

  const handleNext = () => {
    if (currentStep < 5 && canProceed(currentStep)) {
      setCurrentStep((prev) => (prev + 1) as FormStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as FormStep);
    }
  };

  const handleSubmit = () => {
    const validation = validateStep(5);
    if (validation.valid) {
      createCustomerMutation.mutate();
    } else {
      toast({
        title: "Please fix validation errors",
        description: validation.errors.join(", "),
        variant: "destructive",
      });
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
    { number: 1, label: "Account Type" },
    { number: 2, label: "Basic Info" },
    { number: 3, label: "Location" },
    { number: 4, label: "Details" },
    { number: 5, label: "Review" },
  ];

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/crm/customers")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-page-title">Create New Customer</h1>
            <p className="text-slate-500 text-sm mt-1">Add a new account to your CRM</p>
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
                  <CardTitle>Select Account Type</CardTitle>
                  <CardDescription>Choose the type of account you're creating</CardDescription>
                </CardHeader>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {ACCOUNT_TYPES.map((type) => {
                    const Icon = type.icon;
                    const isSelected = formData.accountType === type.value;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => updateField("accountType", type.value)}
                        className={cn(
                          "flex flex-col items-center p-6 rounded-lg border-2 transition-all text-left",
                          isSelected
                            ? "border-[#d3b07d] bg-[#faf6ef]"
                            : "border-slate-200 hover:border-[#e5cfa6] hover:bg-slate-50"
                        )}
                        data-testid={`select-type-${type.value.toLowerCase()}`}
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
                  <CardTitle>
                    {formData.accountType === "PROPERTY_MANAGER" ? "Company Information" : "Basic Account Information"}
                  </CardTitle>
                  <CardDescription>
                    {formData.accountType === "PROPERTY_MANAGER" 
                      ? "Enter the property management company details. Contacts can be added after creation."
                      : "Enter the primary details for this account"}
                  </CardDescription>
                </CardHeader>

                {/* Property Manager: Company-focused fields */}
                {formData.accountType === "PROPERTY_MANAGER" ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="companyName">Company Name *</Label>
                        <Input
                          id="companyName"
                          placeholder="ABC Property Management"
                          value={formData.companyName}
                          onChange={(e) => updateField("companyName", e.target.value)}
                          data-testid="input-company-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="displayName">Display Name *</Label>
                        <Input
                          id="displayName"
                          placeholder="Auto-filled from company name"
                          value={formData.displayName}
                          onChange={(e) => handleDisplayNameChange(e.target.value)}
                          data-testid="input-display-name"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="pmMainOfficePhone">Main Office Phone *</Label>
                        <Input
                          id="pmMainOfficePhone"
                          type="tel"
                          placeholder="(555) 555-5555"
                          value={formData.pmMainOfficePhone}
                          onChange={(e) => {
                            const formatted = formatPhoneNumber(e.target.value);
                            updateField("pmMainOfficePhone", formatted);
                          }}
                          className={formData.pmMainOfficePhone && !validatePhone(formData.pmMainOfficePhone) ? "border-red-500" : ""}
                          data-testid="input-main-office-phone"
                        />
                        {formData.pmMainOfficePhone && !validatePhone(formData.pmMainOfficePhone) && (
                          <p className="text-sm text-red-500 mt-1">Please enter a valid phone number</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pmMainOfficeEmail">Main Office Email</Label>
                        <Input
                          id="pmMainOfficeEmail"
                          type="email"
                          placeholder="office@company.com"
                          value={formData.pmMainOfficeEmail}
                          onChange={(e) => updateField("pmMainOfficeEmail", e.target.value)}
                          className={formData.pmMainOfficeEmail && !validateEmail(formData.pmMainOfficeEmail) ? "border-red-500" : ""}
                          data-testid="input-main-office-email"
                        />
                        {formData.pmMainOfficeEmail && !validateEmail(formData.pmMainOfficeEmail) && (
                          <p className="text-sm text-red-500 mt-1">Please enter a valid email (e.g., name@example.com)</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pmBillingApEmail">Billing / AP Email</Label>
                        <Input
                          id="pmBillingApEmail"
                          type="email"
                          placeholder="ap@company.com"
                          value={formData.pmBillingApEmail}
                          onChange={(e) => updateField("pmBillingApEmail", e.target.value)}
                          className={formData.pmBillingApEmail && !validateEmail(formData.pmBillingApEmail) ? "border-red-500" : ""}
                          data-testid="input-billing-ap-email"
                        />
                        {formData.pmBillingApEmail && !validateEmail(formData.pmBillingApEmail) && (
                          <p className="text-sm text-red-500 mt-1">Please enter a valid email (e.g., name@example.com)</p>
                        )}
                        <p className="text-xs text-slate-500">Recommended for invoice routing</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Residential & Commercial: Person-focused fields */}
                    <div className={`grid grid-cols-1 md:grid-cols-2 ${formData.accountType === "COMMERCIAL" ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-4`}>
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name *</Label>
                        <Input
                          id="firstName"
                          placeholder="Type Here"
                          value={formData.firstName}
                          onChange={(e) => updateField("firstName", e.target.value)}
                          data-testid="input-first-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          placeholder="Type Here"
                          value={formData.lastName}
                          onChange={(e) => updateField("lastName", e.target.value)}
                          data-testid="input-last-name"
                        />
                      </div>
                      {formData.accountType === "COMMERCIAL" && (
                        <div className="space-y-2">
                          <Label htmlFor="companyName">Company Name *</Label>
                          <Input
                            id="companyName"
                            placeholder="Type Here"
                            value={formData.companyName}
                            onChange={(e) => updateField("companyName", e.target.value)}
                            data-testid="input-company-name"
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label htmlFor="displayName">Display Name *</Label>
                        <Input
                          id="displayName"
                          placeholder="Type Here"
                          value={formData.displayName}
                          onChange={(e) => handleDisplayNameChange(e.target.value)}
                          data-testid="input-display-name"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="(555) 555-5555"
                          value={formData.phone}
                          onChange={(e) => {
                            const formatted = formatPhoneNumber(e.target.value);
                            updateField("phone", formatted);
                          }}
                          className={formData.phone && !validatePhone(formData.phone) ? "border-red-500" : ""}
                          data-testid="input-phone"
                        />
                        {formData.phone && !validatePhone(formData.phone) && (
                          <p className="text-sm text-red-500 mt-1">Please enter a valid phone number</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="email@example.com"
                          value={formData.email}
                          onChange={(e) => updateField("email", e.target.value)}
                          className={formData.email && !validateEmail(formData.email) ? "border-red-500" : ""}
                          data-testid="input-email"
                        />
                        {formData.email && !validateEmail(formData.email) && (
                          <p className="text-sm text-red-500 mt-1">Please enter a valid email (e.g., name@example.com)</p>
                        )}
                      </div>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Customer Type</Label>
                    <Badge className="w-full justify-center py-2 bg-slate-100 text-slate-700 border-slate-200" data-testid="badge-customer-type">
                      {ACCOUNT_TYPES.find(t => t.value === formData.accountType)?.label}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <Label>Customer Lead Source</Label>
                    <Select
                      value={formData.leadSource}
                      onValueChange={(val) => updateField("leadSource", val as LeadSource)}
                    >
                      <SelectTrigger data-testid="select-lead-source">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={4}>
                        {LEAD_SOURCES.map((source) => (
                          <SelectItem key={source.value} value={source.value}>{source.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pinnedNote">
                    {formData.accountType === "PROPERTY_MANAGER" ? "Important Instructions (Pinned Note)" : "Pinned Note"}
                  </Label>
                  <Textarea
                    id="pinnedNote"
                    placeholder={formData.accountType === "PROPERTY_MANAGER" 
                      ? "Special billing instructions, approval processes, or other important notes..."
                      : "Type Here"}
                    value={formData.pinnedNote}
                    onChange={(e) => updateField("pinnedNote", e.target.value)}
                    rows={3}
                    data-testid="textarea-pinned-note"
                  />
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6">
                <CardHeader className="px-0 pt-0">
                  <CardTitle>
                    {formData.accountType === "PROPERTY_MANAGER" ? "Company HQ / Mailing Address" : "Physical Location Details"}
                  </CardTitle>
                  <CardDescription>
                    {formData.accountType === "PROPERTY_MANAGER"
                      ? "Enter the company headquarters or billing address. Service properties can be added after creation."
                      : "Enter the primary service location for this account"}
                  </CardDescription>
                </CardHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="address1">Address Line 1 *</Label>
                    <Input
                      id="address1"
                      placeholder="Type Here"
                      value={formData.address1}
                      onChange={(e) => updateField("address1", e.target.value)}
                      data-testid="input-address1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address2">Address Line 2</Label>
                    <Input
                      id="address2"
                      placeholder="Type Here"
                      value={formData.address2}
                      onChange={(e) => updateField("address2", e.target.value)}
                      data-testid="input-address2"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      placeholder="Type Here"
                      value={formData.city}
                      onChange={(e) => updateField("city", e.target.value)}
                      data-testid="input-city"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State/Prov *</Label>
                    <Input
                      id="state"
                      placeholder="Type Here"
                      value={formData.state}
                      onChange={(e) => updateField("state", e.target.value)}
                      data-testid="input-state"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zip">Zip *</Label>
                    <Input
                      id="zip"
                      placeholder="Type Here"
                      value={formData.zip}
                      onChange={(e) => updateField("zip", e.target.value)}
                      data-testid="input-zip"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accessInstructions">Access Instructions</Label>
                  <Textarea
                    id="accessInstructions"
                    placeholder="Type Here"
                    value={formData.accessInstructions}
                    onChange={(e) => updateField("accessInstructions", e.target.value)}
                    rows={2}
                    data-testid="textarea-access-instructions"
                  />
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-6">
                <CardHeader className="px-0 pt-0">
                  <CardTitle>
                    {formData.accountType === "RESIDENTIAL" && "Residential Details"}
                    {formData.accountType === "PROPERTY_MANAGER" && "Property Manager Details"}
                    {formData.accountType === "COMMERCIAL" && "Commercial Details"}
                  </CardTitle>
                  <CardDescription>Enter additional details specific to this account type</CardDescription>
                </CardHeader>

                {formData.accountType === "RESIDENTIAL" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="specialInstructions">Special Instructions</Label>
                      <Textarea
                        id="specialInstructions"
                        placeholder="Any special preferences or instructions..."
                        value={formData.specialInstructions}
                        onChange={(e) => updateField("specialInstructions", e.target.value)}
                        rows={3}
                        data-testid="textarea-special-instructions"
                      />
                    </div>
                  </div>
                )}

                {formData.accountType === "PROPERTY_MANAGER" && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-slate-900">Billing & Payment Terms</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Billing Terms</Label>
                        <Select
                          value={formData.pmBillingTerms}
                          onValueChange={(val) => updateField("pmBillingTerms", val)}
                        >
                          <SelectTrigger data-testid="select-billing-terms">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent position="popper" sideOffset={4}>
                            <SelectItem value="DUE_ON_RECEIPT">Due on Receipt</SelectItem>
                            <SelectItem value="NET_15">Net 15</SelectItem>
                            <SelectItem value="NET_30">Net 30</SelectItem>
                            <SelectItem value="NET_45">Net 45</SelectItem>
                            <SelectItem value="NET_60">Net 60</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Default Payment Method</Label>
                        <Select
                          value={formData.defaultBillingMethod}
                          onValueChange={(val) => updateField("defaultBillingMethod", val)}
                        >
                          <SelectTrigger data-testid="select-billing-method">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent position="popper" sideOffset={4}>
                            {BILLING_METHODS.map((method) => (
                              <SelectItem key={method} value={method}>{method}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Advanced Settings - collapsed by default */}
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 py-2">
                        <ChevronRight className="h-4 w-4 transition-transform duration-200 [[data-state=open]>&]:rotate-90" />
                        Advanced Settings
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-2">
                        <div className="space-y-2 pl-6 border-l-2 border-slate-200">
                          <Label>Default Bill-To</Label>
                          <Select
                            value={formData.pmDefaultBillTo}
                            onValueChange={(val) => updateField("pmDefaultBillTo", val)}
                          >
                            <SelectTrigger data-testid="select-default-bill-to" className="w-48">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent position="popper" sideOffset={4}>
                              <SelectItem value="PM">Property Manager</SelectItem>
                              <SelectItem value="OWNER">Owner</SelectItem>
                              <SelectItem value="TENANT">Tenant</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-slate-500">Default is Property Manager (90% of cases)</p>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    <Separator />
                    <h4 className="font-medium text-slate-900">Approval Settings</h4>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="requiresApprovalBefore"
                        checked={formData.requiresApprovalBefore}
                        onCheckedChange={(checked) => updateField("requiresApprovalBefore", !!checked)}
                        data-testid="checkbox-requires-approval"
                      />
                      <Label htmlFor="requiresApprovalBefore" className="text-sm">Requires Approval Before Work</Label>
                    </div>
                    {formData.requiresApprovalBefore && (
                      <div className="space-y-2 ml-6">
                        <Label htmlFor="approvalThreshold">Approval Limit ($)</Label>
                        <Input
                          id="approvalThreshold"
                          type="number"
                          placeholder="Amount above which approval is required"
                          value={formData.approvalThreshold}
                          onChange={(e) => updateField("approvalThreshold", e.target.value)}
                          className="w-48"
                          data-testid="input-approval-threshold"
                        />
                        <p className="text-xs text-slate-500">Leave blank if all work requires approval</p>
                      </div>
                    )}

                    <Separator />
                    <h4 className="font-medium text-slate-900">Portfolio Information</h4>
                    <div className="space-y-2">
                      <Label htmlFor="portfolioSize">Portfolio Size (# of properties)</Label>
                      <Input
                        id="portfolioSize"
                        type="number"
                        placeholder="Approximate number of properties managed"
                        value={formData.portfolioSize}
                        onChange={(e) => updateField("portfolioSize", e.target.value)}
                        className="w-48"
                        data-testid="input-portfolio-size"
                      />
                    </div>
                    
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mt-4">
                      <p className="text-sm text-blue-800">
                        After creating this account, you can add <strong>Sites/Properties</strong> (service addresses) 
                        and <strong>Contacts</strong> (ops, AP, etc.) from the account detail page.
                      </p>
                    </div>
                  </div>
                )}

                {formData.accountType === "COMMERCIAL" && (
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="taxExempt"
                        checked={formData.taxExempt}
                        onCheckedChange={(checked) => updateField("taxExempt", !!checked)}
                        data-testid="checkbox-tax-exempt"
                      />
                      <Label htmlFor="taxExempt" className="text-sm">Tax Exempt</Label>
                    </div>
                    {formData.taxExempt && (
                      <div className="space-y-2 ml-6">
                        <Label htmlFor="taxExemptNumber">Tax Exempt Number</Label>
                        <Input
                          id="taxExemptNumber"
                          placeholder="Type Here"
                          value={formData.taxExemptNumber}
                          onChange={(e) => updateField("taxExemptNumber", e.target.value)}
                          data-testid="input-tax-exempt-number"
                        />
                      </div>
                    )}
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="requiresPO"
                        checked={formData.requiresPO}
                        onCheckedChange={(checked) => updateField("requiresPO", !!checked)}
                        data-testid="checkbox-requires-po"
                      />
                      <Label htmlFor="requiresPO" className="text-sm">Requires PO</Label>
                    </div>
                    {formData.requiresPO && (
                      <div className="space-y-2 ml-6">
                        <Label htmlFor="poPrefix">PO Prefix</Label>
                        <Input
                          id="poPrefix"
                          placeholder="Type Here"
                          value={formData.poPrefix}
                          onChange={(e) => updateField("poPrefix", e.target.value)}
                          data-testid="input-po-prefix"
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="commercialNetTerms">Net Terms</Label>
                      <Input
                        id="commercialNetTerms"
                        type="number"
                        value={formData.commercialNetTerms}
                        onChange={(e) => updateField("commercialNetTerms", e.target.value)}
                        className="w-48"
                        data-testid="input-commercial-net-terms"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="billingAddressDifferent"
                        checked={formData.billingAddressDifferent}
                        onCheckedChange={(checked) => updateField("billingAddressDifferent", !!checked)}
                        data-testid="checkbox-billing-different"
                      />
                      <Label htmlFor="billingAddressDifferent" className="text-sm">Billing address different from site</Label>
                    </div>
                    {formData.billingAddressDifferent && (
                      <div className="ml-6 space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="billingAddress">Billing Address</Label>
                          <Input
                            id="billingAddress"
                            placeholder="Type Here"
                            value={formData.billingAddress}
                            onChange={(e) => updateField("billingAddress", e.target.value)}
                            data-testid="input-billing-address"
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="billingCity">City</Label>
                            <Input
                              id="billingCity"
                              placeholder="Type Here"
                              value={formData.billingCity}
                              onChange={(e) => updateField("billingCity", e.target.value)}
                              data-testid="input-billing-city"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="billingState">State</Label>
                            <Input
                              id="billingState"
                              placeholder="Type Here"
                              value={formData.billingState}
                              onChange={(e) => updateField("billingState", e.target.value)}
                              data-testid="input-billing-state"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="billingZip">Zip</Label>
                            <Input
                              id="billingZip"
                              placeholder="Type Here"
                              value={formData.billingZip}
                              onChange={(e) => updateField("billingZip", e.target.value)}
                              data-testid="input-billing-zip"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="w9OnFile"
                        checked={formData.w9OnFile}
                        onCheckedChange={(checked) => updateField("w9OnFile", !!checked)}
                        data-testid="checkbox-w9-on-file"
                      />
                      <Label htmlFor="w9OnFile" className="text-sm">W9 On File</Label>
                    </div>
                  </div>
                )}

                <Separator className="my-6" />

                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 py-2">
                    <ChevronRight className="h-4 w-4 transition-transform duration-200 [[data-state=open]>&]:rotate-90" />
                    Lead & Sales Funnel
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="isProspect" className="text-sm font-medium">Track in Sales Funnel</Label>
                        <p className="text-xs text-slate-500 mt-1">Enable to track this customer through the sales pipeline</p>
                      </div>
                      <Switch
                        id="isProspect"
                        checked={formData.isProspect}
                        onCheckedChange={(checked) => updateField("isProspect", checked)}
                        data-testid="switch-is-prospect"
                      />
                    </div>

                    {formData.isProspect && (
                      <div className="space-y-4 pl-4 border-l-2 border-slate-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Sales Stage</Label>
                            <Select
                              value={formData.salesStage}
                              onValueChange={(val) => updateField("salesStage", val)}
                            >
                              <SelectTrigger data-testid="select-sales-stage">
                                <SelectValue placeholder="Select stage" />
                              </SelectTrigger>
                              <SelectContent position="popper" sideOffset={4}>
                                <SelectItem value="new">New</SelectItem>
                                <SelectItem value="contacted">Contacted</SelectItem>
                                <SelectItem value="quote_sent">Quote Sent</SelectItem>
                                <SelectItem value="negotiating">Negotiating</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Interest Level</Label>
                            <Select
                              value={formData.interestLevel}
                              onValueChange={(val) => updateField("interestLevel", val)}
                            >
                              <SelectTrigger data-testid="select-interest-level">
                                <SelectValue placeholder="Select interest" />
                              </SelectTrigger>
                              <SelectContent position="popper" sideOffset={4}>
                                <SelectItem value="hot">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="destructive" className="text-xs">Hot</Badge>
                                  </div>
                                </SelectItem>
                                <SelectItem value="warm">
                                  <div className="flex items-center gap-2">
                                    <Badge className="bg-yellow-500 hover:bg-yellow-600 text-xs">Warm</Badge>
                                  </div>
                                </SelectItem>
                                <SelectItem value="cold">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">Cold</Badge>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Potential Value ($)</Label>
                          <Input
                            type="number"
                            placeholder="e.g., 5000"
                            value={formData.potentialValue}
                            onChange={(e) => updateField("potentialValue", e.target.value)}
                            data-testid="input-potential-value"
                          />
                          <p className="text-xs text-slate-500">Estimated value of this lead</p>
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="scheduleFollowUp" className="text-sm font-medium">Schedule Initial Follow-up</Label>
                            <p className="text-xs text-slate-500 mt-1">Set a reminder to follow up with this lead</p>
                          </div>
                          <Switch
                            id="scheduleFollowUp"
                            checked={formData.scheduleFollowUp}
                            onCheckedChange={(checked) => updateField("scheduleFollowUp", checked)}
                            data-testid="switch-schedule-followup"
                          />
                        </div>

                        {formData.scheduleFollowUp && (
                          <div className="space-y-4 pl-4 border-l-2 border-amber-200 bg-amber-50/50 p-3 rounded-r-md">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Follow-up Type</Label>
                                <Select
                                  value={formData.followUpType}
                                  onValueChange={(val) => updateField("followUpType", val)}
                                >
                                  <SelectTrigger data-testid="select-followup-type">
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                  <SelectContent position="popper" sideOffset={4}>
                                    <SelectItem value="call">Phone Call</SelectItem>
                                    <SelectItem value="email">Email</SelectItem>
                                    <SelectItem value="visit">Site Visit</SelectItem>
                                    <SelectItem value="text">Text Message</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>Follow-up Date *</Label>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !formData.followUpDate && "text-muted-foreground"
                                      )}
                                      data-testid="button-followup-date"
                                    >
                                      <CalendarIcon className="mr-2 h-4 w-4" />
                                      {formData.followUpDate ? format(formData.followUpDate, "PPP") : "Pick a date"}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={formData.followUpDate || undefined}
                                      onSelect={(date) => updateField("followUpDate", date || null)}
                                      disabled={(date) => date < new Date()}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="followUpNotes">Follow-up Notes</Label>
                              <Textarea
                                id="followUpNotes"
                                placeholder="Notes for the follow-up..."
                                value={formData.followUpNotes}
                                onChange={(e) => updateField("followUpNotes", e.target.value)}
                                rows={2}
                                data-testid="textarea-followup-notes"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-6">
                <CardHeader className="px-0 pt-0">
                  <CardTitle>Review & Create</CardTitle>
                  <CardDescription>Review all information before creating the account</CardDescription>
                </CardHeader>

                {!checkValidation(5).valid && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-red-800">Please fix the following errors:</h4>
                      <ul className="mt-1 text-sm text-red-700 list-disc list-inside">
                        {checkValidation(5).errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-semibold text-slate-900 border-b pb-2">Account Information</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Account Type:</span>
                        <span className="font-medium">{ACCOUNT_TYPES.find(t => t.value === formData.accountType)?.label}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Display Name:</span>
                        <span className="font-medium">{formData.displayName || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">First Name:</span>
                        <span>{formData.firstName || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Last Name:</span>
                        <span>{formData.lastName || "—"}</span>
                      </div>
                      {formData.companyName && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Company:</span>
                          <span>{formData.companyName}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500">Phone:</span>
                        <span>{formData.phone || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Email:</span>
                        <span>{formData.email || "—"}</span>
                      </div>
                      {formData.leadSource && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Lead Source:</span>
                          <span>{LEAD_SOURCES.find(s => s.value === formData.leadSource)?.label}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-slate-900 border-b pb-2">Primary Location</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Address:</span>
                        <span className="text-right">
                          {formData.address1 || "—"}
                          {formData.address2 && <><br />{formData.address2}</>}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">City, State, ZIP:</span>
                        <span>{[formData.city, formData.state, formData.zip].filter(Boolean).join(", ") || "—"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {formData.accountType === "PROPERTY_MANAGER" && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-slate-900 border-b pb-2">Property Manager Details</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      {formData.managementCompanyName && (
                        <div>
                          <span className="text-slate-500 block">Management Company:</span>
                          <span className="font-medium">{formData.managementCompanyName}</span>
                        </div>
                      )}
                      {formData.portfolioSize && (
                        <div>
                          <span className="text-slate-500 block">Portfolio Size:</span>
                          <span className="font-medium">{formData.portfolioSize}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-slate-500 block">Net Terms:</span>
                        <span className="font-medium">{formData.pmNetTerms} days</span>
                      </div>
                      {formData.requiresApprovalBefore && (
                        <div>
                          <span className="text-slate-500 block">Approval Required:</span>
                          <span className="font-medium">Yes {formData.approvalThreshold && `(over $${formData.approvalThreshold})`}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {formData.accountType === "COMMERCIAL" && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-slate-900 border-b pb-2">Commercial Details</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-slate-500 block">Net Terms:</span>
                        <span className="font-medium">{formData.commercialNetTerms} days</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Tax Exempt:</span>
                        <span className="font-medium">{formData.taxExempt ? `Yes (${formData.taxExemptNumber || "—"})` : "No"}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Requires PO:</span>
                        <span className="font-medium">{formData.requiresPO ? `Yes (${formData.poPrefix || "—"})` : "No"}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">W9 On File:</span>
                        <span className="font-medium">{formData.w9OnFile ? "Yes" : "No"}</span>
                      </div>
                    </div>
                  </div>
                )}

                {formData.pinnedNote && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-slate-900 border-b pb-2">Pinned Note</h3>
                    <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">{formData.pinnedNote}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
            data-testid="button-back-step"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex gap-2">
            {currentStep < 5 ? (
              <Button onClick={handleNext} disabled={!canProceed(currentStep)} data-testid="button-next-step">
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!checkValidation(5).valid || createCustomerMutation.isPending}
                data-testid="button-create-customer"
              >
                {createCustomerMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Customer...
                  </>
                ) : (
                  "Create Customer"
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </CrmLayout>
  );
}
