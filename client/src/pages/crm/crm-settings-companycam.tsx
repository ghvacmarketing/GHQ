import { useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Camera, Loader2, RefreshCw, Search, X } from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type CcLink = {
  ccProjectId: string;
  ccProjectName: string | null;
  ccAddress: string | null;
  customerId: string | null;
  customerName: string | null;
  matchType: "auto" | "manual" | "unmatched" | "ignored";
  matchScore: number | null;
  photoCount: number | null;
  importedCount: number | null;
  archived: boolean | null;
  lastSyncedAt: string | null;
};

type SyncResult = {
  projects: number;
  autoMatched: number;
  unmatched: number;
  photosImported: number;
  errors: string[];
};

const matchChip: Record<CcLink["matchType"], string> = {
  auto: "bg-emerald-100 text-emerald-700",
  manual: "bg-blue-100 text-blue-700",
  unmatched: "bg-amber-100 text-amber-800",
  ignored: "bg-slate-100 text-slate-500",
};

export default function CrmSettingsCompanycam() {
  usePageTitle("CompanyCam");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [matching, setMatching] = useState<CcLink | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");

  const { data, isLoading } = useQuery<{ configured: boolean; links: CcLink[] }>({
    queryKey: ["/api/crm/companycam/status"],
    queryFn: async () => {
      const res = await fetch("/api/crm/companycam/status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load CompanyCam status");
      return res.json();
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/crm/companycam/sync", {});
      return res.json() as Promise<SyncResult>;
    },
    onSuccess: (result) => {
      setLastSync(result);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/companycam/status"] });
      toast({
        title: "Sync complete",
        description: `${result.projects} projects, ${result.photosImported} new photos imported.`,
      });
    },
    onError: (e: any) => toast({ title: "Sync failed", description: e?.message, variant: "destructive" }),
  });

  const linkMutation = useMutation({
    mutationFn: async ({ ccProjectId, customerId, ignore }: { ccProjectId: string; customerId?: string; ignore?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/crm/companycam/links/${ccProjectId}`, { customerId, ignore });
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/companycam/status"] });
      setMatching(null);
      setCustomerSearch("");
      if (result.matchType === "manual") {
        toast({ title: `Matched to ${result.customerName}`, description: `${result.imported ?? 0} photos imported.` });
      }
    },
    onError: (e: any) => toast({ title: "Couldn't update the link", description: e?.message, variant: "destructive" }),
  });

  const { data: customerResults = [], isFetching: searchingCustomers } = useQuery<Array<{ id: string; name: string; phone?: string | null }>>({
    queryKey: ["/api/mobile/customers", "cc-match", customerSearch],
    queryFn: async () => {
      const res = await fetch(`/api/mobile/customers?search=${encodeURIComponent(customerSearch.trim())}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!matching && customerSearch.trim().length >= 2,
  });

  const links = data?.links ?? [];
  const matched = links.filter((l) => l.customerId).length;
  const unmatched = links.filter((l) => l.matchType === "unmatched").length;
  const imported = links.reduce((s, l) => s + (l.importedCount || 0), 0);

  return (
    <CrmLayout>
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/crm/settings")} data-testid="button-back-settings">
            <ArrowLeft className="mr-1 h-4 w-4" /> Settings
          </Button>
        </div>

        <Card className="rounded-[4px] border-slate-300/70 shadow-none">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-[#711419]" /> CompanyCam
              </CardTitle>
              <CardDescription className="mt-1">
                Projects match CRM customers by address; photos sync as references (their CDN hosts the images).
                New CRM photos push back to the linked project automatically.
              </CardDescription>
            </div>
            <Button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending || !data?.configured}
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              data-testid="button-companycam-sync"
            >
              {syncMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              Sync now
            </Button>
          </CardHeader>
          <CardContent>
            {data && !data.configured && (
              <p className="rounded-[3px] border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                COMPANYCAM_API_TOKEN isn't set on the server — add it in the Render environment and redeploy to enable syncing.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Projects", links.length],
                ["Matched", matched],
                ["Needs review", unmatched],
                ["Photos imported", imported],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-[4px] border border-slate-300/70 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            {lastSync && lastSync.errors.length > 0 && (
              <p className="mt-3 text-xs text-red-600">{lastSync.errors.length} project(s) had errors — check server logs.</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[4px] border-slate-300/70 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Project matches</CardTitle>
            <CardDescription>
              Auto-matches need a street-number match plus a strong address score. Fix anything amber with "Match".
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : links.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                No projects synced yet — run "Sync now" once the token is configured.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CompanyCam project</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>CRM customer</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead className="text-right">Photos</TableHead>
                    <TableHead className="w-[180px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map((link) => (
                    <TableRow key={link.ccProjectId} data-testid={`cc-link-${link.ccProjectId}`}>
                      <TableCell className="font-medium">
                        {link.ccProjectName || "Untitled"}
                        {link.archived && <span className="ml-1.5 text-[10px] uppercase text-slate-400">archived</span>}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{link.ccAddress || "—"}</TableCell>
                      <TableCell className="text-sm">{link.customerName || <span className="text-slate-400">—</span>}</TableCell>
                      <TableCell>
                        <span className={cn("rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", matchChip[link.matchType])}>
                          {link.matchType}
                          {link.matchType === "auto" && link.matchScore != null && ` ${link.matchScore}`}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {link.importedCount || 0} / {link.photoCount || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => { setMatching(link); setCustomerSearch(""); }}
                            data-testid={`button-match-${link.ccProjectId}`}
                          >
                            {link.customerId ? "Change" : "Match"}
                          </Button>
                          {link.matchType !== "ignored" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-slate-500"
                              onClick={() => linkMutation.mutate({ ccProjectId: link.ccProjectId, ignore: true })}
                            >
                              Ignore
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-slate-500"
                              onClick={() => linkMutation.mutate({ ccProjectId: link.ccProjectId })}
                            >
                              Unignore
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Manual match dialog */}
      <Dialog open={!!matching} onOpenChange={(o) => { if (!o) { setMatching(null); setCustomerSearch(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Match "{matching?.ccProjectName || "project"}"</DialogTitle>
            <DialogDescription>
              {matching?.ccAddress ? `CompanyCam address: ${matching.ccAddress}` : "Pick the CRM customer this project belongs to."}
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Search customers by name or phone..."
              className="pl-9"
              autoFocus
              data-testid="cc-match-search"
            />
            {customerSearch && (
              <button
                onClick={() => setCustomerSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                aria-label="Clear"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {customerSearch.trim().length < 2 ? (
              <p className="py-6 text-center text-sm text-slate-400">Type at least two characters.</p>
            ) : searchingCustomers ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : customerResults.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">No customers match.</p>
            ) : (
              <div className="overflow-hidden rounded-[4px] border border-slate-300/70">
                {customerResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => matching && linkMutation.mutate({ ccProjectId: matching.ccProjectId, customerId: c.id })}
                    disabled={linkMutation.isPending}
                    className="flex w-full items-center justify-between border-b border-slate-200/80 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50 disabled:opacity-60"
                    data-testid={`cc-match-customer-${c.id}`}
                  >
                    <span className="text-sm font-medium text-slate-900">{c.name}</span>
                    {c.phone && <span className="text-xs text-slate-500">{c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {matching?.lastSyncedAt && (
            <p className="text-xs text-slate-400">Last synced {format(new Date(matching.lastSyncedAt), "MMM d, h:mm a")}</p>
          )}
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
