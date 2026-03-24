import { useEffect, useRef } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Users, ClipboardList, Tags, Clock, CreditCard, Wrench, BookOpen, Upload, Truck, Package, Boxes, Target } from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser } from "@shared/schema";

interface SettingsItem {
  name: string;
  desc: string;
  badge: string;
  href: string;
  icon: typeof Users;
}

interface SettingsSection {
  id: string;
  title: string;
  description: string;
  items: SettingsItem[];
}

const sections: SettingsSection[] = [
  {
    id: "workspace",
    title: "Workspace & Team",
    description: "Manage people, permissions, and day-to-day operating defaults.",
    items: [
      {
        name: "Users & Roles",
        desc: "Access levels, permissions, technician roles, and office staff setup.",
        badge: "Team",
        href: "/crm/settings/users",
        icon: Users,
      },
      {
        name: "Time Logs",
        desc: "Clock-in rules, edit approvals, overtime visibility, and payroll prep.",
        badge: "Live",
        href: "/crm/settings/time-logs",
        icon: Clock,
      },
    ],
  },
  {
    id: "sales",
    title: "Sales & Operations",
    description: "Control how leads, work orders, pricing, and proposals flow through GHQ.",
    items: [
      {
        name: "Lead Types",
        desc: "Configure opportunity types, funnels, and conversion paths.",
        badge: "Sales",
        href: "/crm/settings/lead-types",
        icon: Target,
      },
      {
        name: "Lead Classification",
        desc: "Set hot/warm/cold rules, drivers, and urgency indicators.",
        badge: "Rules",
        href: "/crm/settings/lead-classification",
        icon: Tags,
      },
      {
        name: "Work Order Subtypes",
        desc: "Organize service, maintenance, install, and IAQ visit types.",
        badge: "Ops",
        href: "/crm/settings/subtypes",
        icon: Tags,
      },
      {
        name: "Service Checklists",
        desc: "Build intake forms and technician field checklists.",
        badge: "Mobile",
        href: "/crm/checklists",
        icon: ClipboardList,
      },
      {
        name: "Package Pricing",
        desc: "Tune HVAC and crawlspace package percentages and pricing logic.",
        badge: "Pricing",
        href: "/crm/settings/packages",
        icon: Package,
      },
    ],
  },
  {
    id: "financial",
    title: "Financial Controls",
    description: "Set deposits, materials, integrations, and job costing structure.",
    items: [
      {
        name: "Payment Settings",
        desc: "Default deposit percentages, payment links, financing, and receipts.",
        badge: "Money",
        href: "/crm/settings/payments",
        icon: CreditCard,
      },
      {
        name: "Materials Catalog",
        desc: "Manage inventory items, cost basis, markup rules, and vendor mapping.",
        badge: "Catalog",
        href: "/crm/settings/materials-catalog",
        icon: Boxes,
      },
      {
        name: "QuickBooks Integration",
        desc: "Sync customers, invoices, payments, and chart-of-accounts mapping.",
        badge: "Connected",
        href: "/crm/settings/quickbooks",
        icon: BookOpen,
      },
    ],
  },
  {
    id: "data",
    title: "Data & System",
    description: "Import records, connect tools, and run maintenance actions for admins.",
    items: [
      {
        name: "Import Data",
        desc: "Upload customers, agreements, equipment records, and legacy CRM data.",
        badge: "CSV",
        href: "/crm/settings/import",
        icon: Upload,
      },
      {
        name: "Fleet Tracking",
        desc: "Manage Bouncie vehicles, status visibility, and driver assignment.",
        badge: "GPS",
        href: "/crm/settings/fleet",
        icon: Truck,
      },
      {
        name: "System Tools",
        desc: "Scheduled jobs, maintenance utilities, sync health, and admin controls.",
        badge: "Admin",
        href: "/crm/settings/system-tools",
        icon: Wrench,
      },
    ],
  },
];

const quickActions = [
  { label: "Add user", href: "/crm/settings/users" },
  { label: "Update deposit %", href: "/crm/settings/payments" },
  { label: "Edit package pricing", href: "/crm/settings/packages" },
  { label: "Run sync health check", href: "/crm/settings/system-tools" },
];

const totalModules = sections.reduce((sum, s) => sum + s.items.length, 0);

export default function CrmSettings() {
  usePageTitle("Settings");
  const [, navigate] = useLocation();
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const scrollToSection = (id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f7f7f5] p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-24 w-full rounded-[24px]" />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
            <Skeleton className="h-80 rounded-[24px]" />
            <div className="space-y-6">
              <Skeleton className="h-32 rounded-[24px]" />
              <Skeleton className="h-64 rounded-[28px]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const isAdmin = currentUser.role === "owner" || currentUser.role === "admin" || currentUser.role === "supervisor";
  const canViewSettings = isAdmin || currentUser.role === "sales";

  if (!canViewSettings) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="min-h-screen bg-[#f7f7f5] p-6 flex items-center justify-center">
          <div className="rounded-[24px] border border-slate-200 bg-white p-10 text-center shadow-sm max-w-sm w-full">
            <Shield className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-500">Settings are only available to managers.</p>
          </div>
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="min-h-screen bg-[#f7f7f5] text-slate-900 p-4 md:p-6">
        <div className="mx-auto max-w-7xl space-y-5">

          {/* Header */}
          <div className="flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-white px-5 py-5 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">GHQ Management System</div>
              <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">Settings & Configuration</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Manage access, pricing rules, integrations, and operational controls.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:flex md:flex-wrap">
              {quickActions.map((action) => (
                <Link key={action.label} href={action.href}>
                  <span className="block rounded-2xl border border-slate-200 bg-[#f7f7f5] px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-[#7b0f16]/20 hover:bg-[#fff7f7] hover:text-[#7b0f16] cursor-pointer whitespace-nowrap">
                    {action.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
            {/* Sidebar */}
            <aside className="space-y-4">
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold">Settings Navigation</div>
                <div className="mt-4 space-y-2">
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => scrollToSection(section.id)}
                      className="w-full rounded-2xl border border-transparent bg-[#f7f7f5] px-4 py-3 text-left transition hover:border-[#7b0f16]/20 hover:bg-[#fff7f7]"
                    >
                      <div className="text-sm font-medium text-slate-900">{section.title}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{section.items.length} modules</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">System Status</div>
                    <div className="text-xs text-slate-500 mt-0.5">Quick visibility for admin items</div>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Healthy</span>
                </div>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between rounded-2xl bg-[#f7f7f5] px-4 py-3">
                    <span>QuickBooks Sync</span>
                    <span className="font-medium text-slate-900">Connected</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-[#f7f7f5] px-4 py-3">
                    <span>Fleet API</span>
                    <span className="font-medium text-slate-900">Online</span>
                  </div>
                  <Link href="/crm/settings/system-tools">
                    <div className="flex items-center justify-between rounded-2xl bg-[#f7f7f5] px-4 py-3 cursor-pointer hover:bg-[#fff7f7] transition">
                      <span>System Tools</span>
                      <span className="font-medium text-[#8f171c]">Open →</span>
                    </div>
                  </Link>
                </div>
              </div>
            </aside>

            {/* Main */}
            <main className="space-y-5">
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Configured Modules</div>
                  <div className="mt-2 text-3xl font-semibold">{totalModules}</div>
                  <div className="mt-1 text-sm text-slate-500">Active admin sections available</div>
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Settings Sections</div>
                  <div className="mt-2 text-3xl font-semibold">{sections.length}</div>
                  <div className="mt-1 text-sm text-slate-500">Workspace, sales, financial, and system</div>
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Your Role</div>
                  <div className="mt-2 text-3xl font-semibold capitalize">{currentUser.role}</div>
                  <div className="mt-1 text-sm text-slate-500">Full settings access enabled</div>
                </div>
              </div>

              {/* Section cards */}
              {sections.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  ref={(el) => { sectionRefs.current[section.id] = el; }}
                  className="rounded-[28px] border border-slate-200 bg-white p-5 md:p-6 shadow-sm scroll-mt-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
                      <p className="mt-1 text-sm text-slate-500 max-w-2xl">{section.description}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {section.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        data-testid={`settings-link-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <div className="group rounded-[24px] border border-slate-200 bg-[#fcfcfb] p-5 text-left transition hover:-translate-y-0.5 hover:border-[#7b0f16]/25 hover:bg-white hover:shadow-sm cursor-pointer">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-base font-semibold tracking-tight text-slate-900">{item.name}</div>
                              <p className="mt-2 text-sm leading-6 text-slate-500">{item.desc}</p>
                            </div>
                            <span className="shrink-0 rounded-full bg-[#fff4f4] px-3 py-1 text-xs font-medium text-[#8f171c]">
                              {item.badge}
                            </span>
                          </div>
                          <div className="mt-4 flex items-center justify-between text-sm">
                            <span className="text-slate-400">Open configuration</span>
                            <span className="font-medium text-[#8f171c] group-hover:translate-x-0.5 transition">→</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </main>
          </div>
        </div>
      </div>
    </CrmLayout>
  );
}
