import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Bell, RefreshCw, Loader2, CheckCircle2, AlertCircle, FileText, Search, Send, MessageSquare, Mail, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { CrmUser } from "@shared/schema";

interface SmsTemplate {
  key: string;
  description: string;
  value: string;
  defaultValue: string;
}

interface EmailTemplate {
  key: string;
  description: string;
  value: string;
  defaultValue: string;
  placeholders: string;
}

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

  const [automatedEmailEnabled, setAutomatedEmailEnabled] = useState(true);
  const [isLoadingEmailToggle, setIsLoadingEmailToggle] = useState(true);
  const [isUpdatingEmailToggle, setIsUpdatingEmailToggle] = useState(false);

  const [smsTemplates, setSmsTemplates] = useState<SmsTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isSavingTemplates, setIsSavingTemplates] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [isLoadingEmailTemplates, setIsLoadingEmailTemplates] = useState(true);
  const [isSavingEmailTemplates, setIsSavingEmailTemplates] = useState(false);
  const [emailTemplatesOpen, setEmailTemplatesOpen] = useState(false);

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
        const res = await fetch("/api/admin/settings/automated-sms", { credentials: "include" });
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

    const fetchEmailToggle = async () => {
      try {
        const res = await fetch("/api/admin/settings/automated-email", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setAutomatedEmailEnabled(data.enabled);
        }
      } catch (err) {
        console.error("Failed to fetch email toggle:", err);
      } finally {
        setIsLoadingEmailToggle(false);
      }
    };

    const fetchTemplates = async () => {
      try {
        const res = await fetch("/api/admin/settings/sms-templates", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setSmsTemplates(data.templates);
        }
      } catch (err) {
        console.error("Failed to fetch SMS templates:", err);
      } finally {
        setIsLoadingTemplates(false);
      }
    };

    const fetchEmailTemplates = async () => {
      try {
        const res = await fetch("/api/admin/settings/email-templates", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setEmailTemplates(data.templates);
        }
      } catch (err) {
        console.error("Failed to fetch email templates:", err);
      } finally {
        setIsLoadingEmailTemplates(false);
      }
    };

    if (currentUser && (currentUser.role === "owner" || currentUser.role === "admin" || currentUser.role === "supervisor")) {
      fetchSmsToggle();
      fetchEmailToggle();
      fetchTemplates();
      fetchEmailTemplates();
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
        toast({ title: enabled ? "SMS enabled" : "SMS disabled" });
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.message || "Failed to update setting", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsUpdatingSmsToggle(false);
    }
  };

  const handleToggleEmail = async (enabled: boolean) => {
    setIsUpdatingEmailToggle(true);
    try {
      const res = await fetch("/api/admin/settings/automated-email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        setAutomatedEmailEnabled(enabled);
        toast({ title: enabled ? "Email enabled" : "Email disabled" });
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.message || "Failed to update setting", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsUpdatingEmailToggle(false);
    }
  };

  const handleTemplateChange = (key: string, value: string) => {
    setSmsTemplates(prev => prev.map(t => t.key === key ? { ...t, value } : t));
  };

  const handleResetTemplate = (key: string) => {
    setSmsTemplates(prev => prev.map(t => t.key === key ? { ...t, value: t.defaultValue } : t));
  };

  const handleSaveTemplates = async () => {
    setIsSavingTemplates(true);
    try {
      const res = await fetch("/api/admin/settings/sms-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ templates: smsTemplates.map(t => ({ key: t.key, value: t.value })) }),
      });
      if (res.ok) {
        toast({ title: "SMS templates saved" });
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.message || "Failed to save templates", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsSavingTemplates(false);
    }
  };

  const handleEmailTemplateChange = (key: string, value: string) => {
    setEmailTemplates(prev => prev.map(t => t.key === key ? { ...t, value } : t));
  };

  const handleResetEmailTemplate = (key: string) => {
    setEmailTemplates(prev => prev.map(t => t.key === key ? { ...t, value: t.defaultValue } : t));
  };

  const handleSaveEmailTemplates = async () => {
    setIsSavingEmailTemplates(true);
    try {
      const res = await fetch("/api/admin/settings/email-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ templates: emailTemplates.map(t => ({ key: t.key, value: t.value })) }),
      });
      if (res.ok) {
        toast({ title: "Email templates saved" });
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.message || "Failed to save templates", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsSavingEmailTemplates(false);
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
    } catch {
      setReminderResult({ success: false, error: "Network error — please try again" });
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
    } catch {
      setRenewalResult({ success: false, error: "Network error — please try again" });
    } finally {
      setIsRunningRenewals(false);
    }
  };

  const handleSearchAgreements = async (search: string) => {
    setAgreementSearch(search);
    if (search.length < 2) { setAgreements([]); return; }
    setIsLoadingAgreements(true);
    try {
      const res = await fetch(`/api/admin/agreements-for-invoice?search=${encodeURIComponent(search)}`, { credentials: "include" });
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
    setAgreementSearch(agreement.customerName + " — " + agreement.agreementNumber);
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
    } catch {
      setInvoiceResult({ success: false, error: "Network error — please try again" });
    } finally {
      setIsSendingInvoice(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-2xl mx-auto space-y-3">
          <Skeleton className="h-6 w-40 mb-8" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  if (!currentUser) return null;

  const isAdmin = currentUser.role === "owner" || currentUser.role === "admin" || currentUser.role === "supervisor";

  if (!isAdmin) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="mx-auto w-full max-w-2xl space-y-6">
          <h1 className="text-xl font-semibold text-slate-900 mb-6">System Tools</h1>
          <div className="py-12 text-center text-slate-400">
            <AlertCircle className="h-8 w-8 mx-auto mb-3" />
            <p className="text-sm">Only administrators can access system tools.</p>
          </div>
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="mb-6">
          <Link href="/crm/settings">
            <button className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
              <ArrowLeft className="h-3.5 w-3.5" />
              Settings
            </button>
          </Link>
          <h1 className="text-xl font-semibold text-slate-900">System Tools</h1>
          <p className="text-sm text-slate-500 mt-1">Manage automation settings and trigger scheduled jobs manually.</p>
        </div>

        <div className="space-y-8">

          {/* Automation toggles */}
          <section>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Automation</h2>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
              <div className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <p className="text-sm font-medium text-slate-800">Automated SMS</p>
                  <p className="text-xs text-slate-500 mt-0.5">Maintenance reminders and work order notifications</p>
                </div>
                <div className="flex items-center gap-2">
                  {isLoadingSmsToggle || isUpdatingSmsToggle ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  ) : null}
                  <Switch
                    checked={automatedSmsEnabled}
                    onCheckedChange={handleToggleSms}
                    disabled={isLoadingSmsToggle || isUpdatingSmsToggle}
                    data-testid="switch-automated-sms"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <p className="text-sm font-medium text-slate-800">Automated Emails</p>
                  <p className="text-xs text-slate-500 mt-0.5">Quotes, invoices, and notification emails</p>
                </div>
                <div className="flex items-center gap-2">
                  {isLoadingEmailToggle || isUpdatingEmailToggle ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  ) : null}
                  <Switch
                    checked={automatedEmailEnabled}
                    onCheckedChange={handleToggleEmail}
                    disabled={isLoadingEmailToggle || isUpdatingEmailToggle}
                    data-testid="switch-automated-email"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Message templates */}
          <section>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Message Templates</h2>
            <div className="border border-slate-200 rounded-lg bg-white divide-y divide-slate-100">

              {/* SMS Templates */}
              <Collapsible open={templatesOpen} onOpenChange={setTemplatesOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    className="flex items-center justify-between w-full px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
                    data-testid="button-expand-templates"
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-slate-400" />
                      <span className="text-sm font-medium text-slate-800">SMS Templates</span>
                    </div>
                    {isLoadingTemplates ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                    ) : (
                      templatesOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-4">
                    {smsTemplates.map((template) => (
                      <div key={template.key} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-slate-600">{template.description}</label>
                          <button
                            onClick={() => handleResetTemplate(template.key)}
                            disabled={template.value === template.defaultValue}
                            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                            data-testid={`button-reset-${template.key}`}
                          >
                            <RotateCcw className="h-3 w-3" />
                            Reset
                          </button>
                        </div>
                        <Textarea
                          value={template.value}
                          onChange={(e) => handleTemplateChange(template.key, e.target.value)}
                          rows={2}
                          className="resize-none text-sm"
                          data-testid={`textarea-${template.key}`}
                        />
                        {template.key === "sms_template_invoice" && (
                          <p className="text-xs text-slate-400">Use {"{invoiceNumber}"} and {"{paymentLink}"} as placeholders</p>
                        )}
                      </div>
                    ))}
                    <Button
                      onClick={handleSaveTemplates}
                      disabled={isSavingTemplates}
                      size="sm"
                      data-testid="button-save-templates"
                    >
                      {isSavingTemplates ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</> : "Save SMS Templates"}
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Email Templates */}
              <Collapsible open={emailTemplatesOpen} onOpenChange={setEmailTemplatesOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    className="flex items-center justify-between w-full px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
                    data-testid="button-expand-email-templates"
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-slate-400" />
                      <span className="text-sm font-medium text-slate-800">Email Templates</span>
                    </div>
                    {isLoadingEmailTemplates ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                    ) : (
                      emailTemplatesOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 space-y-5 border-t border-slate-100 pt-4">
                    <div className="space-y-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quotes</p>
                      {emailTemplates.filter(t => t.key.includes('quote')).map((template) => (
                        <div key={template.key} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-slate-600">{template.description}</label>
                            <button
                              onClick={() => handleResetEmailTemplate(template.key)}
                              disabled={template.value === template.defaultValue}
                              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                              data-testid={`button-reset-${template.key}`}
                            >
                              <RotateCcw className="h-3 w-3" />
                              Reset
                            </button>
                          </div>
                          <Textarea
                            value={template.value}
                            onChange={(e) => handleEmailTemplateChange(template.key, e.target.value)}
                            rows={template.key.includes('subject') ? 1 : 2}
                            className="resize-none text-sm"
                            data-testid={`textarea-${template.key}`}
                          />
                          <p className="text-xs text-slate-400">Placeholders: {template.placeholders}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoices</p>
                      {emailTemplates.filter(t => t.key.includes('invoice')).map((template) => (
                        <div key={template.key} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-slate-600">{template.description}</label>
                            <button
                              onClick={() => handleResetEmailTemplate(template.key)}
                              disabled={template.value === template.defaultValue}
                              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                              data-testid={`button-reset-${template.key}`}
                            >
                              <RotateCcw className="h-3 w-3" />
                              Reset
                            </button>
                          </div>
                          <Textarea
                            value={template.value}
                            onChange={(e) => handleEmailTemplateChange(template.key, e.target.value)}
                            rows={template.key.includes('subject') ? 1 : 2}
                            className="resize-none text-sm"
                            data-testid={`textarea-${template.key}`}
                          />
                          <p className="text-xs text-slate-400">Placeholders: {template.placeholders}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Online Booking Emails</p>
                      <p className="text-xs text-slate-400 -mt-2">Sent automatically when customers book via the public /book page.</p>
                      {emailTemplates.filter(t => t.key.includes('booking')).map((template) => (
                        <div key={template.key} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-slate-600">{template.description}</label>
                            <button
                              onClick={() => handleResetEmailTemplate(template.key)}
                              disabled={template.value === template.defaultValue}
                              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                              data-testid={`button-reset-${template.key}`}
                            >
                              <RotateCcw className="h-3 w-3" />
                              Reset
                            </button>
                          </div>
                          <Textarea
                            value={template.value}
                            onChange={(e) => handleEmailTemplateChange(template.key, e.target.value)}
                            rows={template.key.includes('subject') ? 1 : 3}
                            className="resize-none text-sm"
                            data-testid={`textarea-${template.key}`}
                          />
                          <p className="text-xs text-slate-400">Placeholders: {template.placeholders}</p>
                        </div>
                      ))}
                    </div>
                    <Button
                      onClick={handleSaveEmailTemplates}
                      disabled={isSavingEmailTemplates}
                      size="sm"
                      data-testid="button-save-email-templates"
                    >
                      {isSavingEmailTemplates ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</> : "Save Email Templates"}
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </section>

          {/* Manual jobs */}
          <section>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Scheduled Jobs</h2>
            <div className="border border-slate-200 rounded-lg bg-white divide-y divide-slate-100">

              {/* Maintenance Reminders */}
              <div className="px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Maintenance Reminders</p>
                    <p className="text-xs text-slate-500 mt-0.5">Send 10-day and 5-day SMS reminders for upcoming visits</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTriggerReminders}
                    disabled={isRunningReminders}
                    className="shrink-0"
                    data-testid="button-trigger-reminders"
                  >
                    {isRunningReminders ? (
                      <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Running…</>
                    ) : (
                      <><Bell className="mr-1.5 h-3.5 w-3.5" />Run Now</>
                    )}
                  </Button>
                </div>
                {reminderResult && (
                  <div className={`mt-3 p-3 rounded-md text-sm ${reminderResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {reminderResult.success && reminderResult.summary ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 font-medium">
                          <CheckCircle2 className="h-4 w-4" />
                          Processed successfully
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-xs opacity-80">
                          <span>Processed: {reminderResult.summary.remindersProcessed}</span>
                          <span>Sent: {reminderResult.summary.smsSent}</span>
                          <span>Skipped: {reminderResult.summary.skipped}</span>
                          <span>Errors: {reminderResult.summary.errors}</span>
                        </div>
                        {reminderResult.summary.results.length > 0 && (
                          <div className="text-xs opacity-70 max-h-24 overflow-y-auto space-y-0.5 mt-1">
                            {reminderResult.summary.results.map((r, i) => (
                              <div key={i}>{r.customerName} — {r.agreementNumber} ({r.reminderType}): {r.smsSent ? 'Sent' : (r.error || 'Skipped')}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4" />
                        {reminderResult.error}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Agreement Renewals */}
              <div className="px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Agreement Renewals</p>
                    <p className="text-xs text-slate-500 mt-0.5">Create renewal invoices for agreements due today</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTriggerRenewals}
                    disabled={isRunningRenewals}
                    className="shrink-0"
                    data-testid="button-trigger-renewals"
                  >
                    {isRunningRenewals ? (
                      <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Running…</>
                    ) : (
                      <><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Run Now</>
                    )}
                  </Button>
                </div>
                {renewalResult && (
                  <div className={`mt-3 p-3 rounded-md text-sm ${renewalResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {renewalResult.success && renewalResult.summary ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 font-medium">
                          <CheckCircle2 className="h-4 w-4" />
                          Processed successfully
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-xs opacity-80">
                          <span>Agreements: {renewalResult.summary.agreementsProcessed}</span>
                          <span>Invoices: {renewalResult.summary.invoicesCreated}</span>
                          <span>Emails: {renewalResult.summary.emailsSent}</span>
                          <span>Errors: {renewalResult.summary.errors}</span>
                        </div>
                        {renewalResult.summary.results.length > 0 && (
                          <div className="text-xs opacity-70 max-h-24 overflow-y-auto space-y-0.5 mt-1">
                            {renewalResult.summary.results.map((r, i) => (
                              <div key={i}>{r.customerName} — {r.agreementNumber}: {r.invoiceNumber || 'No invoice'} {r.emailSent ? '(Email sent)' : ''} {r.error || ''}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4" />
                        {renewalResult.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Manual invoice trigger */}
          <section>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Manual Invoice</h2>
            <div className="border border-slate-200 rounded-lg bg-white px-4 py-4">
              <p className="text-sm font-medium text-slate-800 mb-0.5">Send Agreement Invoice</p>
              <p className="text-xs text-slate-500 mb-4">Search for an agreement and manually trigger a renewal invoice</p>

              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder="Search by customer or agreement number…"
                    value={agreementSearch}
                    onChange={(e) => handleSearchAgreements(e.target.value)}
                    className="pl-9 text-sm"
                    data-testid="input-agreement-search"
                  />
                  {agreements.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
                      {agreements.map((agreement) => (
                        <button
                          key={agreement.id}
                          onClick={() => handleSelectAgreement(agreement)}
                          className="w-full text-left px-3 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                          data-testid={`option-agreement-${agreement.id}`}
                        >
                          <div className="text-sm font-medium text-slate-900">{agreement.customerName}</div>
                          <div className="text-xs text-slate-500">
                            {agreement.agreementNumber} — {agreement.agreementPlan || 'N/A'}
                            {agreement.price && ` · $${agreement.price}`}
                            <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                              agreement.status === 'active' ? 'bg-green-100 text-green-700' :
                              agreement.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {agreement.status || 'unknown'}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {isLoadingAgreements && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg p-3 text-center text-slate-400 text-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1.5" />
                      Searching…
                    </div>
                  )}
                </div>

                {selectedAgreement && (
                  <div className="px-3 py-2.5 bg-slate-50 rounded-md border border-slate-200">
                    <p className="text-xs text-slate-500">Selected</p>
                    <p className="text-sm font-medium text-slate-800">{selectedAgreement.customerName} — {selectedAgreement.agreementNumber}</p>
                    <p className="text-xs text-slate-500">{selectedAgreement.agreementPlan}{selectedAgreement.price && ` · $${selectedAgreement.price}`}</p>
                  </div>
                )}

                <Button
                  onClick={handleSendInvoice}
                  disabled={!selectedAgreement || isSendingInvoice}
                  size="sm"
                  data-testid="button-send-invoice"
                >
                  {isSendingInvoice ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Sending…</>
                  ) : (
                    <><Send className="mr-1.5 h-3.5 w-3.5" />Send Invoice</>
                  )}
                </Button>

                {invoiceResult && (
                  <div className={`p-3 rounded-md text-sm ${invoiceResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {invoiceResult.success ? (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" />
                        {invoiceResult.message}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4" />
                        {invoiceResult.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

        </div>
      </div>
    </CrmLayout>
  );
}
