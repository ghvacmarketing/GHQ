import { useEffect, useState } from "react";
import { AppLoader, useAppEntryHold } from "@/components/app-loader";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Monitor, Smartphone, FolderOpen, Calculator, Megaphone, Wrench, Loader2, ArrowUpRight, BarChart3, UserRound,
} from "lucide-react";
import { crmFetch } from "@/lib/crmAuth";
import { isNativeApp } from "@/lib/native";
import type { CrmUser } from "@shared/schema";
import redlogo from "@assets/redlogo.webp";

function firstNameOf(name?: string | null): string {
  if (!name) return "";
  return name.trim().split(/\s+/)[0] || "";
}

type AppTile = {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  roles?: string[]; // undefined = everyone
};

const APPS: AppTile[] = [
  {
    key: "crm",
    label: "CRM",
    description: "Customers, dispatch, quotes & invoices",
    href: "/crm",
    icon: <Monitor className="h-6 w-6" strokeWidth={1.75} />,
  },
  {
    key: "field",
    label: "Field",
    description: "Tech agenda, jobs & time",
    href: "/mobile",
    icon: <Smartphone className="h-6 w-6" strokeWidth={1.75} />,
  },
  {
    key: "documents",
    label: "Documents",
    description: "Company files & folders",
    href: "/documents",
    icon: <FolderOpen className="h-6 w-6" strokeWidth={1.75} />,
  },
  {
    key: "accounting",
    label: "Accounting",
    description: "P&L, expenses & receivables",
    href: "/accounting",
    icon: <Calculator className="h-6 w-6" strokeWidth={1.75} />,
    roles: ["owner", "admin", "supervisor"],
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Campaigns & automations",
    href: "/marketing",
    icon: <Megaphone className="h-6 w-6" strokeWidth={1.75} />,
    roles: ["owner", "admin", "supervisor", "sales"],
  },
  {
    key: "portal",
    label: "Customer Portal",
    description: "What customers see — accounts, invoices & payments",
    href: "/portal/login",
    icon: <UserRound className="h-6 w-6" strokeWidth={1.75} />,
  },
];

export default function LandingSelect() {
  const [, navigate] = useLocation();
  const entryHold = useAppEntryHold();
  // Phones (and the native shell) don't get the desktop apps — their whole
  // world is the Field app and the Customer portal, so the welcome page is
  // just those two doors. Checked once at mount; rotation mid-visit is fine.
  const [isMobileView] = useState(
    () => typeof window !== "undefined" && (isNativeApp() || window.innerWidth < 768),
  );

  const { data: crmUser, isLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await crmFetch("/api/crm/auth/me");
      if (!res.ok) return null;
      const data = await res.json();
      return data.user || data;
    },
    staleTime: 60 * 1000,
  });

  const ready = !isLoading;
  const isAuthenticated = !!crmUser?.id;

  useEffect(() => {
    // Desktop only: the launcher is staff-only, so no session → CRM login.
    // The mobile welcome stays open — customers land here for the portal.
    if (ready && !isAuthenticated && !isMobileView) navigate("/crm/login");
  }, [ready, isAuthenticated, isMobileView, navigate]);

  if (entryHold) {
    return <AppLoader />;
  }

  if (isMobileView) {
    const firstName = firstNameOf(crmUser?.name);
    return (
      <div
        className="flex min-h-screen flex-col bg-[#f4f5f6]"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12" data-testid="mobile-welcome">
          <img src={redlogo} alt="Giesbrecht HVAC" className="mb-8 h-10 self-start" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900" data-testid="text-welcome">
            {firstName ? `Welcome back, ${firstName}` : "Welcome"}
          </h1>

          <div className="my-6 h-px bg-slate-200" />

          <div className="space-y-3">
            <button
              onClick={() => navigate(isAuthenticated ? "/mobile" : "/crm/login")}
              className="flex w-full items-center gap-4 rounded-[4px] border border-slate-300/70 bg-white p-5 text-left transition-transform active:scale-[0.99] active:bg-slate-50"
              data-testid="welcome-field"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] border border-[#711419]/20 bg-[#711419]/5 text-[#711419]">
                <Smartphone className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-slate-900">Field app</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">
                  For the team — schedule, jobs, time &amp; customers
                </span>
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300" strokeWidth={1.75} />
            </button>

            <button
              onClick={() => navigate("/portal/login")}
              className="flex w-full items-center gap-4 rounded-[4px] border border-slate-300/70 bg-white p-5 text-left transition-transform active:scale-[0.99] active:bg-slate-50"
              data-testid="welcome-portal"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] border border-[#711419]/20 bg-[#711419]/5 text-[#711419]">
                <UserRound className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-slate-900">Customer portal</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">
                  Your invoices, quotes, payments &amp; service history
                </span>
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300" strokeWidth={1.75} />
            </button>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-4">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
              Giesbrecht HVAC · Wrens, GA
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (!ready || !isAuthenticated) {
    return (
      <AppLoader />
    );
  }

  const role = crmUser?.role || "tech";
  const visibleApps = APPS.filter((a) => !a.roles || a.roles.includes(role));
  const firstName = firstNameOf(crmUser?.name);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f5f6]">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-14">
        {/* Header — left-aligned, utilitarian */}
        <div className="mb-8">
          <img src={redlogo} alt="Giesbrecht HVAC" className="mb-8 h-10" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900" data-testid="text-welcome">
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </h1>
        </div>

        <div className="mb-4 h-px bg-slate-200" />

        {/* App grid — flat, squared, monochrome with one accent */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="app-grid">
          {visibleApps.map((app, i) => (
            <button
              key={app.key}
              onClick={() => navigate(app.href)}
              className="group relative flex flex-col items-start rounded-[4px] border border-slate-300/70 bg-white p-5 text-left transition-colors duration-150 hover:border-slate-900 active:bg-slate-50 animate-in fade-in"
              style={{ animationDelay: `${i * 50}ms`, animationFillMode: "backwards", animationDuration: "350ms" }}
              data-testid={`app-${app.key}`}
            >
              <span className="text-[#711419]">{app.icon}</span>
              <span className="mt-5 text-[15px] font-semibold text-slate-900">{app.label}</span>
              <span className="mt-0.5 text-[12px] leading-snug text-slate-500">{app.description}</span>
              <ArrowUpRight className="absolute right-4 top-4 h-4 w-4 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.75} />
            </button>
          ))}
        </div>

        {/* Footer utilities */}
        <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-4">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
            Giesbrecht HVAC
          </span>
          <button
            onClick={() => navigate("/tools")}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-800"
            data-testid="link-ghvac-tools"
          >
            <Wrench className="h-3.5 w-3.5" strokeWidth={1.75} />
            GHVAC Tools
          </button>
        </div>
      </div>
    </div>
  );
}
