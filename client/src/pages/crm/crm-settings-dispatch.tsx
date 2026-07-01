import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { ArrowLeft, Check, Clock } from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { SectionCard } from "@/components/crm/ui-kit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

  const [increment, setIncrement] = useState<15 | 30>(() => {
    if (typeof window === "undefined") return 30;
    return Number(localStorage.getItem(STORAGE_KEY)) === 15 ? 15 : 30;
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

  const apply = (value: 15 | 30) => {
    setIncrement(value);
    localStorage.setItem(STORAGE_KEY, String(value));
    toast({
      title: "Saved",
      description: `Dispatch board set to ${value}-minute increments. Reload the dispatch board to apply.`,
    });
  };

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
      </div>
    </CrmLayout>
  );
}
