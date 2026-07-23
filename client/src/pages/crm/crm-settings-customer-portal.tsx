import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { crmFetch, crmApiRequest } from "@/lib/crmAuth";
import { usePageTitle } from "@/hooks/use-page-title";
import { ArrowLeft, Globe, RefreshCw, Users, KeyRound, Activity } from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { SectionCard } from "@/components/crm/ui-kit";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser } from "@shared/schema";

interface PortalSettings {
  syncCustomerEdits: boolean;
  stats: {
    totalAccounts: number;
    withPassword: number;
    activeLast30d: number;
    portalEnabledCustomers: number;
  };
}

export default function CrmSettingsCustomerPortal() {
  usePageTitle("Customer Portal Settings");
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: settings, isLoading: settingsLoading } = useQuery<PortalSettings>({
    queryKey: ["/api/admin/settings/customer-portal"],
    queryFn: async () => {
      const res = await crmFetch("/api/admin/settings/customer-portal");
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const updateSync = useMutation({
    mutationFn: async (syncCustomerEdits: boolean) => {
      const res = await crmApiRequest("PUT", "/api/admin/settings/customer-portal", { syncCustomerEdits });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to update setting");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/customer-portal"] });
      toast({
        title: "Setting saved",
        description: data.syncCustomerEdits
          ? "Customer portal edits will update CRM records directly."
          : "Customer portal edits will stay on the portal account only — you'll get a notification instead.",
      });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  if (authLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }
  if (!currentUser) {
    navigate("/crm/login");
    return null;
  }

  const stats = settings?.stats;
  const statItems = [
    { label: "Portal-enabled customers", value: stats?.portalEnabledCustomers, icon: Globe },
    { label: "Portal accounts", value: stats?.totalAccounts, icon: Users },
    { label: "With password login", value: stats?.withPassword, icon: KeyRound },
    { label: "Active in last 30 days", value: stats?.activeLast30d, icon: Activity },
  ];

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/crm/settings")}
            data-testid="button-back-to-settings"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Settings
          </Button>
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Customer Portal</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Control how the customer-facing portal behaves.
          </p>
        </div>

        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary" /> Sync customer edits into the CRM
            </span>
          }
          description="Customers can always update their own portal profile. This controls whether those edits (name, email, phone) also update the CRM customer record. Either way, admins are notified and every change is logged."
        >
          {settingsLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="font-medium text-foreground">
                  {settings?.syncCustomerEdits ? "Syncing to CRM" : "Portal-only (review manually)"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {settings?.syncCustomerEdits
                    ? "Portal edits update the CRM customer record immediately."
                    : "Portal edits stay on the portal account; you'll get a notification to apply them."}
                </p>
              </div>
              <Switch
                checked={!!settings?.syncCustomerEdits}
                onCheckedChange={(checked) => updateSync.mutate(checked)}
                disabled={updateSync.isPending || settingsLoading}
                data-testid="switch-sync-customer-edits"
              />
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Portal at a glance"
          description="Address change requests and profile edits appear in your CRM notifications. Per-customer portal details are on each customer's page."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {statItems.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-lg border border-border p-4" data-testid={`stat-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                  <span className="text-sm">{label}</span>
                </div>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {settingsLoading ? "—" : value ?? 0}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </CrmLayout>
  );
}
