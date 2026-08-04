import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { getQueryFn } from "@/lib/queryClient";
import { crmFetch, crmApiRequest } from "@/lib/crmAuth";
import { usePageTitle } from "@/hooks/use-page-title";
import { ArrowLeft, Globe, RefreshCw, Users, KeyRound, Activity, Search } from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { SectionCard } from "@/components/crm/ui-kit";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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

interface PortalCustomerRow {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  portalEnabled: boolean;
  hasAccount: boolean;
  hasPassword: boolean;
  lastLoginAt: string | null;
  accountCreatedAt: string | null;
}

type AccessBucket = "all" | "logged_in" | "never" | "no_account";

/** Which access bucket a customer falls in. */
function bucketOf(row: PortalCustomerRow): Exclude<AccessBucket, "all"> {
  if (row.hasAccount && row.lastLoginAt) return "logged_in";
  if (row.hasAccount) return "never";
  return "no_account";
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

  // Access monitor — every customer with their portal login state
  const [accessBucket, setAccessBucket] = useState<AccessBucket>("all");
  const [accessSearch, setAccessSearch] = useState("");
  const { data: portalCustomers, isLoading: customersLoading } = useQuery<{ customers: PortalCustomerRow[] }>({
    queryKey: ["/api/admin/settings/customer-portal/customers"],
    queryFn: async () => {
      const res = await crmFetch("/api/admin/settings/customer-portal/customers");
      if (!res.ok) throw new Error("Failed to load portal customers");
      return res.json();
    },
    enabled: !!currentUser,
  });
  const allPortalRows = portalCustomers?.customers || [];
  const bucketCounts = {
    all: allPortalRows.length,
    logged_in: allPortalRows.filter((r) => bucketOf(r) === "logged_in").length,
    never: allPortalRows.filter((r) => bucketOf(r) === "never").length,
    no_account: allPortalRows.filter((r) => bucketOf(r) === "no_account").length,
  };
  const q = accessSearch.trim().toLowerCase();
  const visibleRows = allPortalRows
    .filter((r) => accessBucket === "all" || bucketOf(r) === accessBucket)
    .filter((r) => !q || [r.name, r.phone, r.email].some((v) => (v || "").toLowerCase().includes(q)));
  // Most recent logins first inside the list; account-less customers last
  const sortedRows = [...visibleRows].sort((a, b) => {
    const at = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : a.hasAccount ? 1 : 0;
    const bt = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : b.hasAccount ? 1 : 0;
    return bt - at;
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

        <SectionCard
          title="Portal access monitor"
          description="Every customer and where they stand with the portal: who's logged in (and when), who has an account but never signed in, and who has no account yet."
        >
          <div className="space-y-3">
            {/* Bucket chips */}
            <div className="flex flex-wrap gap-2">
              {([
                { key: "all", label: "All" },
                { key: "logged_in", label: "Logged in" },
                { key: "never", label: "Never logged in" },
                { key: "no_account", label: "No account" },
              ] as Array<{ key: AccessBucket; label: string }>).map((b) => (
                <button
                  key={b.key}
                  onClick={() => setAccessBucket(b.key)}
                  className={`rounded-[4px] border px-3 py-1.5 text-sm font-medium transition-colors ${
                    accessBucket === b.key
                      ? "border-[#711419] bg-[#711419]/[0.06] text-[#711419]"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`portal-access-bucket-${b.key}`}
                >
                  {b.label}
                  <span className="ml-1.5 tabular-nums opacity-70">{customersLoading ? "…" : bucketCounts[b.key]}</span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={accessSearch}
                onChange={(e) => setAccessSearch(e.target.value)}
                placeholder="Search by name, phone, or email"
                className="pl-9"
                data-testid="portal-access-search"
              />
            </div>

            {/* The list */}
            {customersLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : sortedRows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground" data-testid="portal-access-empty">
                No customers match.
              </p>
            ) : (
              <div className="max-h-[26rem] overflow-y-auto rounded-lg border border-border" data-testid="portal-access-list">
                {sortedRows.map((row, i) => {
                  const bucket = bucketOf(row);
                  return (
                    <button
                      key={row.id}
                      onClick={() => navigate(`/crm/customers/${row.id}`)}
                      className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/50 ${i > 0 ? "border-t border-border" : ""}`}
                      data-testid={`portal-access-row-${row.id}`}
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          bucket === "logged_in" ? "bg-emerald-500" : bucket === "never" ? "bg-amber-500" : "bg-slate-300"
                        }`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{row.name || "Unnamed customer"}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[row.phone, row.email].filter(Boolean).join(" · ") || "No contact info"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`block text-xs font-semibold ${
                          bucket === "logged_in" ? "text-emerald-600" : bucket === "never" ? "text-amber-600" : "text-muted-foreground"
                        }`}>
                          {bucket === "logged_in" ? "Logged in" : bucket === "never" ? "Never logged in" : "No account"}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {row.lastLoginAt
                            ? `Last: ${format(new Date(row.lastLoginAt), "MMM d, yyyy")}`
                            : row.hasAccount && row.accountCreatedAt
                              ? `Invited ${format(new Date(row.accountCreatedAt), "MMM d, yyyy")}`
                              : ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </CrmLayout>
  );
}
