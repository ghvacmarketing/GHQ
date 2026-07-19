import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { ArrowLeft, Check, Clock, Users } from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { SectionCard } from "@/components/crm/ui-kit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { CrmUser } from "@shared/schema";

const STORAGE_KEY = "crm_dispatch_step_minutes";
const OPTIONS = [
  { value: 30, label: "30 minutes", hint: "Standard — wider time blocks, fits comfortably on screen." },
  { value: 15, label: "15 minutes", hint: "Finer scheduling — snaps work orders to quarter-hour slots." },
] as const;

export default function CrmSettingsDispatch() {
  usePageTitle("Dispatch Board Settings");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: currentUser, isLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: members = [] } = useQuery<Array<{
    id: string; name: string; role: string; onBoard: boolean; alwaysOnByRole: boolean; openJobs: number;
  }>>({
    queryKey: ["/api/crm/dispatch-board/members"],
    enabled: !!currentUser,
  });
  const [override, setOverride] = useState<{ id: string; name: string; message: string } | null>(null);

  const toggleMember = useMutation({
    mutationFn: async (p: { id: string; onBoard: boolean; force?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/crm/users/${p.id}/dispatch-board`, { onBoard: p.onBoard, force: p.force });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch-board/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/technicians"] });
      setOverride(null);
    },
    onError: (err: any, vars) => {
      if (err?.requiresOverride && currentUser?.role === "owner") {
        const m = members.find((x) => x.id === vars.id);
        setOverride({ id: vars.id, name: m?.name || "this user", message: err.message });
      } else {
        toast({ title: "Couldn't update board", description: err?.message || "Try again", variant: "destructive" });
      }
    },
  });

  // The increment lives server-side so it applies to every user; localStorage
  // is kept in sync as a cache for the dispatch board's load-time read.
  const { data: dispatchSettings } = useQuery<{ stepMinutes: 15 | 30 }>({
    queryKey: ["/api/crm/dispatch-settings"],
    enabled: !!currentUser,
  });
  const [increment, setIncrement] = useState<15 | 30>(() => {
    if (typeof window === "undefined") return 30;
    return Number(localStorage.getItem(STORAGE_KEY)) === 15 ? 15 : 30;
  });
  useEffect(() => {
    if (dispatchSettings) {
      setIncrement(dispatchSettings.stepMinutes);
      localStorage.setItem(STORAGE_KEY, String(dispatchSettings.stepMinutes));
    }
  }, [dispatchSettings]);

  const saveIncrement = useMutation({
    mutationFn: async (value: 15 | 30) =>
      (await apiRequest("PUT", "/api/crm/dispatch-settings", { stepMinutes: value })).json(),
    onSuccess: (r: { stepMinutes: 15 | 30 }) => {
      setIncrement(r.stepMinutes);
      localStorage.setItem(STORAGE_KEY, String(r.stepMinutes));
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch-settings"] });
      toast({
        title: "Saved for everyone",
        description: `Scheduling now snaps to ${r.stepMinutes}-minute increments on the dispatch board and in mobile. Open boards apply it on their next load.`,
      });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save", description: e?.message || "Admin access is required to change this.", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }
  if (!currentUser) {
    navigate("/crm/login");
    return null;
  }

  const apply = (value: 15 | 30) => saveIncrement.mutate(value);

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
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Dispatch Board</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Control how the schedule grid behaves.</p>
        </div>

        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Time increment
            </span>
          }
          description="The grid spacing and the slot work orders snap to when scheduled or dragged."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {OPTIONS.map((opt) => {
              const active = increment === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => apply(opt.value)}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors",
                    active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted"
                  )}
                  data-testid={`dispatch-increment-${opt.value}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">{opt.label}</span>
                    {active && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{opt.hint}</p>
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Changes apply the next time the dispatch board loads.
          </p>
        </SectionCard>

        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Board members
            </span>
          }
          description="Techs and supervisors are always on the board. Anyone else (e.g. sales) can be added here. Removing someone with open scheduled jobs — or any tech/supervisor — is an owner-only override; their jobs stay assigned either way."
        >
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5" data-testid={`board-member-${m.id}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{m.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {m.role}
                    {m.openJobs > 0 && ` · ${m.openJobs} open job${m.openJobs === 1 ? "" : "s"}`}
                    {m.alwaysOnByRole && " · always on"}
                  </p>
                </div>
                <Switch
                  checked={m.onBoard}
                  onCheckedChange={(checked) => toggleMember.mutate({ id: m.id, onBoard: checked })}
                  disabled={toggleMember.isPending}
                  data-testid={`switch-board-${m.id}`}
                />
              </div>
            ))}
            {members.length === 0 && <Skeleton className="h-24 w-full" />}
          </div>
        </SectionCard>
      </div>

      {/* Owner override confirm */}
      <AlertDialog open={!!override} onOpenChange={(o) => !o && setOverride(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {override?.name} from the board?</AlertDialogTitle>
            <AlertDialogDescription>{override?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-override">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => override && toggleMember.mutate({ id: override.id, onBoard: false, force: true })}
              data-testid="button-confirm-override"
            >
              Remove anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
