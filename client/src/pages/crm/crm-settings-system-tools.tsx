import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Bell, RefreshCw, Loader2, CheckCircle2, AlertCircle, FileText, Search, Send, MessageSquare } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser } from "@shared/schema";

interface ReminderResult {
  visitId: string;
  agreementNumber: string;
  customerName: string;
  reminderType: string;
  smsSent: boolean;
  error?: string;
}

interface ReminderSummary {
  processedAt: string;
  remindersProcessed: number;
  smsSent: number;
  skipped: number;
  errors: number;
  results: ReminderResult[];
}

interface RenewalResult {
  agreementId: string;
  agreementNumber: string;
  customerName: string;
  invoiceId?: string;
  invoiceNumber?: string;
  emailSent: boolean;
  error?: string;
}

interface RenewalSummary {
  processedAt: string;
  agreementsProcessed: number;
  invoicesCreated: number;
  emailsSent: number;
  errors: number;
  results: RenewalResult[];
}

interface AgreementOption {
  id: string;
  agreementNumber: string;
  customerName: string;
  agreementPlan: string | null;
  status: string | null;
  price: string | null;
}

interface InvoiceTriggerResult {
  success: boolean;
  message?: string;
  result?: RenewalResult;
  error?: string;
}

export default function CrmSettingsSystemTools() {
  usePageTitle("System Tools");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isRunningReminders, setIsRunningReminders] = useState(false);
  const [isRunningRenewals, setIsRunningRenewals] = useState(false);
  const [reminderResult, setReminderResult] = useState<{ success: boolean; summary?: ReminderSummary; error?: string } | null>(null);
  const [renewalResult, setRenewalResult] = useState<{ success: boolean; summary?: RenewalSummary; error?: string } | null>(null);
  
  const [agreementSearch, setAgreementSearch] = useState("");
  const [agreements, setAgreements] = useState<AgreementOption[]>([]);
  const [isLoadingAgreements, setIsLoadingAgreements] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState<AgreementOption | null>(null);
  const [isSendingInvoice, setIsSendingInvoice] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState<InvoiceTriggerResult | null>(null);
  
  const [automatedSmsEnabled, setAutomatedSmsEnabled] = useState(true);
  const [isLoadingSmsToggle, setIsLoadingSmsToggle] = useState(true);
  const [isUpdatingSmsToggle, setIsUpdatingSmsToggle] = useState(false);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  useEffect(() => {
    const fetchSmsToggle = async () => {
      try {
        const res = await fetch("/api/admin/settings/automated-sms", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setAutomatedSmsEnabled(data.enabled);
        }
      } catch (err) {
        console.error("Failed to fetch SMS toggle:", err);
      } finally {
        setIsLoadingSmsToggle(false);
      }
    };
    if (currentUser && (currentUser.role === "owner" || currentUser.role === "admin")) {
      fetchSmsToggle();
    }
  }, [currentUser]);

  const handleToggleSms = async (enabled: boolean) => {
    setIsUpdatingSmsToggle(true);
    try {
      const res = await fetch("/api/admin/settings/automated-sms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        setAutomatedSmsEnabled(enabled);
        toast({
          title: enabled ? "SMS Enabled" : "SMS Disabled",
          description: enabled 
            ? "Automated SMS notifications are now enabled" 
            : "Automated SMS notifications are now disabled",
        });
      } else {
        const data = await res.json();
        toast({
          title: "Error",
          description: data.message || "Failed to update setting",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Network error - please try again",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingSmsToggle(false);
    }
  };

  const handleTriggerReminders = async () => {
    setIsRunningReminders(true);
    setReminderResult(null);
    try {
      const res = await fetch("/api/admin/trigger-maintenance-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setReminderResult({ success: true, summary: data.summary });
      } else {
        setReminderResult({ success: false, error: data.message || "Failed to trigger reminders" });
      }
    } catch (err) {
      setReminderResult({ success: false, error: "Network error - please try again" });
    } finally {
      setIsRunningReminders(false);
    }
  };

  const handleTriggerRenewals = async () => {
    setIsRunningRenewals(true);
    setRenewalResult(null);
    try {
      const res = await fetch("/api/admin/trigger-renewal-processing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setRenewalResult({ success: true, summary: data.summary });
      } else {
        setRenewalResult({ success: false, error: data.message || "Failed to trigger renewals" });
      }
    } catch (err) {
      setRenewalResult({ success: false, error: "Network error - please try again" });
    } finally {
      setIsRunningRenewals(false);
    }
  };

  const handleSearchAgreements = async (search: string) => {
    setAgreementSearch(search);
    if (search.length < 2) {
      setAgreements([]);
      return;
    }
    setIsLoadingAgreements(true);
    try {
      const res = await fetch(`/api/admin/agreements-for-invoice?search=${encodeURIComponent(search)}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setAgreements(data);
      }
    } catch (err) {
      console.error("Failed to search agreements:", err);
    } finally {
      setIsLoadingAgreements(false);
    }
  };

  const handleSelectAgreement = (agreement: AgreementOption) => {
    setSelectedAgreement(agreement);
    setAgreements([]);
    setAgreementSearch(agreement.customerName + " - " + agreement.agreementNumber);
  };

  const handleSendInvoice = async () => {
    if (!selectedAgreement) return;
    setIsSendingInvoice(true);
    setInvoiceResult(null);
    try {
      const res = await fetch(`/api/admin/trigger-agreement-invoice/${selectedAgreement.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setInvoiceResult({ success: true, message: data.message, result: data.result });
        setSelectedAgreement(null);
        setAgreementSearch("");
      } else {
        setInvoiceResult({ success: false, error: data.message || "Failed to send invoice" });
      }
    } catch (err) {
      setInvoiceResult({ success: false, error: "Network error - please try again" });
    } finally {
      setIsSendingInvoice(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const isAdmin = currentUser.role === "owner" || currentUser.role === "admin";

  if (!isAdmin) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="p-6 max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-slate-900 mb-6">System Tools</h1>
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>System Tools are only available to administrators.</p>
            </CardContent>
          </Card>
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/crm/settings">
            <Button variant="ghost" size="sm" className="text-slate-600" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Settings
            </Button>
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-6">System Tools</h1>
        <p className="text-slate-600 mb-6">
          Manually trigger scheduled system jobs for testing and debugging purposes.
        </p>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-100">
                    <MessageSquare className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Automated SMS Messages</CardTitle>
                    <CardDescription>
                      Enable or disable all outbound automated SMS notifications including maintenance reminders and work order status updates
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isLoadingSmsToggle ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  ) : (
                    <>
                      {isUpdatingSmsToggle && (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      )}
                      <Switch
                        checked={automatedSmsEnabled}
                        onCheckedChange={handleToggleSms}
                        disabled={isUpdatingSmsToggle}
                        data-testid="switch-automated-sms"
                      />
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-sm ${automatedSmsEnabled ? 'text-green-600' : 'text-slate-500'}`}>
                {automatedSmsEnabled ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Automated SMS notifications are enabled</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <span>Automated SMS notifications are disabled</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Bell className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">Maintenance Reminders</CardTitle>
                  <CardDescription>
                    Trigger the 10-day and 5-day SMS reminders for upcoming maintenance visits
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleTriggerReminders}
                disabled={isRunningReminders}
                className="mb-4"
                data-testid="button-trigger-reminders"
              >
                {isRunningReminders ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Bell className="mr-2 h-4 w-4" />
                    Trigger Maintenance Reminders
                  </>
                )}
              </Button>

              {reminderResult && (
                <div className={`p-4 rounded-lg ${reminderResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  {reminderResult.success && reminderResult.summary ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-green-700">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-medium">Reminders processed successfully</span>
                      </div>
                      <div className="text-sm text-green-600 grid grid-cols-2 gap-2">
                        <span>Processed: {reminderResult.summary.remindersProcessed}</span>
                        <span>SMS Sent: {reminderResult.summary.smsSent}</span>
                        <span>Skipped: {reminderResult.summary.skipped}</span>
                        <span>Errors: {reminderResult.summary.errors}</span>
                      </div>
                      {reminderResult.summary.results.length > 0 && (
                        <div className="mt-3 text-xs text-green-600 max-h-32 overflow-y-auto">
                          {reminderResult.summary.results.map((r, i) => (
                            <div key={i} className="py-1 border-b border-green-100 last:border-0">
                              {r.customerName} - {r.agreementNumber} ({r.reminderType}): {r.smsSent ? 'Sent' : (r.error || 'Skipped')}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertCircle className="h-5 w-5" />
                      <span>{reminderResult.error}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100">
                  <RefreshCw className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">Agreement Renewals</CardTitle>
                  <CardDescription>
                    Process agreement renewals and send renewal invoices for agreements due today
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleTriggerRenewals}
                disabled={isRunningRenewals}
                className="mb-4"
                data-testid="button-trigger-renewals"
              >
                {isRunningRenewals ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Trigger Renewal Processing
                  </>
                )}
              </Button>

              {renewalResult && (
                <div className={`p-4 rounded-lg ${renewalResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  {renewalResult.success && renewalResult.summary ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-green-700">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-medium">Renewals processed successfully</span>
                      </div>
                      <div className="text-sm text-green-600 grid grid-cols-2 gap-2">
                        <span>Processed: {renewalResult.summary.agreementsProcessed}</span>
                        <span>Invoices Created: {renewalResult.summary.invoicesCreated}</span>
                        <span>Emails Sent: {renewalResult.summary.emailsSent}</span>
                        <span>Errors: {renewalResult.summary.errors}</span>
                      </div>
                      {renewalResult.summary.results.length > 0 && (
                        <div className="mt-3 text-xs text-green-600 max-h-32 overflow-y-auto">
                          {renewalResult.summary.results.map((r, i) => (
                            <div key={i} className="py-1 border-b border-green-100 last:border-0">
                              {r.customerName} - {r.agreementNumber}: {r.invoiceNumber || 'No invoice'} {r.emailSent ? '(Email sent)' : ''} {r.error || ''}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertCircle className="h-5 w-5" />
                      <span>{renewalResult.error}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100">
                  <FileText className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">Manual Agreement Invoice</CardTitle>
                  <CardDescription>
                    Search for an agreement and manually send a renewal invoice for testing
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search by customer name or agreement number..."
                      value={agreementSearch}
                      onChange={(e) => handleSearchAgreements(e.target.value)}
                      className="pl-10"
                      data-testid="input-agreement-search"
                    />
                  </div>
                  
                  {agreements.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {agreements.map((agreement) => (
                        <button
                          key={agreement.id}
                          onClick={() => handleSelectAgreement(agreement)}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                          data-testid={`option-agreement-${agreement.id}`}
                        >
                          <div className="font-medium text-slate-900">{agreement.customerName}</div>
                          <div className="text-sm text-slate-500">
                            {agreement.agreementNumber} - {agreement.agreementPlan || 'N/A'} 
                            {agreement.price && ` ($${agreement.price})`}
                            <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                              agreement.status === 'active' ? 'bg-green-100 text-green-700' :
                              agreement.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {agreement.status || 'unknown'}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {isLoadingAgreements && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg p-4 text-center text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                      Searching...
                    </div>
                  )}
                </div>

                {selectedAgreement && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-600">Selected Agreement:</div>
                    <div className="font-medium">{selectedAgreement.customerName} - {selectedAgreement.agreementNumber}</div>
                    <div className="text-sm text-slate-500">
                      {selectedAgreement.agreementPlan} {selectedAgreement.price && `($${selectedAgreement.price})`}
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleSendInvoice}
                  disabled={!selectedAgreement || isSendingInvoice}
                  className="w-full"
                  data-testid="button-send-invoice"
                >
                  {isSendingInvoice ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send Invoice
                    </>
                  )}
                </Button>

                {invoiceResult && (
                  <div className={`p-4 rounded-lg ${invoiceResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    {invoiceResult.success ? (
                      <div className="flex items-center gap-2 text-green-700">
                        <CheckCircle2 className="h-5 w-5" />
                        <span>{invoiceResult.message}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-red-700">
                        <AlertCircle className="h-5 w-5" />
                        <span>{invoiceResult.error}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </CrmLayout>
  );
}
