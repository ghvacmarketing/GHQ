import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, BellRing, CreditCard, Loader2, DollarSign, RotateCcw, X } from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser } from "@shared/schema";

export default function CrmSettingsPayments() {
  usePageTitle("Payment Settings");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [depositPercentage, setDepositPercentage] = useState<number>(50);
  const [financingLink, setFinancingLink] = useState<string>("");
  const [isFinancingDefault, setIsFinancingDefault] = useState<boolean>(true);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: settings, isLoading: settingsLoading } = useQuery<{ depositPercentage: number }>({
    queryKey: ["/api/stripe/settings/deposit-percentage"],
    enabled: !!currentUser,
  });

  const { data: financingSettings, isLoading: financingLoading } = useQuery<{ financingLink: string; isDefault: boolean }>({
    queryKey: ["/api/app-settings/financing-link"],
    enabled: !!currentUser,
  });

  useEffect(() => {
    if (settings?.depositPercentage) {
      setDepositPercentage(settings.depositPercentage);
    }
  }, [settings]);

  useEffect(() => {
    if (financingSettings) {
      setFinancingLink(financingSettings.financingLink);
      setIsFinancingDefault(financingSettings.isDefault);
    }
  }, [financingSettings]);

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const saveMutation = useMutation({
    mutationFn: async (percentage: number) => {
      const res = await apiRequest("POST", "/api/stripe/settings/deposit-percentage", {
        percentage,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save setting");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stripe/settings/deposit-percentage"] });
      toast({ title: "Settings saved", description: "Deposit percentage updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    },
  });

  const saveFinancingMutation = useMutation({
    mutationFn: async (link: string) => {
      const res = await apiRequest("PUT", "/api/app-settings/financing-link", {
        financingLink: link,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save financing link");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/app-settings/financing-link"] });
      toast({ title: "Settings saved", description: "Financing link updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    },
  });

  const resetFinancingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/app-settings/financing-link");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reset financing link");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/app-settings/financing-link"] });
      setFinancingLink(data.financingLink || "");
      setIsFinancingDefault(true);
      toast({ title: "Settings reset", description: "Financing link reset to default." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reset", description: error.message, variant: "destructive" });
    },
  });

  // ── Quote approval alerts — who gets emailed when any quote is approved ──
  const [approvalEmails, setApprovalEmails] = useState<string[]>([]);
  const [approvalIsDefault, setApprovalIsDefault] = useState(true);
  const [approvalEmailInput, setApprovalEmailInput] = useState("");
  const { data: approvalSettings } = useQuery<{
    emails: string[] | null;
    effective: string[];
    defaults: string[];
    recipients?: Array<{ email: string; name: string | null; role: string | null }>;
  }>({
    queryKey: ["/api/app-settings/quote-approval-emails"],
    enabled: !!currentUser,
  });
  useEffect(() => {
    if (approvalSettings) {
      setApprovalEmails(approvalSettings.effective);
      setApprovalIsDefault(approvalSettings.emails === null);
    }
  }, [approvalSettings]);

  const saveApprovalEmailsMutation = useMutation({
    mutationFn: async (emails: string[]) => {
      const res = await apiRequest("PUT", "/api/app-settings/quote-approval-emails", { emails });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/app-settings/quote-approval-emails"] });
      toast({ title: "Settings saved", description: "Quote approval alert recipients updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    },
  });

  const resetApprovalEmailsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/app-settings/quote-approval-emails");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/app-settings/quote-approval-emails"] });
      toast({ title: "Settings reset", description: "Back to the default — all owners and admins." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reset", description: error.message, variant: "destructive" });
    },
  });

  const addApprovalEmail = () => {
    const email = approvalEmailInput.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Invalid email", description: `"${email}" isn't a valid email address.`, variant: "destructive" });
      return;
    }
    if (approvalEmails.includes(email)) {
      setApprovalEmailInput("");
      return;
    }
    setApprovalEmails((prev) => [...prev, email]);
    setApprovalEmailInput("");
  };

  if (authLoading || settingsLoading || financingLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-2xl mx-auto">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const isAdmin = currentUser.role === "owner" || currentUser.role === "admin" || currentUser.role === "supervisor";
  if (!isAdmin) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="mx-auto w-full max-w-2xl space-y-6">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground mb-6">Payment Settings</h1>
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              <CreditCard className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>Only administrators can modify payment settings.</p>
            </CardContent>
          </Card>
        </div>
      </CrmLayout>
    );
  }

  const handleSave = () => {
    if (depositPercentage < 1 || depositPercentage > 100) {
      toast({
        title: "Invalid percentage",
        description: "Deposit percentage must be between 1 and 100",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate(depositPercentage);
  };

  const handleSaveFinancing = () => {
    if (!financingLink.trim()) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid financing link URL",
        variant: "destructive",
      });
      return;
    }
    try {
      new URL(financingLink.trim());
    } catch {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL (e.g., https://example.com)",
        variant: "destructive",
      });
      return;
    }
    saveFinancingMutation.mutate(financingLink.trim());
  };

  const handleResetFinancing = () => {
    resetFinancingMutation.mutate();
  };

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/crm/settings")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Payment Settings</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Stripe Payment Links
            </CardTitle>
            <CardDescription>
              Configure default settings for generating payment links
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="deposit-percentage">Default Deposit Percentage</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="deposit-percentage"
                  type="number"
                  min="1"
                  max="100"
                  value={depositPercentage}
                  onChange={(e) => setDepositPercentage(parseInt(e.target.value) || 50)}
                  className="w-24"
                  data-testid="input-deposit-percentage"
                />
                <span className="text-slate-500">%</span>
              </div>
              <p className="text-sm text-slate-500">
                This percentage will be used when generating deposit payment links for install quotes.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg space-y-2">
              <h4 className="font-medium text-slate-700">Payment Link Behavior</h4>
              <ul className="text-sm text-slate-600 space-y-1">
                <li>• <strong>Install Quotes:</strong> Generate {depositPercentage}% deposit payment links</li>
                <li>• <strong>Service Quotes:</strong> No payment links (handled differently)</li>
                <li>• <strong>Invoices:</strong> Generate full balance payment links</li>
              </ul>
            </div>

            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="bg-[#d3b07d] hover:bg-[#c4a06e]"
              data-testid="button-save-settings"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Settings"
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Financing Options
            </CardTitle>
            <CardDescription>
              Configure the financing application link shown to customers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="financing-link">Financing Application URL</Label>
                {isFinancingDefault ? (
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">Using Default</span>
                ) : (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">Custom URL</span>
                )}
              </div>
              <Input
                id="financing-link"
                type="url"
                placeholder="https://example.com/apply"
                value={financingLink}
                onChange={(e) => setFinancingLink(e.target.value)}
                className="w-full"
                data-testid="input-financing-link"
              />
              <p className="text-sm text-slate-500">
                This link will be shown as a financing option when customers view quotes that require a deposit.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg space-y-2">
              <h4 className="font-medium text-slate-700">How It Works</h4>
              <ul className="text-sm text-slate-600 space-y-1">
                <li>• Customers can choose to pay the deposit via Stripe or apply for financing</li>
                <li>• The financing button opens this link in a new tab</li>
                <li>• You can customize the link to your preferred financing provider</li>
              </ul>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={handleSaveFinancing}
                disabled={saveFinancingMutation.isPending}
                className="bg-[#d3b07d] hover:bg-[#c4a06e]"
                data-testid="button-save-financing"
              >
                {saveFinancingMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Financing Link"
                )}
              </Button>
              {!isFinancingDefault && (
                <Button
                  variant="outline"
                  onClick={handleResetFinancing}
                  disabled={resetFinancingMutation.isPending}
                  data-testid="button-reset-financing"
                >
                  {resetFinancingMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reset to Default
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6" data-testid="card-approval-alerts">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5" />
              Quote Approval Alerts
            </CardTitle>
            <CardDescription>
              Who gets an email the moment any quote is approved — signed online, deposit paid, or accepted in person
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Who is receiving RIGHT NOW — the saved state, resolved to team
                members, independent of any unsaved edits below. */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="approval-current-recipients">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Currently receiving
              </p>
              {approvalSettings?.recipients && approvalSettings.recipients.length > 0 ? (
                <div className="mt-2 space-y-1.5">
                  {approvalSettings.recipients.map((r) => (
                    <div key={r.email} className="flex items-center gap-2 text-sm" data-testid={`current-recipient-${r.email}`}>
                      <span className="font-medium text-slate-900">{r.name || r.email}</span>
                      {r.role && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                          {r.role}
                        </span>
                      )}
                      {r.name && <span className="truncate text-xs text-slate-500">{r.email}</span>}
                      {!r.name && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">not a CRM user</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-amber-700">Nobody — approval alerts are currently off.</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Recipients</Label>
                {approvalIsDefault ? (
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">Default — all owners &amp; admins</span>
                ) : (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">Custom list</span>
                )}
              </div>
              {approvalEmails.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {approvalEmails.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1 rounded-[4px] border border-slate-300/70 bg-slate-50 px-2 py-1 text-sm text-slate-700"
                      data-testid={`approval-email-${email}`}
                    >
                      {email}
                      <button
                        onClick={() => setApprovalEmails((prev) => prev.filter((e) => e !== email))}
                        className="text-slate-400 hover:text-red-600"
                        aria-label={`Remove ${email}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-amber-700">
                  No recipients — approval alerts are off. Add an email or reset to the default.
                </p>
              )}
              <div className="flex items-center gap-2">
                <Input
                  type="email"
                  placeholder="name@ghvacinc.com"
                  value={approvalEmailInput}
                  onChange={(e) => setApprovalEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addApprovalEmail();
                    }
                  }}
                  className="max-w-xs"
                  data-testid="input-approval-email"
                />
                <Button variant="outline" onClick={addApprovalEmail} data-testid="button-add-approval-email">
                  Add
                </Button>
              </div>
              <p className="text-sm text-slate-500">
                Alerts fire on every approval path: accepted in the CRM or presentation mode, the customer signing the
                public quote page, or a paid deposit auto-accepting the quote.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={() => saveApprovalEmailsMutation.mutate(approvalEmails)}
                disabled={saveApprovalEmailsMutation.isPending}
                className="bg-[#d3b07d] hover:bg-[#c4a06e]"
                data-testid="button-save-approval-emails"
              >
                {saveApprovalEmailsMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Recipients"
                )}
              </Button>
              {!approvalIsDefault && (
                <Button
                  variant="outline"
                  onClick={() => resetApprovalEmailsMutation.mutate()}
                  disabled={resetApprovalEmailsMutation.isPending}
                  data-testid="button-reset-approval-emails"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset to Default
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </CrmLayout>
  );
}
