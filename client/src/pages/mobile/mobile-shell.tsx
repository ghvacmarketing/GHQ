import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Wrench, Clock, ShieldX, MessageSquare, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { CrmUser } from "@shared/schema";
import { Button } from "@/components/ui/button";

interface MobileShellProps {
  children: ReactNode;
}

// Profile lives in the floating avatar (top right), not the nav pill.
const navTabs = [
  { path: "/mobile", label: "Agenda", icon: ClipboardList },
  { path: "/mobile/job", label: "Job", icon: Wrench },
  { path: "/mobile/customers", label: "Customers", icon: Users },
  { path: "/mobile/messages", label: "Messages", icon: MessageSquare },
  { path: "/mobile/time", label: "Time", icon: Clock },
];

// Roles that can access mobile app: owner, supervisor, sales, tech
// Admin role is desktop-only
const MOBILE_ALLOWED_ROLES = ["owner", "supervisor", "sales", "tech"];

export default function MobileShell({ children }: MobileShellProps) {
  const [location] = useLocation();

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000, // Poll so role/permission changes propagate in near real-time
    refetchIntervalInBackground: true,
  });

  // Check if user can access mobile app
  const canAccessMobile = currentUser && MOBILE_ALLOWED_ROLES.includes(currentUser.role);

  // Block admin users from mobile app
  if (currentUser && !canAccessMobile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-4" data-testid="mobile-access-denied">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldX className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Mobile Access Not Available</h1>
          <p className="text-slate-600 mb-6">
            Your role has access to the desktop CRM system only.
          </p>
          <Button 
            onClick={() => window.location.href = "/crm"}
            className="bg-[#711419] hover:bg-[#8a1a1f] text-white"
            data-testid="button-go-to-desktop"
          >
            Go to Desktop CRM
          </Button>
        </div>
      </div>
    );
  }

  const isActive = (path: string) => {
    if (path === "/mobile") {
      return location === "/mobile" || location === "/mobile/";
    }
    if (path === "/mobile/job") {
      return location.startsWith("/mobile/job");
    }
    return location.startsWith(path);
  };

  return (
    <div
      className="relative flex h-screen flex-col bg-slate-50"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      data-testid="mobile-shell"
    >
      {/* Content scrolls underneath the floating nav pill */}
      <main
        className="flex-1 overflow-auto"
        style={{ paddingBottom: "calc(88px + env(safe-area-inset-bottom))" }}
        data-testid="mobile-main"
      >
        {children}
      </main>

      {/* Floating pill nav — detached from the screen edges */}
      <nav
        className="absolute left-1/2 z-40 -translate-x-1/2 rounded-full border border-slate-900/10 bg-white/90 px-1.5 py-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.16)] backdrop-blur-xl"
        style={{ bottom: "calc(12px + env(safe-area-inset-bottom))", maxWidth: "calc(100vw - 16px)" }}
        data-testid="mobile-nav"
      >
        <div className="flex items-center gap-0.5">
          {navTabs.map((tab) => {
            const active = isActive(tab.path);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.path}
                href={tab.path}
                data-testid={`nav-tab-${tab.label.toLowerCase()}`}
                className={`flex min-w-[50px] flex-col items-center justify-center gap-0.5 rounded-full px-2 py-1.5 transition-all duration-200 active:scale-95 ${
                  active ? "bg-[#711419] text-white shadow-md" : "text-slate-500"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "stroke-[2.25]" : "text-slate-400"}`} />
                <span className={`text-[10px] leading-none ${active ? "font-semibold" : "font-medium"}`}>
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
