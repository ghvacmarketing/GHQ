import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { ArrowLeft, Sun, Moon, Check } from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { SectionCard } from "@/components/crm/ui-kit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import type { CrmUser } from "@shared/schema";

const OPTIONS = [
  { v: "light", label: "Light", icon: Sun, hint: "Bright, default theme." },
  { v: "dark", label: "Dark", icon: Moon, hint: "Dimmed surfaces for low-light." },
] as const;

export default function CrmSettingsAppearance() {
  usePageTitle("Appearance");
  const [, navigate] = useLocation();
  const { theme, setTheme } = useTheme();

  const { data: currentUser, isLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }
  if (!currentUser) {
    navigate("/crm/login");
    return null;
  }

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
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Appearance</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Choose how the CRM looks.</p>
        </div>

        <SectionCard title="Theme" description="Switch between light and dark mode.">
          <div className="grid gap-3 sm:grid-cols-2">
            {OPTIONS.map((opt) => {
              const active = theme === opt.v;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.v}
                  onClick={() => setTheme(opt.v)}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors",
                    active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted"
                  )}
                  data-testid={`theme-${opt.v}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-semibold text-foreground">
                      <Icon className="h-4 w-4" /> {opt.label}
                    </span>
                    {active && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{opt.hint}</p>
                </button>
              );
            })}
          </div>
        </SectionCard>
      </div>
    </CrmLayout>
  );
}
