import { useState, useEffect } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Pencil,
  Trash2,
  ExternalLink,
  AlertCircle,
  CalendarIcon,
  Building2,
  Home,
  Users,
  Star,
  User,
  Briefcase,
  CreditCard,
  FileText,
  Clock,
  CheckCircle2,
  Circle,
  LayoutDashboard,
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CrmLayout } from "@/components/crm/crm-layout";
import type {
  CrmUser,
  CrmAccount,
  CrmSite,
  CrmContact,
  CrmJob,
  ResidentialProfile,
  PropertyManagerProfile,
  CommercialProfile,
  AccountType,
  AccountStatus,
  ContactRole,
} from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatPhoneNumber, validateEmail, validatePhone } from "@/lib/form-utils";

const CONTACT_ROLES: ContactRole[] = [
  "OWNER", "PM", "TENANT", "AP", "FACILITIES",
  "DECISION_MAKER", "BILLING", "PRIMARY", "EMERGENCY", "OTHER"
];

const JOB_TYPES = ["SERVICE", "INSTALL", "MAINTENANCE", "SALES"] as const;
const PRIORITIES = ["low", "normal", "high"] as const;

const statusColors: Record<string, { bg: string; text: string }> = {
  new: { bg: "bg-slate-100", text: "text-slate-700" },
  scheduled: { bg: "bg-blue-100", text: "text-blue-700" },
  dispatched: { bg: "bg-purple-100", text: "text-purple-700" },
  en_route: { bg: "bg-amber-100", text: "text-amber-700" },
  on_site: { bg: "bg-orange-100", text: "text-orange-700" },
  completed: { bg: "bg-green-100", text: "text-green-700" },
  invoiced: { bg: "bg-teal-100", text: "text-teal-700" },
  paid: { bg: "bg-emerald-100", text: "text-emerald-700" },
  cancelled: { bg: "bg-red-100", text: "text-red-700" },
};

const accountTypeColors: Record<AccountType, { bg: string; text: string }> = {
  RESIDENTIAL: { bg: "bg-blue-100", text: "text-blue-700" },
  PROPERTY_MANAGER: { bg: "bg-purple-100", text: "text-purple-700" },
  COMMERCIAL: { bg: "bg-amber-100", text: "text-amber-700" },
};

const accountStatusColors: Record<AccountStatus, { bg: string; text: string }> = {
  PROSPECT: { bg: "bg-slate-100", text: "text-slate-700" },
  ACTIVE: { bg: "bg-green-100", text: "text-green-700" },
  INACTIVE: { bg: "bg-yellow-100", text: "text-yellow-700" },
  DO_NOT_SERVICE: { bg: "bg-red-100", text: "text-red-700" },
};

interface AccountDetailData {
  account: CrmAccount;
  sites: CrmSite[];
  contacts: CrmContact[];
  jobs: CrmJob[];
  residentialProfile?: ResidentialProfile | null;
  propertyManagerProfile?: PropertyManagerProfile | null;
  commercialProfile?: CommercialProfile | null;
}

interface DispatchResponse {
  technicians: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(date: Date | string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CrmAccountDetail() {
  usePageTitle("Account Detail");
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const accountId = params.id;
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("locations");
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [deleteSiteId, setDeleteSiteId] = useState<string | null>(null);
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [editingSite, setEditingSite] = useState<CrmSite | null>(null);
  const [editingContact, setEditingContact] = useState<CrmContact | null>(null);
  const [editAccountDialogOpen, setEditAccountDialogOpen] = useState(false);
  const [editAccountForm, setEditAccountForm] = useState({ displayName: "", companyName: "", pinnedNote: "" });

  const [siteForm, setSiteForm] = useState({
    siteName: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    zip: "",
    isPrimary: false,
    accessInstructions: "",
    gateCode: "",
    notes: "",
    tenantName: "",
    tenantPhone: "",
    tenantEmail: "",
  });

  const [contactForm, setContactForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    contactRole: "PRIMARY" as ContactRole,
    isPrimary: false,
    isPreferred: false,
    notes: "",
    siteId: "",
  });
  const [contactEmailError, setContactEmailError] = useState("");
  const [contactPhoneError, setContactPhoneError] = useState("");
  const [tenantEmailError, setTenantEmailError] = useState("");
  const [tenantPhoneError, setTenantPhoneError] = useState("");

  const [jobForm, setJobForm] = useState({
    jobType: "SERVICE",
    priority: "normal",
    description: "",
    scheduledStart: new Date(),
    startTime: "08:00",
    duration: 120,
  });

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: accountData, isLoading: accountLoading } = useQuery<AccountDetailData>({
    queryKey: ["/api/crm/accounts", accountId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/accounts/${accountId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch account");
      return res.json();
    },
    enabled: !!currentUser && !!accountId,
  });

  const { data: dispatchData } = useQuery<DispatchResponse>({
    queryKey: ["/api/crm/dispatch"],
    queryFn: async () => {
      const res = await fetch("/api/crm/dispatch", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch technicians");
      return res.json();
    },
    enabled: !!currentUser && jobDialogOpen,
  });

  const technicians = dispatchData?.technicians || [];

  useEffect(() => {
    if (accountData?.account?.accountType === "PROPERTY_MANAGER") {
      setActiveTab("overview");
    }
  }, [accountData?.account?.accountType]);

  useEffect(() => {
    if (editAccountDialogOpen && accountData?.account) {
      setEditAccountForm({
        displayName: accountData.account.displayName || "",
        companyName: accountData.account.companyName || "",
        pinnedNote: accountData.account.pinnedNote || "",
      });
    }
  }, [editAccountDialogOpen, accountData?.account]);

  const resetSiteForm = () => {
    setSiteForm({
      siteName: "",
      address1: "",
      address2: "",
      city: "",
      state: "",
      zip: "",
      isPrimary: false,
      accessInstructions: "",
      gateCode: "",
      notes: "",
      tenantName: "",
      tenantPhone: "",
      tenantEmail: "",
    });
    setTenantEmailError("");
    setTenantPhoneError("");
    setEditingSite(null);
  };

  const resetContactForm = () => {
    setContactForm({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      contactRole: "PRIMARY",
      isPrimary: false,
      isPreferred: false,
      notes: "",
      siteId: "",
    });
    setEditingContact(null);
    setContactEmailError("");
    setContactPhoneError("");
  };

  const resetJobForm = () => {
    setJobForm({
      jobType: "SERVICE",
      priority: "normal",
      description: "",
      scheduledStart: new Date(),
      startTime: "08:00",
      duration: 120,
    });
  };

  const openEditSite = (site: CrmSite) => {
    setEditingSite(site);
    setSiteForm({
      siteName: site.siteName || "",
      address1: site.address1,
      address2: site.address2 || "",
      city: site.city,
      state: site.state,
      zip: site.zip,
      isPrimary: site.isPrimary || false,
      accessInstructions: site.accessInstructions || "",
      gateCode: site.gateCode || "",
      notes: site.notes || "",
      tenantName: site.tenantName || "",
      tenantPhone: site.tenantPhone || "",
      tenantEmail: site.tenantEmail || "",
    });
    setSiteDialogOpen(true);
  };

  const openEditContact = (contact: CrmContact) => {
    setEditingContact(contact);
    setContactForm({
      firstName: contact.firstName,
      lastName: contact.lastName || "",
      email: contact.email || "",
      phone: contact.phone || "",
      contactRole: contact.contactRole,
      isPrimary: contact.isPrimary || false,
      isPreferred: contact.isPreferred || false,
      notes: contact.notes || "",
      siteId: contact.siteId || "",
    });
    setContactDialogOpen(true);
  };

  const createSiteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/accounts/${accountId}/sites`, siteForm);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Location created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/accounts", accountId] });
      setSiteDialogOpen(false);
      resetSiteForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create location", description: error.message, variant: "destructive" });
    },
  });

  const updateSiteMutation = useMutation({
    mutationFn: async () => {
      if (!editingSite) throw new Error("No site to update");
      const res = await apiRequest("PUT", `/api/crm/accounts/${accountId}/sites/${editingSite.id}`, siteForm);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Location updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/accounts", accountId] });
      setSiteDialogOpen(false);
      resetSiteForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update location", description: error.message, variant: "destructive" });
    },
  });

  const deleteSiteMutation = useMutation({
    mutationFn: async (siteId: string) => {
      const res = await apiRequest("DELETE", `/api/crm/accounts/${accountId}/sites/${siteId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Location deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/accounts", accountId] });
      setDeleteSiteId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete location", description: error.message, variant: "destructive" });
    },
  });

  const createContactMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...contactForm, siteId: contactForm.siteId || null };
      const res = await apiRequest("POST", `/api/crm/accounts/${accountId}/contacts`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contact created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/accounts", accountId] });
      setContactDialogOpen(false);
      resetContactForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create contact", description: error.message, variant: "destructive" });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async () => {
      if (!editingContact) throw new Error("No contact to update");
      const payload = { ...contactForm, siteId: contactForm.siteId || null };
      const res = await apiRequest("PUT", `/api/crm/accounts/${accountId}/contacts/${editingContact.id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contact updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/accounts", accountId] });
      setContactDialogOpen(false);
      resetContactForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update contact", description: error.message, variant: "destructive" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const res = await apiRequest("DELETE", `/api/crm/accounts/${accountId}/contacts/${contactId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contact deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/accounts", accountId] });
      setDeleteContactId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete contact", description: error.message, variant: "destructive" });
    },
  });

  const createJobMutation = useMutation({
    mutationFn: async () => {
      const [hours, minutes] = jobForm.startTime.split(":").map(Number);
      const scheduledStart = new Date(jobForm.scheduledStart);
      scheduledStart.setHours(hours, minutes, 0, 0);

      const scheduledEnd = new Date(scheduledStart);
      scheduledEnd.setMinutes(scheduledEnd.getMinutes() + jobForm.duration);

      const res = await apiRequest("POST", "/api/crm/jobs", {
        customerId: accountId,
        jobType: jobForm.jobType,
        description: jobForm.description || null,
        priority: jobForm.priority,
        status: "new",
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Project created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/accounts", accountId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
      setJobDialogOpen(false);
      resetJobForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create project", description: error.message, variant: "destructive" });
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/crm/accounts/${accountId}`, editAccountForm);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Account updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/accounts", accountId] });
      setEditAccountDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update account", description: error.message, variant: "destructive" });
    },
  });

  if (authLoading || accountLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    navigate("/crm/login");
    return null;
  }

  if (!accountData?.account) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="space-y-6">
          <Button variant="ghost" onClick={() => window.history.back()} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600">Account not found</p>
            </CardContent>
          </Card>
        </div>
      </CrmLayout>
    );
  }

  const { account, residentialProfile, propertyManagerProfile, commercialProfile } = accountData;
  const sites = accountData.sites || [];
  const contacts = accountData.contacts || [];
  const jobs = accountData.jobs || [];
  const typeColors = accountTypeColors[account.accountType];
  const statusColorSet = accountStatusColors[account.accountStatus];
  const primarySite = sites.find(s => s.isPrimary);
  const displaySites = account.accountType === "PROPERTY_MANAGER" ? sites.filter(s => !s.isPrimary) : sites;

  const AccountTypeIcon = account.accountType === "RESIDENTIAL" ? Home : account.accountType === "PROPERTY_MANAGER" ? Users : Building2;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => window.history.back()} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>

        <Card className="bg-white shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className={cn("p-3 rounded-lg", typeColors.bg)}>
                  <AccountTypeIcon className={cn("h-6 w-6", typeColors.text)} />
                </div>
                <div>
                  <CardTitle className="text-2xl" data-testid="text-account-name">
                    {account.displayName}
                  </CardTitle>
                  {account.companyName && (
                    <p className="text-slate-500 mt-1" data-testid="text-company-name">
                      {account.companyName}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-3">
                    <StatusDot pill={cn(typeColors.bg, typeColors.text, "border-0")} data-testid="badge-account-type">
                      {account.accountType.replace("_", " ")}
                    </StatusDot>
                    <StatusDot pill={cn(statusColorSet.bg, statusColorSet.text, "border-0")} data-testid="badge-account-status">
                      {account.accountStatus.replace("_", " ")}
                    </StatusDot>
                    {account.customerSince && (
                      <div className="flex items-center gap-1 text-sm text-slate-500 ml-2">
                        <Calendar className="h-4 w-4" />
                        <span>Customer since {formatDate(account.customerSince)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="outline" data-testid="button-edit-customer" onClick={() => setEditAccountDialogOpen(true)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit Customer
              </Button>
            </div>
            {account.pinnedNote && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">{account.pinnedNote}</p>
              </div>
            )}
          </CardHeader>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-6 flex-wrap">
            {account.accountType === "PROPERTY_MANAGER" && (
              <TabsTrigger value="overview" data-testid="tab-overview" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none">
                <LayoutDashboard className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
            )}
            <TabsTrigger value="locations" data-testid="tab-locations" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none">
              <MapPin className="h-4 w-4 mr-2" />
              Locations {displaySites.length}
            </TabsTrigger>
            <TabsTrigger value="contacts" data-testid="tab-contacts" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none">
              <User className="h-4 w-4 mr-2" />
              Contacts {contacts.length}
            </TabsTrigger>
            <TabsTrigger value="jobs" data-testid="tab-jobs" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none">
              <Briefcase className="h-4 w-4 mr-2" />
              Projects {jobs.length}
            </TabsTrigger>
            <TabsTrigger value="profile" data-testid="tab-profile" className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none">
              <FileText className="h-4 w-4 mr-2" />
              Profile
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Customer Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {account.companyName && (
                    <div>
                      <Label className="text-slate-500 text-sm">Company Name</Label>
                      <p className="font-medium">{account.companyName}</p>
                    </div>
                  )}
                  {account.accountType === "PROPERTY_MANAGER" && propertyManagerProfile?.portfolioSize && (
                    <div>
                      <Label className="text-slate-500 text-sm">Portfolio Size</Label>
                      <p className="font-medium">{propertyManagerProfile.portfolioSize} properties</p>
                    </div>
                  )}
                  {(() => {
                    const primaryContact = contacts.find((c) => c.isPrimary);
                    if (primaryContact) {
                      return (
                        <div>
                          <Label className="text-slate-500 text-sm">Primary Contact</Label>
                          <p className="font-medium">
                            {primaryContact.firstName} {primaryContact.lastName}
                          </p>
                          {primaryContact.phone && (
                            <p className="text-sm text-slate-500">
                              <Phone className="h-3 w-3 inline mr-1" />
                              {primaryContact.phone}
                            </p>
                          )}
                          {primaryContact.email && (
                            <p className="text-sm text-slate-500">
                              <Mail className="h-3 w-3 inline mr-1" />
                              {primaryContact.email}
                            </p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {primarySite && (
                    <div>
                      <Label className="text-slate-500 text-sm">HQ / Mailing Address</Label>
                      <p className="font-medium">{primarySite.address1}</p>
                      {primarySite.address2 && <p className="text-sm text-slate-500">{primarySite.address2}</p>}
                      <p className="text-sm text-slate-500">{primarySite.city}, {primarySite.state} {primarySite.zip}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {account.accountType === "PROPERTY_MANAGER" && (
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Setup Checklist</CardTitle>
                    {(() => {
                      const hasSite = displaySites.length > 0;
                      const hasOpsContact = contacts.some((c) => c.contactRole === "FACILITIES" || c.contactRole === "PRIMARY");
                      const hasApContact = contacts.some((c) => c.contactRole === "AP" || c.contactRole === "BILLING");
                      const hasJob = jobs.length > 0;
                      const completedCount = [hasSite, hasOpsContact, hasApContact, hasJob].filter(Boolean).length;
                      const percentage = Math.round((completedCount / 4) * 100);
                      return (
                        <StatusDot pill={cn(
                          percentage === 100 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700",
                          "border-0"
                        )} data-testid="badge-checklist-percentage">
                          {percentage}% Complete
                        </StatusDot>
                      );
                    })()}
                  </div>
                  <CardDescription>Complete these steps to fully set up this property manager account</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(() => {
                      const hasSite = displaySites.length > 0;
                      const hasOpsContact = contacts.some((c) => c.contactRole === "FACILITIES" || c.contactRole === "PRIMARY");
                      const hasApContact = contacts.some((c) => c.contactRole === "AP" || c.contactRole === "BILLING");
                      const hasJob = jobs.length > 0;

                      const checklistItems = [
                        {
                          id: "location",
                          label: "Add at least 1 Location/Property",
                          completed: hasSite,
                          action: () => {
                            resetSiteForm();
                            setSiteDialogOpen(true);
                          },
                          buttonLabel: "Add Location",
                        },
                        {
                          id: "ops-contact",
                          label: "Add Ops Contact (Facilities or Primary)",
                          completed: hasOpsContact,
                          action: () => {
                            resetContactForm();
                            setContactDialogOpen(true);
                          },
                          buttonLabel: "Add Contact",
                        },
                        {
                          id: "ap-contact",
                          label: "Add AP/Billing Contact",
                          completed: hasApContact,
                          action: () => {
                            resetContactForm();
                            setContactForm((prev) => ({ ...prev, contactRole: "AP" as ContactRole }));
                            setContactDialogOpen(true);
                          },
                          buttonLabel: "Add Contact",
                        },
                        {
                          id: "job",
                          label: "Create first Project",
                          completed: hasJob,
                          action: () => {
                            resetJobForm();
                            setJobDialogOpen(true);
                          },
                          buttonLabel: "Create Project",
                        },
                      ];

                      return checklistItems.map((item, index) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                          data-testid={`checklist-item-${item.id}`}
                        >
                          <div className="flex items-center gap-3">
                            {item.completed ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600" />
                            ) : (
                              <Circle className="h-5 w-5 text-slate-300" />
                            )}
                            <span className={cn(
                              "font-medium",
                              item.completed ? "text-slate-500 line-through" : "text-slate-700"
                            )}>
                              Step {index + 1}: {item.label}
                            </span>
                          </div>
                          {!item.completed && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-w-[120px]"
                              onClick={item.action}
                              data-testid={`button-checklist-${item.id}`}
                            >
                              {item.buttonLabel}
                            </Button>
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="locations" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle className="text-lg">Locations</CardTitle>
                <Button
                  size="sm"
                  onClick={() => {
                    resetSiteForm();
                    setSiteDialogOpen(true);
                  }}
                  data-testid="button-add-location"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Location
                </Button>
              </CardHeader>
              <CardContent>
                {displaySites.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No locations added yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {displaySites.map((site) => (
                      <div
                        key={site.id}
                        className="flex items-start justify-between p-4 border rounded-lg hover:bg-slate-50"
                        data-testid={`location-card-${site.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {site.siteName && <span className="font-medium">{site.siteName}</span>}
                            {site.isPrimary && (
                              <StatusDot pill="bg-green-50 text-green-700 border-green-200">
                                <Star className="h-3 w-3 mr-1" />
                                Primary
                              </StatusDot>
                            )}
                          </div>
                          <p className="text-slate-600 mt-1">
                            {site.address1}
                            {site.address2 && `, ${site.address2}`}
                          </p>
                          <p className="text-slate-500 text-sm">
                            {site.city}, {site.state} {site.zip}
                          </p>
                          {(site.tenantName || site.tenantPhone || site.tenantEmail) && (
                            <div className="mt-2 p-2 bg-slate-50 rounded text-sm">
                              <span className="font-medium text-slate-700">Tenant: </span>
                              {site.tenantName && <span>{site.tenantName}</span>}
                              {site.tenantPhone && (
                                <span className="ml-2 text-slate-500">
                                  <Phone className="h-3 w-3 inline mr-1" />
                                  {site.tenantPhone}
                                </span>
                              )}
                              {site.tenantEmail && (
                                <span className="ml-2 text-slate-500">
                                  <Mail className="h-3 w-3 inline mr-1" />
                                  {site.tenantEmail}
                                </span>
                              )}
                            </div>
                          )}
                          {site.accessInstructions && (
                            <p className="text-sm text-slate-500 mt-1">
                              <span className="font-medium">Access:</span> {site.accessInstructions}
                            </p>
                          )}
                          {site.gateCode && (
                            <p className="text-sm text-slate-500">
                              <span className="font-medium">Gate:</span> {site.gateCode}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditSite(site)}
                            data-testid={`button-edit-location-${site.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteSiteId(site.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            data-testid={`button-delete-location-${site.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contacts" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle className="text-lg">Contacts</CardTitle>
                <Button
                  size="sm"
                  onClick={() => {
                    resetContactForm();
                    setContactDialogOpen(true);
                  }}
                  data-testid="button-add-contact"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contact
                </Button>
              </CardHeader>
              <CardContent>
                {contacts.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <User className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No contacts added yet</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contacts.map((contact) => (
                        <TableRow key={contact.id} data-testid={`contact-row-${contact.id}`}>
                          <TableCell className="font-medium">
                            {contact.firstName} {contact.lastName}
                          </TableCell>
                          <TableCell>
                            {contact.phone ? (
                              <a href={`tel:${contact.phone}`} className="text-blue-600 hover:underline">
                                {contact.phone}
                              </a>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            {contact.email ? (
                              <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">
                                {contact.email}
                              </a>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {contact.contactRole.toLowerCase().replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {contact.isPrimary && (
                                <StatusDot pill="bg-green-100 text-green-700 border-0">Primary</StatusDot>
                              )}
                              {contact.isPreferred && (
                                <StatusDot pill="bg-blue-100 text-blue-700 border-0">Preferred</StatusDot>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditContact(contact)}
                              data-testid={`button-edit-contact-${contact.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteContactId(contact.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              data-testid={`button-delete-contact-${contact.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle className="text-lg">Projects</CardTitle>
                <Button
                  size="sm"
                  onClick={() => {
                    resetJobForm();
                    setJobDialogOpen(true);
                  }}
                  data-testid="button-add-job"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Project
                </Button>
              </CardHeader>
              <CardContent>
                {jobs.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Briefcase className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No projects yet</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Scheduled</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((job) => {
                        const colors = statusColors[job.status] || statusColors.new;
                        return (
                          <TableRow key={job.id} data-testid={`job-row-${job.id}`}>
                            <TableCell className="font-medium">{job.jobType}</TableCell>
                            <TableCell>
                              <StatusDot pill={cn(colors.bg, colors.text, "border-0 capitalize")}>
                                {job.status.replace("_", " ")}
                              </StatusDot>
                            </TableCell>
                            <TableCell className="capitalize">{job.priority}</TableCell>
                            <TableCell>{formatDateTime(job.scheduledStart)}</TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {job.description || "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Link href={`/crm/jobs/${job.id}`}>
                                <Button variant="ghost" size="icon" data-testid={`button-view-job-${job.id}`}>
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </Link>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profile" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {account.accountType === "RESIDENTIAL"
                    ? "Residential Profile"
                    : account.accountType === "PROPERTY_MANAGER"
                    ? "Property Manager Profile"
                    : "Commercial Profile"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {account.accountType === "RESIDENTIAL" && residentialProfile && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {residentialProfile.specialInstructions && (
                      <div className="md:col-span-2">
                        <Label className="text-slate-500 text-sm">Special Instructions</Label>
                        <p className="font-medium">{residentialProfile.specialInstructions}</p>
                      </div>
                    )}
                  </div>
                )}

                {account.accountType === "PROPERTY_MANAGER" && propertyManagerProfile && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {propertyManagerProfile.managementCompanyName && (
                      <div>
                        <Label className="text-slate-500 text-sm">Management Company</Label>
                        <p className="font-medium">{propertyManagerProfile.managementCompanyName}</p>
                      </div>
                    )}
                    {propertyManagerProfile.portfolioSize && (
                      <div>
                        <Label className="text-slate-500 text-sm">Portfolio Size</Label>
                        <p className="font-medium">{propertyManagerProfile.portfolioSize} properties</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-slate-500 text-sm">Requires Approval</Label>
                      <p className="font-medium">
                        {propertyManagerProfile.requiresApprovalBefore ? (
                          <span className="flex items-center gap-1 text-amber-600">
                            <CheckCircle2 className="h-4 w-4" />
                            Yes {propertyManagerProfile.approvalThreshold && `(over $${propertyManagerProfile.approvalThreshold})`}
                          </span>
                        ) : (
                          "No"
                        )}
                      </p>
                    </div>
                    {propertyManagerProfile.defaultBillingMethod && (
                      <div>
                        <Label className="text-slate-500 text-sm">Default Billing Method</Label>
                        <p className="font-medium">{propertyManagerProfile.defaultBillingMethod}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-slate-500 text-sm">Net Terms</Label>
                      <p className="font-medium">{propertyManagerProfile.netTerms || 30} days</p>
                    </div>
                  </div>
                )}

                {account.accountType === "COMMERCIAL" && commercialProfile && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label className="text-slate-500 text-sm">Tax Exempt</Label>
                      <p className="font-medium">
                        {commercialProfile.taxExempt ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="h-4 w-4" />
                            Yes {commercialProfile.taxExemptNumber && `(#${commercialProfile.taxExemptNumber})`}
                          </span>
                        ) : (
                          "No"
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-500 text-sm">Requires PO</Label>
                      <p className="font-medium">
                        {commercialProfile.requiresPO ? (
                          <span className="flex items-center gap-1 text-amber-600">
                            <CheckCircle2 className="h-4 w-4" />
                            Yes {commercialProfile.poPrefix && `(Prefix: ${commercialProfile.poPrefix})`}
                          </span>
                        ) : (
                          "No"
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-500 text-sm">Net Terms</Label>
                      <p className="font-medium">{commercialProfile.netTerms || 30} days</p>
                    </div>
                    <div>
                      <Label className="text-slate-500 text-sm">W9 on File</Label>
                      <p className="font-medium">
                        {commercialProfile.w9OnFile ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="h-4 w-4" />
                            Yes
                          </span>
                        ) : (
                          "No"
                        )}
                      </p>
                    </div>
                    {(commercialProfile.billingAddress || commercialProfile.billingCity) && (
                      <div className="md:col-span-2">
                        <Label className="text-slate-500 text-sm">Billing Address</Label>
                        <p className="font-medium">
                          {commercialProfile.billingAddress}
                          {commercialProfile.billingCity && `, ${commercialProfile.billingCity}`}
                          {commercialProfile.billingState && `, ${commercialProfile.billingState}`}
                          {commercialProfile.billingZip && ` ${commercialProfile.billingZip}`}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {account.accountType === "RESIDENTIAL" && !residentialProfile && (
                  <p className="text-slate-500">No residential profile configured</p>
                )}
                {account.accountType === "PROPERTY_MANAGER" && !propertyManagerProfile && (
                  <p className="text-slate-500">No property manager profile configured</p>
                )}
                {account.accountType === "COMMERCIAL" && !commercialProfile && (
                  <p className="text-slate-500">No commercial profile configured</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={siteDialogOpen} onOpenChange={(open) => { if (!open) { setSiteDialogOpen(false); resetSiteForm(); } else setSiteDialogOpen(true); }}>
          <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-4 border-b bg-slate-50 dark:bg-slate-900">
              <DialogTitle className="text-xl font-semibold">{editingSite ? "Edit Location" : "Add Location"}</DialogTitle>
              <DialogDescription className="text-slate-500">
                {editingSite ? "Update the location information" : "Add a new location to this account"}
              </DialogDescription>
            </DialogHeader>
            
            <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Location Name <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Input
                  placeholder="e.g., Main Office, Unit A"
                  value={siteForm.siteName}
                  onChange={(e) => setSiteForm({ ...siteForm, siteName: e.target.value })}
                  className="h-11"
                  data-testid="input-location-name"
                />
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Address</p>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Street Address <span className="text-red-500">*</span></Label>
                  <Input
                    placeholder="123 Main Street"
                    value={siteForm.address1}
                    onChange={(e) => setSiteForm({ ...siteForm, address1: e.target.value })}
                    className="h-11"
                    data-testid="input-address1"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-600 dark:text-slate-400">Apt, Suite, Unit <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <Input
                    placeholder="Suite 100"
                    value={siteForm.address2}
                    onChange={(e) => setSiteForm({ ...siteForm, address2: e.target.value })}
                    className="h-11"
                    data-testid="input-address2"
                  />
                </div>
                <div className="grid grid-cols-5 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-sm font-medium">City <span className="text-red-500">*</span></Label>
                    <Input
                      value={siteForm.city}
                      onChange={(e) => setSiteForm({ ...siteForm, city: e.target.value })}
                      className="h-11"
                      data-testid="input-city"
                    />
                  </div>
                  <div className="col-span-1 space-y-1.5">
                    <Label className="text-sm font-medium">State <span className="text-red-500">*</span></Label>
                    <Input
                      value={siteForm.state}
                      onChange={(e) => setSiteForm({ ...siteForm, state: e.target.value })}
                      className="h-11"
                      maxLength={2}
                      data-testid="input-state"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-sm font-medium">ZIP <span className="text-red-500">*</span></Label>
                    <Input
                      value={siteForm.zip}
                      onChange={(e) => setSiteForm({ ...siteForm, zip: e.target.value })}
                      className="h-11"
                      data-testid="input-zip"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 py-2">
                <Checkbox
                  id="isPrimary"
                  checked={siteForm.isPrimary}
                  onCheckedChange={(checked) => setSiteForm({ ...siteForm, isPrimary: checked as boolean })}
                  className="h-5 w-5"
                  data-testid="checkbox-is-primary"
                />
                <Label htmlFor="isPrimary" className="text-sm font-medium cursor-pointer">Set as Primary Location</Label>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Access Details</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1 space-y-1.5">
                    <Label className="text-sm font-medium text-slate-600">Gate Code</Label>
                    <Input
                      placeholder="#1234"
                      value={siteForm.gateCode}
                      onChange={(e) => setSiteForm({ ...siteForm, gateCode: e.target.value })}
                      className="h-11"
                      data-testid="input-gate-code"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-sm font-medium text-slate-600">Access Instructions</Label>
                    <Input
                      placeholder="Parking, entry notes..."
                      value={siteForm.accessInstructions}
                      onChange={(e) => setSiteForm({ ...siteForm, accessInstructions: e.target.value })}
                      className="h-11"
                      data-testid="input-access-instructions"
                    />
                  </div>
                </div>
              </div>

              {account.accountType === "PROPERTY_MANAGER" && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 space-y-4 border border-blue-100 dark:border-blue-800">
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Tenant Information</p>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Tenant Name</Label>
                    <Input
                      value={siteForm.tenantName}
                      onChange={(e) => setSiteForm({ ...siteForm, tenantName: e.target.value })}
                      className="h-11 bg-white dark:bg-slate-800"
                      data-testid="input-tenant-name"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Tenant Phone</Label>
                      <Input
                        value={siteForm.tenantPhone}
                        onChange={(e) => {
                          const formatted = formatPhoneNumber(e.target.value);
                          setSiteForm({ ...siteForm, tenantPhone: formatted });
                          if (formatted && !validatePhone(formatted)) {
                            setTenantPhoneError("Invalid phone");
                          } else {
                            setTenantPhoneError("");
                          }
                        }}
                        placeholder="(555) 555-5555"
                        className={cn("h-11 bg-white dark:bg-slate-800", tenantPhoneError && "border-red-500 focus-visible:ring-red-500")}
                        data-testid="input-tenant-phone"
                      />
                      {tenantPhoneError && <p className="text-xs text-red-500">{tenantPhoneError}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Tenant Email</Label>
                      <Input
                        value={siteForm.tenantEmail}
                        onChange={(e) => setSiteForm({ ...siteForm, tenantEmail: e.target.value })}
                        onBlur={() => {
                          if (siteForm.tenantEmail && !validateEmail(siteForm.tenantEmail)) {
                            setTenantEmailError("Invalid email");
                          } else {
                            setTenantEmailError("");
                          }
                        }}
                        className={cn("h-11 bg-white dark:bg-slate-800", tenantEmailError && "border-red-500 focus-visible:ring-red-500")}
                        data-testid="input-tenant-email"
                      />
                      {tenantEmailError && <p className="text-xs text-red-500">{tenantEmailError}</p>}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-600">Notes <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Textarea
                  placeholder="Any additional notes about this location..."
                  value={siteForm.notes}
                  onChange={(e) => setSiteForm({ ...siteForm, notes: e.target.value })}
                  className="min-h-[80px] resize-none"
                  data-testid="input-location-notes"
                />
              </div>
            </div>

            <DialogFooter className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-900">
              <Button variant="outline" onClick={() => { setSiteDialogOpen(false); resetSiteForm(); }} className="px-6">
                Cancel
              </Button>
              <Button
                onClick={() => {
                  let hasErrors = false;
                  if (siteForm.tenantEmail && !validateEmail(siteForm.tenantEmail)) {
                    setTenantEmailError("Please enter a valid email");
                    hasErrors = true;
                  }
                  if (siteForm.tenantPhone && !validatePhone(siteForm.tenantPhone)) {
                    setTenantPhoneError("Please enter a valid phone number");
                    hasErrors = true;
                  }
                  if (hasErrors) return;
                  editingSite ? updateSiteMutation.mutate() : createSiteMutation.mutate();
                }}
                disabled={!siteForm.address1 || !siteForm.city || !siteForm.state || !siteForm.zip || createSiteMutation.isPending || updateSiteMutation.isPending || !!tenantEmailError || !!tenantPhoneError}
                className="px-6 bg-[#711419] hover:bg-[#5a1014]"
                data-testid="button-save-location"
              >
                {createSiteMutation.isPending || updateSiteMutation.isPending ? "Saving..." : editingSite ? "Update Location" : "Add Location"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={contactDialogOpen} onOpenChange={(open) => { if (!open) { setContactDialogOpen(false); resetContactForm(); } else setContactDialogOpen(true); }}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingContact ? "Edit Contact" : "Add Contact"}</DialogTitle>
              <DialogDescription>
                {editingContact ? "Update the contact information" : "Add a new contact to this account"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name *</Label>
                  <Input
                    value={contactForm.firstName}
                    onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })}
                    data-testid="input-contact-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input
                    value={contactForm.lastName}
                    onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })}
                    data-testid="input-contact-last-name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={contactForm.phone}
                    onChange={(e) => {
                      const formatted = formatPhoneNumber(e.target.value);
                      setContactForm({ ...contactForm, phone: formatted });
                      if (formatted && !validatePhone(formatted)) {
                        setContactPhoneError("Please enter a 10-digit phone number");
                      } else {
                        setContactPhoneError("");
                      }
                    }}
                    placeholder="(555) 555-5555"
                    className={contactPhoneError ? "border-red-500" : ""}
                    data-testid="input-contact-phone"
                  />
                  {contactPhoneError && <p className="text-sm text-red-500 mt-1">{contactPhoneError}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    onBlur={() => {
                      if (contactForm.email && !validateEmail(contactForm.email)) {
                        setContactEmailError("Please enter a valid email (e.g., name@example.com)");
                      } else {
                        setContactEmailError("");
                      }
                    }}
                    className={contactEmailError ? "border-red-500" : ""}
                    data-testid="input-contact-email"
                  />
                  {contactEmailError && <p className="text-sm text-red-500 mt-1">{contactEmailError}</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={contactForm.contactRole} onValueChange={(value) => setContactForm({ ...contactForm, contactRole: value as ContactRole })}>
                  <SelectTrigger data-testid="select-contact-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_ROLES.map((role) => (
                      <SelectItem key={role} value={role} className="capitalize">
                        {role.toLowerCase().replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {sites.length > 0 && (
                <div className="space-y-2">
                  <Label>Associated Location (optional)</Label>
                  <Select value={contactForm.siteId || "none"} onValueChange={(value) => setContactForm({ ...contactForm, siteId: value === "none" ? "" : value })}>
                    <SelectTrigger data-testid="select-contact-location">
                      <SelectValue placeholder="No specific location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific location</SelectItem>
                      {sites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.siteName || `${site.address1}, ${site.city}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center gap-6">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="contactIsPrimary"
                    checked={contactForm.isPrimary}
                    onCheckedChange={(checked) => setContactForm({ ...contactForm, isPrimary: checked as boolean })}
                    data-testid="checkbox-contact-is-primary"
                  />
                  <Label htmlFor="contactIsPrimary">Primary Contact</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="contactIsPreferred"
                    checked={contactForm.isPreferred}
                    onCheckedChange={(checked) => setContactForm({ ...contactForm, isPreferred: checked as boolean })}
                    data-testid="checkbox-contact-is-preferred"
                  />
                  <Label htmlFor="contactIsPreferred">Preferred Contact</Label>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={contactForm.notes}
                  onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                  data-testid="input-contact-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setContactDialogOpen(false); resetContactForm(); }}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  let hasErrors = false;
                  if (contactForm.email && !validateEmail(contactForm.email)) {
                    setContactEmailError("Please enter a valid email");
                    hasErrors = true;
                  }
                  if (contactForm.phone && !validatePhone(contactForm.phone)) {
                    setContactPhoneError("Please enter a valid 10-digit phone number");
                    hasErrors = true;
                  }
                  if (hasErrors) return;
                  editingContact ? updateContactMutation.mutate() : createContactMutation.mutate();
                }}
                disabled={!contactForm.firstName || createContactMutation.isPending || updateContactMutation.isPending || !!contactEmailError || !!contactPhoneError}
                data-testid="button-save-contact"
              >
                {createContactMutation.isPending || updateContactMutation.isPending ? "Saving..." : editingContact ? "Update Contact" : "Add Contact"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={jobDialogOpen} onOpenChange={(open) => { if (!open) { setJobDialogOpen(false); resetJobForm(); } else setJobDialogOpen(true); }}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
              <DialogDescription>
                Create a new project for {account.displayName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Job Type *</Label>
                  <Select value={jobForm.jobType} onValueChange={(value) => setJobForm({ ...jobForm, jobType: value })}>
                    <SelectTrigger data-testid="select-job-type">
                      <SelectValue placeholder="Select job type" />
                    </SelectTrigger>
                    <SelectContent>
                      {JOB_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={jobForm.priority} onValueChange={(value) => setJobForm({ ...jobForm, priority: value })}>
                    <SelectTrigger data-testid="select-priority">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p} className="capitalize">
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !jobForm.scheduledStart && "text-muted-foreground"
                        )}
                        data-testid="button-job-start-date"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {jobForm.scheduledStart ? format(jobForm.scheduledStart, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={jobForm.scheduledStart}
                        onSelect={(date) => date && setJobForm({ ...jobForm, scheduledStart: date })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Start Time *</Label>
                  <Input
                    type="time"
                    value={jobForm.startTime}
                    onChange={(e) => setJobForm({ ...jobForm, startTime: e.target.value })}
                    data-testid="input-job-start-time"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Duration (minutes) *</Label>
                <Input
                  type="number"
                  min={15}
                  step={15}
                  value={jobForm.duration}
                  onChange={(e) => setJobForm({ ...jobForm, duration: parseInt(e.target.value) || 60 })}
                  data-testid="input-job-duration"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Project description..."
                  value={jobForm.description}
                  onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                  data-testid="input-job-description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setJobDialogOpen(false); resetJobForm(); }}>
                Cancel
              </Button>
              <Button
                onClick={() => createJobMutation.mutate()}
                disabled={createJobMutation.isPending}
                data-testid="button-create-job"
              >
                {createJobMutation.isPending ? "Creating..." : "Create Project"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteSiteId} onOpenChange={(open) => !open && setDeleteSiteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Site</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this site? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteSiteId && deleteSiteMutation.mutate(deleteSiteId)}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-confirm-delete-site"
              >
                {deleteSiteMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteContactId} onOpenChange={(open) => !open && setDeleteContactId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Contact</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this contact? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteContactId && deleteContactMutation.mutate(deleteContactId)}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-confirm-delete-contact"
              >
                {deleteContactMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={editAccountDialogOpen} onOpenChange={(open) => setEditAccountDialogOpen(open)}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Edit Customer</DialogTitle>
              <DialogDescription>
                Update customer information
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Display Name *</Label>
                <Input
                  placeholder="Customer display name"
                  value={editAccountForm.displayName}
                  onChange={(e) => setEditAccountForm({ ...editAccountForm, displayName: e.target.value })}
                  data-testid="input-edit-display-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input
                  placeholder="Company name (optional)"
                  value={editAccountForm.companyName}
                  onChange={(e) => setEditAccountForm({ ...editAccountForm, companyName: e.target.value })}
                  data-testid="input-edit-company-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Pinned Note</Label>
                <Textarea
                  placeholder="Add a pinned note that will be displayed prominently on this account"
                  value={editAccountForm.pinnedNote}
                  onChange={(e) => setEditAccountForm({ ...editAccountForm, pinnedNote: e.target.value })}
                  data-testid="input-edit-pinned-note"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditAccountDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => updateAccountMutation.mutate()}
                disabled={!editAccountForm.displayName || updateAccountMutation.isPending}
                data-testid="button-save-account"
              >
                {updateAccountMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </CrmLayout>
  );
}
