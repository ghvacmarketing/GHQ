import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Wrench, Clock, User, Monitor } from "lucide-react";
import type { ReactNode } from "react";
import type { CrmUser } from "@shared/schema";

interface MobileShellProps {
  children: ReactNode;
}

const navTabs = [
  { path: "/mobile", label: "Agenda", icon: ClipboardList },
  { path: "/mobile/job", label: "Job", icon: Wrench },
  { path: "/mobile/time", label: "Time", icon: Clock },
  { path: "/mobile/profile", label: "Profile", icon: User },
];

export default function MobileShell({ children }: MobileShellProps) {
  const [location] = useLocation();

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const showDesktopLink = currentUser && currentUser.role !== "tech";

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
      className="flex flex-col h-screen bg-slate-50"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      data-testid="mobile-shell"
    >
      <header 
        className="flex-shrink-0 bg-[#711419] text-white px-4 py-3 shadow-md"
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
          <h1 className="text-lg font-semibold">GHVAC Tech</h1>
          <div className="w-20"></div>
        </div>
      </header>

      <main className="flex-1 overflow-auto" data-testid="mobile-main">
        {children}
      </main>

      <nav 
        className="flex-shrink-0 bg-white border-t border-slate-200 shadow-lg"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        data-testid="mobile-nav"
      >
        <div className="flex justify-around items-center">
          {navTabs.map((tab) => {
            const active = isActive(tab.path);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.path}
                href={tab.path}
                data-testid={`nav-tab-${tab.label.toLowerCase()}`}
                className={`flex flex-col items-center justify-center py-2 px-4 min-w-[64px] min-h-[56px] ${
                  active ? "text-[#711419]" : "text-slate-500"
                }`}
              >
                <Icon 
                  className={`h-6 w-6 mb-1 ${active ? "text-[#711419]" : "text-slate-400"}`} 
                />
                <span className={`text-xs font-medium ${active ? "text-[#711419]" : "text-slate-500"}`}>
                  {tab.label}
                </span>
                {active && (
                  <div className="absolute bottom-0 h-0.5 w-8 bg-[#711419] rounded-t-full" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
