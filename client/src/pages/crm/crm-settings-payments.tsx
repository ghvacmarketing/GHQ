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
import { ArrowLeft, CreditCard, Loader2, DollarSign, RotateCcw } from "lucide-react";
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
        <div className="p-6 max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-slate-900 mb-6">Payment Settings</h1>
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
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/crm/settings")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-slate-900">Payment Settings</h1>
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
      </div>
    </CrmLayout>
  );
}
