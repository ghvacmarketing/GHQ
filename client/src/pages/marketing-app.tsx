import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { MarketingChrome, MARKETING_TABS } from "@/components/marketing-shell";
import { TemplatesTab, AudiencesTab, CampaignsTab, LeadSourcesTab } from "@/pages/marketing-tools";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Zap, Users, Send, FileText, Compass, Blocks, BarChart3, Settings,
  ArrowUpRight, PlayCircle, CheckCircle2,
} from "lucide-react";
import type { CrmUser, AutomationCampaign } from "@shared/schema";

const PLACEHOLDERS: Record<string, { icon: typeof Send; title: string; blurb: string; points: string[] }> = {
  campaigns: {
    icon: Send,
    title: "Campaigns",
    blurb: "One-off email and SMS blasts to a chosen audience — promotions, seasonal tune-up pushes, and announcements.",
    points: ["Compose once, send by email and/or text", "Pick an audience or upload a list", "Schedule sends and track delivery"],
  },
  audiences: {
    icon: Users,
    title: "Audiences",
    blurb: "Saved customer segments built from CRM data — service history, equipment age, agreement status, location.",
    points: ["Segment builder on live CRM fields", "Auto-updating membership", "Use segments in campaigns and automations"],
  },
  templates: {
    icon: FileText,
    title: "Templates",
    blurb: "Reusable email and SMS content with merge fields. Automated message templates currently live under Automations → Messages.",
    points: ["Shared library for campaigns and automations", "Merge fields for customer and job details", "Preview before sending"],
  },
  "lead-sources": {
    icon: Compass,
    title: "Lead Sources",
    blurb: "Track where new customers come from — Google, referrals, yard signs, mailers — and what each source is worth.",
    points: ["Tag customers with a source at intake", "Cost and revenue per source", "See which channels actually close"],
  },
  integrations: {
    icon: Blocks,
    title: "Integrations",
    blurb: "Connections to outside marketing channels: Google Business Profile, Meta, review platforms, and mail houses.",
    points: ["Review requests and reputation", "Ad account linking", "Webhooks for lead capture forms"],
  },
  performance: {
    icon: BarChart3,
    title: "Performance",
    blurb: "Results across everything in this app — sends, opens, replies, booked jobs, and revenue attributed to marketing.",
    points: ["Automation and campaign outcomes side by side", "Revenue attribution from CRM invoices", "Trends over time"],
  },
  settings: {
    icon: Settings,
    title: "Settings",
    blurb: "Sender identity, quiet hours, and global safeguards that apply to every campaign and automation.",
    points: ["From-name and reply-to control", "Do-not-disturb windows", "Global opt-out list"],
  },
};

export default function MarketingApp() {
  const params = useParams<{ tab?: string }>();
  const tab = params.tab ?? "dashboard";
  const known = tab === "dashboard" || !!PLACEHOLDERS[tab];
  usePageTitle(`Marketing — ${MARKETING_TABS.find((t) => t.key === tab)?.label ?? "Dashboard"}`);

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
  });

  return (
    <MarketingChrome currentUser={currentUser ?? undefined}>
      {tab === "templates" ? (
        <TemplatesTab />
      ) : tab === "audiences" ? (
        <AudiencesTab />
      ) : tab === "campaigns" ? (
        <CampaignsTab />
      ) : tab === "lead-sources" ? (
        <LeadSourcesTab />
      ) : tab === "dashboard" || !known ? (
        <MarketingDashboard />
      ) : (
        <PlaceholderTab tabKey={tab} />
      )}
    </MarketingChrome>
  );
}

function MarketingDashboard() {
  const [, navigate] = useLocation();
  const { data: automations, isLoading } = useQuery<AutomationCampaign[]>({
    queryKey: ["/api/crm/automations"],
  });
  const { data: customersData } = useQuery<{ customers: unknown[] }>({
    queryKey: ["/api/crm/customers"],
  });

  const active = (automations ?? []).filter((a) => a.isActive).length;
  const triggered = (automations ?? []).reduce((s, a) => s + (a.totalTriggered ?? 0), 0);
  const completed = (automations ?? []).reduce((s, a) => s + (a.totalCompleted ?? 0), 0);
  const audience = customersData?.customers?.length ?? 0;

  const kpis = [
    { label: "Active automations", value: active, icon: Zap },
    { label: "Runs triggered", value: triggered, icon: PlayCircle },
    { label: "Runs completed", value: completed, icon: CheckCircle2 },
    { label: "Customers reachable", value: audience, icon: Users },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-0.5 text-sm text-slate-500">A live picture of marketing across the company.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isLoading
          ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-[4px]" />)
          : kpis.map((k) => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="rounded-[4px] border border-slate-300/70 bg-white p-4">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <Icon className="h-3.5 w-3.5 text-[#711419]" strokeWidth={1.75} /> {k.label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900" data-testid={`mkt-kpi-${k.label.toLowerCase().replace(/\s+/g, "-")}`}>
                    {k.value.toLocaleString()}
                  </p>
                </div>
              );
            })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MARKETING_TABS.filter((t) => t.key !== "dashboard" && t.key !== "settings").map((t) => {
          const Icon = t.icon;
          const live = t.key === "automations";
          return (
            <button
              key={t.key}
              onClick={() => navigate(t.path)}
              className="group flex flex-col rounded-[4px] border border-slate-300/70 bg-white p-4 text-left transition-colors hover:border-slate-900"
              data-testid={`mkt-card-${t.key}`}
            >
              <div className="flex items-start justify-between">
                <Icon className="h-5 w-5 text-[#711419]" strokeWidth={1.75} />
                <ArrowUpRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-900" />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-900">{t.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {live ? "Trigger-based messages and tasks — running now." : PLACEHOLDERS[t.key]?.blurb.split("—")[0].split(".")[0]}
              </p>
              {!live && (
                <span className="mt-2 inline-flex w-fit rounded-[3px] border border-slate-300/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  Coming online
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlaceholderTab({ tabKey }: { tabKey: string }) {
  const [, navigate] = useLocation();
  const p = PLACEHOLDERS[tabKey];
  const Icon = p.icon;
  return (
    <div className="mx-auto max-w-2xl pt-8">
      <div className="rounded-[4px] border border-slate-300/70 bg-white p-8">
        <Icon className="h-8 w-8 text-[#711419]" strokeWidth={1.5} />
        <h1 className="mt-4 font-display text-lg font-semibold tracking-tight text-slate-900">{p.title}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{p.blurb}</p>
        <ul className="mt-4 space-y-1.5">
          {p.points.map((pt) => (
            <li key={pt} className="flex items-start gap-2 text-sm text-slate-500">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-400" />
              {pt}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex items-center gap-2 border-t border-slate-200 pt-4">
          <span className="rounded-[3px] border border-slate-300/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Coming online
          </span>
          {tabKey === "templates" && (
            <Button size="sm" variant="outline" className="ml-auto h-8" onClick={() => navigate("/marketing/automations/messages")} data-testid="link-automation-messages">
              Automated message templates
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
