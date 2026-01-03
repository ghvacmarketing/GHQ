import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser } from "@shared/schema";

interface SettingsLink {
  label: string;
  href: string;
  badge?: string;
}

interface SettingsCategory {
  title: string;
  links: SettingsLink[];
}

const settingsCategories: SettingsCategory[] = [
  {
    title: "Work Orders",
    links: [
      { label: "Dispatch Board", href: "/crm/dispatch" },
      { label: "Service Checklists", href: "/crm/checklists" },
    ],
  },
  {
    title: "Items",
    links: [
      { label: "Item Catalog", href: "/crm/items" },
    ],
  },
  {
    title: "People",
    links: [
      { label: "Users & Permissions", href: "/crm/settings/users" },
    ],
  },
  {
    title: "Customers",
    links: [
      { label: "Maintenance Agreements", href: "/crm/agreements" },
    ],
  },
  {
    title: "Reports",
    links: [
      { label: "Business Dashboard", href: "/crm/dashboard" },
      { label: "Goals Tracker", href: "/crm/reports" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Phone Book", href: "/crm/phone" },
    ],
  },
];

export default function CrmSettings() {
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
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-30" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const isAdmin = currentUser.role === "owner" || currentUser.role === "admin";
  const canViewSettings = isAdmin || currentUser.role === "sales";

  if (!canViewSettings) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="p-6 max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-slate-900 mb-6">Settings</h1>
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              <Shield className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>Settings are only available to managers.</p>
            </CardContent>
          </Card>
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-8">Settings</h1>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-8 gap-y-10">
          {settingsCategories.map((category) => (
            <div key={category.title} data-testid={`settings-category-${category.title.toLowerCase().replace(/\s+/g, '-')}`}>
              <h3 className="text-sm font-semibold text-[#711419] mb-3 uppercase tracking-wide">
                {category.title}
              </h3>
              <ul className="space-y-2">
                {category.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-700 hover:text-[#711419] hover:underline transition-colors flex items-center gap-2"
                      data-testid={`settings-link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {link.label}
                      {link.badge && (
                        <span className="text-xs bg-green-500 text-white px-1.5 py-0.5 rounded font-medium">
                          {link.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </CrmLayout>
  );
}
