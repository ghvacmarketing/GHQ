import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bell, RefreshCw, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
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

export default function CrmSettingsSystemTools() {
  usePageTitle("System Tools");
  const [, navigate] = useLocation();
  const [isRunningReminders, setIsRunningReminders] = useState(false);
  const [isRunningRenewals, setIsRunningRenewals] = useState(false);
  const [reminderResult, setReminderResult] = useState<{ success: boolean; summary?: ReminderSummary; error?: string } | null>(null);
  const [renewalResult, setRenewalResult] = useState<{ success: boolean; summary?: RenewalSummary; error?: string } | null>(null);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

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
        </div>
      </div>
    </CrmLayout>
  );
}
