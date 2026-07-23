import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { MarketingChrome, useMarketingBase } from "@/components/marketing-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { usePageTitle } from "@/hooks/use-page-title";
import { AutomationForm } from "@/components/crm/automation-builder";
import type { CrmUser, AutomationCampaign } from "@shared/schema";

export default function CrmMarketingBuilder() {
  const params = useParams();
  const [, navigate] = useLocation();
  const id = params.id;
  usePageTitle(id ? "Edit automation" : "New automation");

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  // Editing: pull the campaign from the (cached) list.
  const { data: automations, isLoading } = useQuery<AutomationCampaign[]>({
    queryKey: ["/api/crm/automations"],
    enabled: !!currentUser && !!id,
  });
  const existing = id ? automations?.find((a) => a.id === id) ?? null : null;

  const base = useMarketingBase();
  const back = () => navigate(base);

  return (
    <MarketingChrome currentUser={currentUser ?? undefined}>
      <div className="w-full">
        <div className="mb-5 flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={back}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
              {id ? "Edit automation" : "New automation"}
            </h1>
            <p className="text-sm text-muted-foreground">Trigger → conditions → actions → timing → safeguards</p>
          </div>
        </div>

        {id && isLoading ? (
          <div className="mx-auto max-w-2xl space-y-4">
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        ) : (
          <AutomationForm existing={existing} onDone={back} onCancel={back} />
        )}
      </div>
    </MarketingChrome>
  );
}
