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
import { ArrowLeft, CreditCard, Loader2 } from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser } from "@shared/schema";

export default function CrmSettingsPayments() {
  usePageTitle("Payment Settings");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [depositPercentage, setDepositPercentage] = useState<number>(50);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: settings, isLoading: settingsLoading } = useQuery<{ depositPercentage: number }>({
    queryKey: ["/api/stripe/settings/deposit-percentage"],
    enabled: !!currentUser,
  });

  useEffect(() => {
    if (settings?.depositPercentage) {
      setDepositPercentage(settings.depositPercentage);
    }
  }, [settings]);

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

  if (authLoading || settingsLoading) {
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

  const isAdmin = currentUser.role === "owner" || currentUser.role === "admin";
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
      </div>
    </CrmLayout>
  );
}
