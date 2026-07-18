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
  FileText,
  ChevronRight,
  CalendarClock,
  Palette,
  Globe,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { PageHeader, SectionCard } from "@/components/crm/ui-kit";
import type { CrmUser } from "@shared/schema";

interface SettingsItem {
  name: string;
  href: string;
  icon: typeof Users;
  ownerOnly?: boolean;
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
      { name: "Time Logs", href: "/crm/settings/time-logs", icon: Clock, ownerOnly: true },
    ],
  },
  {
    title: "Sales & Operations",
    items: [
      { name: "Dispatch Board", href: "/crm/settings/dispatch", icon: CalendarClock },
      { name: "Lead Types", href: "/crm/settings/lead-types", icon: Target },
      { name: "Lead Classification", href: "/crm/settings/lead-classification", icon: Tags },
      { name: "Work Order Subtypes", href: "/crm/settings/subtypes", icon: Tags },
      { name: "Service Checklists", href: "/crm/checklists", icon: ClipboardList },
      { name: "Package Pricing", href: "/crm/settings/packages", icon: Package },
      { name: "Proposal Templates", href: "/crm/settings/proposal-templates", icon: FileText },
      { name: "Customer Portal", href: "/crm/settings/customer-portal", icon: Globe },
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
      { name: "Appearance", href: "/crm/settings/appearance", icon: Palette },
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
      <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
        <Skeleton className="h-7 w-40" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
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
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Shield className="h-6 w-6" />
            </span>
            <p className="text-sm text-muted-foreground">Settings are only available to managers.</p>
          </div>
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="w-full space-y-6">
        <PageHeader
          title="Settings"
          description="Manage your team, operations, billing, and system configuration."
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {sections.map((section) => (
            <SectionCard key={section.title} title={section.title} noBodyPadding>
              <ul className="divide-y divide-border">
                {section.items
                  .filter((item) => !item.ownerOnly || currentUser.role === "owner")
                  .map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          data-testid={`settings-link-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <span className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </SectionCard>
          ))}
        </div>
      </div>
    </CrmLayout>
  );
}
