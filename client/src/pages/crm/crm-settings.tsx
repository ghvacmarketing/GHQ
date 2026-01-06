import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Users, ClipboardList, ChevronRight, Tags, Clock } from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser } from "@shared/schema";

interface SettingsItem {
  title: string;
  description: string;
  href: string;
  icon: typeof Users;
}

const settingsItems: SettingsItem[] = [
  {
    title: "Users & Permissions",
    description: "Manage team members and their access levels",
    href: "/crm/settings/users",
    icon: Users,
  },
  {
    title: "Service Checklists",
    description: "Configure intake questionnaires for service calls",
    href: "/crm/checklists",
    icon: ClipboardList,
  },
  {
    title: "Work Order Subtypes",
    description: "Manage subtypes for each work order visit type",
    href: "/crm/settings/subtypes",
    icon: Tags,
  },
  {
    title: "Time Logs",
    description: "View and manage technician clock in/out records",
    href: "/crm/settings/time-logs",
    icon: Clock,
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
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
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
        <div className="p-6 max-w-4xl mx-auto">
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
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Settings</h1>

        <div className="space-y-4">
          {settingsItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="block"
                data-testid={`settings-link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-slate-100">
                          <Icon className="h-5 w-5 text-slate-600" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{item.title}</CardTitle>
                          <CardDescription>{item.description}</CardDescription>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-400" />
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </CrmLayout>
  );
}
