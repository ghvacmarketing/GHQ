import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Monitor, Smartphone, FolderOpen, Calculator, Megaphone, Wrench, Loader2,
} from "lucide-react";
import { crmFetch } from "@/lib/crmAuth";
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
  gradient: string; // squircle background
  roles?: string[]; // undefined = everyone
};

const APPS: AppTile[] = [
  {
    key: "crm",
    label: "CRM",
    description: "Customers, dispatch, quotes & invoices",
    href: "/crm",
    icon: <Monitor className="h-7 w-7 text-white" />,
    gradient: "bg-gradient-to-br from-[#8a1a1f] to-[#5c0f13]",
  },
  {
    key: "field",
    label: "Field",
    description: "Tech agenda, jobs & time",
    href: "/mobile",
    icon: <Smartphone className="h-7 w-7 text-white" />,
    gradient: "bg-gradient-to-br from-slate-700 to-slate-900",
  },
  {
    key: "documents",
    label: "Documents",
    description: "Company files & folders",
    href: "/documents",
    icon: <FolderOpen className="h-7 w-7 text-white" />,
    gradient: "bg-gradient-to-br from-sky-500 to-blue-700",
  },
  {
    key: "accounting",
    label: "Accounting",
    description: "P&L, expenses & receivables",
    href: "/accounting",
    icon: <Calculator className="h-7 w-7 text-white" />,
    gradient: "bg-gradient-to-br from-emerald-500 to-green-700",
    roles: ["owner", "admin", "supervisor"],
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Campaigns & automations",
    href: "/crm/marketing",
    icon: <Megaphone className="h-7 w-7 text-white" />,
    gradient: "bg-gradient-to-br from-amber-500 to-orange-600",
    roles: ["owner", "admin", "supervisor", "sales"],
  },
];

export default function LandingSelect() {
  const [, navigate] = useLocation();

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
    if (ready && !isAuthenticated) navigate("/crm/login");
  }, [ready, isAuthenticated, navigate]);

  if (!ready || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
        <Loader2 className="h-7 w-7 animate-spin text-[#711419]" />
      </div>
    );
  }

  const role = crmUser?.role || "tech";
  const visibleApps = APPS.filter((a) => !a.roles || a.roles.includes(role));
  const firstName = firstNameOf(crmUser?.name);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f5f7]">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-14">
        {/* Header */}
        <div className="mb-10 text-center">
          <img src={redlogo} alt="Giesbrecht HVAC" className="mx-auto mb-6 h-12" />
          <h1
            className="text-[28px] font-semibold tracking-tight text-slate-900"
            data-testid="text-welcome"
          >
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-[15px] text-slate-500">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* App grid — iOS home-screen feel */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="app-grid">
          {visibleApps.map((app, i) => (
            <button
              key={app.key}
              onClick={() => navigate(app.href)}
              className="group flex flex-col items-center rounded-2xl border border-black/[0.06] bg-white px-4 py-6 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] active:scale-[0.97] animate-in fade-in slide-in-from-bottom-2"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards", animationDuration: "400ms" }}
              data-testid={`app-${app.key}`}
            >
              <span
                className={`mb-3 flex h-[60px] w-[60px] items-center justify-center rounded-[18px] shadow-inner ${app.gradient}`}
              >
                {app.icon}
              </span>
              <span className="text-[15px] font-semibold text-slate-900">{app.label}</span>
              <span className="mt-0.5 text-[12px] leading-snug text-slate-500">{app.description}</span>
            </button>
          ))}
        </div>

        {/* Footer utilities */}
        <div className="mt-10 text-center">
          <button
            onClick={() => navigate("/tools")}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-700"
            data-testid="link-ghvac-tools"
          >
            <Wrench className="h-3.5 w-3.5" />
            GHVAC Tools
          </button>
        </div>
      </div>
    </div>
  );
}
