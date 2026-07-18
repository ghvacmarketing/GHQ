import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Wrench, Clock, User, Monitor, ShieldX, MessageSquare, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { CrmUser } from "@shared/schema";
import { Button } from "@/components/ui/button";

interface MobileShellProps {
  children: ReactNode;
}

const navTabs = [
  { path: "/mobile", label: "Agenda", icon: ClipboardList },
  { path: "/mobile/job", label: "Job", icon: Wrench },
  { path: "/mobile/customers", label: "Customers", icon: Users },
  { path: "/mobile/messages", label: "Messages", icon: MessageSquare },
  { path: "/mobile/time", label: "Time", icon: Clock },
  { path: "/mobile/profile", label: "Profile", icon: User },
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
  const showDesktopLink = currentUser && currentUser.role !== "tech";

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
      <header
        className="flex-shrink-0 bg-gradient-to-b from-[#7d1720] to-[#5e1015] px-4 py-3 text-white shadow-md"
        data-testid="mobile-header"
      >
        <div className="flex items-center justify-between">
          <div className="w-20">
            {showDesktopLink && (
              <Link
                href="/crm"
                className="flex items-center gap-1 text-white/80 hover:text-white text-xs"
                data-testid="link-desktop-crm"
              >
                <Monitor className="h-4 w-4" />
                Desktop
              </Link>
            )}
          </div>
          <h1 className="text-lg font-semibold tracking-tight">GHVAC Tech</h1>
          <div className="w-20"></div>
        </div>
      </header>

      {/* Content scrolls underneath the frosted nav bar */}
      <main
        className="flex-1 overflow-auto"
        style={{ paddingBottom: "calc(64px + env(safe-area-inset-bottom))" }}
        data-testid="mobile-main"
      >
        {children}
      </main>

      <nav
        className="absolute inset-x-0 bottom-0 border-t border-slate-900/10 bg-white/80 shadow-[0_-1px_12px_rgba(0,0,0,0.06)] backdrop-blur-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        data-testid="mobile-nav"
      >
        <div className="flex items-center justify-around">
          {navTabs.map((tab) => {
            const active = isActive(tab.path);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.path}
                href={tab.path}
                data-testid={`nav-tab-${tab.label.toLowerCase()}`}
                className={`flex min-h-[56px] min-w-[56px] flex-col items-center justify-center gap-0.5 px-2 py-1.5 transition-transform active:scale-95 ${
                  active ? "text-[#711419]" : "text-slate-500"
                }`}
              >
                <span
                  className={`flex items-center justify-center rounded-full px-4 py-0.5 transition-colors duration-200 ${
                    active ? "bg-[#711419]/10" : ""
                  }`}
                >
                  <Icon className={`h-[22px] w-[22px] ${active ? "text-[#711419] stroke-[2.25]" : "text-slate-400"}`} />
                </span>
                <span className={`text-[11px] ${active ? "font-semibold text-[#711419]" : "font-medium text-slate-500"}`}>
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
