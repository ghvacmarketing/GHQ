import { useEffect } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield,
  Users,
  ClipboardList,
  Tags,
  Clock,
  CreditCard,
  Wrench,
  BookOpen,
  Upload,
  Truck,
  Package,
  Boxes,
  Target,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser } from "@shared/schema";

interface SettingsItem {
  name: string;
  href: string;
  icon: typeof Users;
}

interface SettingsSection {
  title: string;
  items: SettingsItem[];
}

const sections: SettingsSection[] = [
  {
    title: "Team",
    items: [
      { name: "Users & Roles", href: "/crm/settings/users", icon: Users },
      { name: "Time Logs", href: "/crm/settings/time-logs", icon: Clock },
    ],
  },
  {
    title: "Sales & Operations",
    items: [
      { name: "Lead Types", href: "/crm/settings/lead-types", icon: Target },
      { name: "Lead Classification", href: "/crm/settings/lead-classification", icon: Tags },
      { name: "Work Order Subtypes", href: "/crm/settings/subtypes", icon: Tags },
      { name: "Service Checklists", href: "/crm/checklists", icon: ClipboardList },
      { name: "Package Pricing", href: "/crm/settings/packages", icon: Package },
    ],
  },
  {
    title: "Financial",
    items: [
      { name: "Payment Settings", href: "/crm/settings/payments", icon: CreditCard },
      { name: "Materials Catalog", href: "/crm/settings/materials-catalog", icon: Boxes },
      { name: "QuickBooks Integration", href: "/crm/settings/quickbooks", icon: BookOpen },
    ],
  },
  {
    title: "Data & System",
    items: [
      { name: "Import Data", href: "/crm/settings/import", icon: Upload },
      { name: "Fleet Tracking", href: "/crm/settings/fleet", icon: Truck },
      { name: "Salesbook Directory", href: "/crm/settings/salesbook", icon: BookOpen },
      { name: "System Tools", href: "/crm/settings/system-tools", icon: Wrench },
    ],
  },
];

export default function CrmSettings() {
  usePageTitle("Settings");
  const [, navigate] = useLocation();

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white p-8">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-7 w-32 mb-1" />
          <Skeleton className="h-1 w-10 mb-8" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-5 w-28" />
                {[...Array(3)].map((_, j) => (
                  <Skeleton key={j} className="h-7 w-full" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) return null;

  const isAdmin =
    currentUser.role === "owner" ||
    currentUser.role === "admin" ||
    currentUser.role === "supervisor";
  const canViewSettings = isAdmin || currentUser.role === "sales";

  if (!canViewSettings) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="min-h-screen bg-white p-8 flex items-center justify-center">
          <div className="text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-500">Settings are only available to managers.</p>
          </div>
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="min-h-screen bg-white px-8 py-10">
        <div className="max-w-6xl mx-auto">

          {/* Title */}
          <div className="mb-8">
            <h1 className="text-xl font-bold tracking-widest text-slate-900 uppercase">Settings</h1>
            <div className="mt-1 h-[3px] w-10 bg-[#c0172c] rounded-full" />
          </div>

          {/* Column grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4">
            {sections.map((section) => (
              <div key={section.title}>
                <div className="mb-4 text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">
                  {section.title}
                </div>
                <ul className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          data-testid={`settings-link-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <span className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-[#c0172c] cursor-pointer">
                            <Icon className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-[#c0172c] transition-colors" />
                            {item.name}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

        </div>
      </div>
    </CrmLayout>
  );
}
