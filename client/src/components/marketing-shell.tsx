import { useLocation } from "wouter";
import {
  LayoutDashboard, Send, Users, FileText, Zap,
  Compass, Blocks, BarChart3, Settings,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopBar } from "@/components/app-topbar";
import type { CrmUser } from "@shared/schema";

/** "/marketing/..." renders the standalone Marketing app chrome; the legacy
 *  "/crm/marketing/..." paths keep the CRM sidebar so old links still work.
 *  In the standalone app the automation pages live under /marketing/automations. */
export function useMarketingBase(): string {
  const [location] = useLocation();
  return location.startsWith("/marketing") ? "/marketing/automations" : "/crm/marketing";
}

export const MARKETING_TABS = [
  { key: "dashboard", label: "Dashboard", path: "/marketing", icon: LayoutDashboard },
  { key: "campaigns", label: "Campaigns", path: "/marketing/campaigns", icon: Send },
  { key: "audiences", label: "Audiences", path: "/marketing/audiences", icon: Users },
  { key: "templates", label: "Templates", path: "/marketing/templates", icon: FileText },
  { key: "automations", label: "Automations", path: "/marketing/automations", icon: Zap },
  { key: "lead-sources", label: "Lead Sources", path: "/marketing/lead-sources", icon: Compass },
  { key: "integrations", label: "Integrations", path: "/marketing/integrations", icon: Blocks },
  { key: "performance", label: "Performance", path: "/marketing/performance", icon: BarChart3 },
  { key: "settings", label: "Settings", path: "/marketing/settings", icon: Settings },
] as const;

function activeTabKey(location: string): string {
  if (location === "/marketing" || location === "/marketing/") return "dashboard";
  const match = MARKETING_TABS.find((t) => t.key !== "dashboard" && location.startsWith(t.path));
  return match?.key ?? "dashboard";
}

export function MarketingChrome({
  currentUser,
  children,
}: {
  currentUser?: CrmUser;
  children: React.ReactNode;
}) {
  const [location, navigate] = useLocation();
  const standalone = location.startsWith("/marketing");

  if (!standalone) {
    return <CrmLayout currentUser={currentUser as CrmUser}>{children}</CrmLayout>;
  }

  const active = activeTabKey(location);

  return (
    <div className="flex h-screen flex-col bg-[#f4f5f6]">
      <AppTopBar currentUser={currentUser ?? null} />
      <div className="flex min-h-0 flex-1">
        {/* Sidebar — shared CRM-style dark collapsible panel with branded header */}
        <AppSidebar
          appKey="mkt"
          header={{ title: "Marketing", subtitle: "Command Center", onHome: () => navigate("/") }}
          activeKey={active}
          onSelect={(k) => {
            const t = MARKETING_TABS.find((x) => x.key === k);
            if (t) navigate(t.path);
          }}
          groups={[{ items: MARKETING_TABS.map((t) => ({ key: t.key, label: t.label, icon: t.icon })) }]}
        />
        <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          {/* Mobile tab strip */}
          <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1 sm:hidden">
            {MARKETING_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => navigate(t.path)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  active === t.key ? "bg-[#711419] text-white" : "bg-white text-slate-600 border border-black/[0.06]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
