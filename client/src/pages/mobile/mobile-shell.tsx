import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList, Wrench, Clock, ShieldX, MessageSquare, Users, Plus,
  FileText, Receipt, Camera,
} from "lucide-react";
import type { ReactNode } from "react";
import type { CrmUser } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";

interface MobileShellProps {
  children: ReactNode;
  /** Replace the main nav bubbles with page-specific ones (e.g. a job's
   * Overview/Work/Quote/Invoice). Hides the "+" button while active. */
  customNav?: {
    tabs: { id: string; label: string; icon: typeof Wrench }[];
    activeId: string;
    onSelect: (id: string) => void;
  };
}

// Customers/Messages (and quick actions) live in the "+" sheet;
// Profile lives in the agenda's avatar menu.
const navTabs = [
  { path: "/mobile", label: "Agenda", icon: ClipboardList },
  { path: "/mobile/job", label: "Job", icon: Wrench },
  { path: "/mobile/photos", label: "Photos", icon: Camera },
  { path: "/mobile/time", label: "Time", icon: Clock },
];

const SUPERVISOR_ROLES = ["supervisor", "owner"];

// Roles that can access mobile app: owner, supervisor, sales, tech
// Admin role is desktop-only
const MOBILE_ALLOWED_ROLES = ["owner", "supervisor", "sales", "tech"];

export default function MobileShell({ children, customNav }: MobileShellProps) {
  const [location, navigate] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const go = (path: string) => { setMoreOpen(false); navigate(path); };

  // Suppress the browser/PWA edge-swipe history navigation inside the app.
  // Top-level tabs must not slide back; sub-pages implement their own gesture
  // (their touch listeners still fire — preventDefault only blocks the
  // browser's native swipe-nav). Taps on controls near the edge are exempt.
  useEffect(() => {
    const guard = (e: TouchEvent) => {
      const x = e.touches[0]?.clientX ?? 0;
      const nearEdge = x < 32 || x > window.innerWidth - 32;
      if (!nearEdge) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("button, a, input, textarea, select, [role=button]")) return;
      e.preventDefault();
    };
    document.addEventListener("touchstart", guard, { passive: false });
    return () => document.removeEventListener("touchstart", guard);
  }, []);

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
  const isSupervisor = !!currentUser && SUPERVISOR_ROLES.includes(currentUser.role);

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

      {/* Floating pill nav + detached "+" button */}
      <div
        className="absolute left-1/2 z-40 flex -translate-x-1/2 items-center gap-2"
        style={{ bottom: "calc(4px + env(safe-area-inset-bottom))", maxWidth: "calc(100vw - 12px)" }}
        data-testid="mobile-nav"
      >
        <nav className="rounded-full border border-slate-900/10 bg-white/90 p-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.16)] backdrop-blur-xl">
          <div className="flex items-center gap-0.5">
            {customNav ? customNav.tabs.map((tab) => {
              const active = customNav.activeId === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => customNav.onSelect(tab.id)}
                  data-testid={`nav-tab-${tab.id}`}
                  className={`flex min-w-[58px] flex-col items-center justify-center gap-0.5 rounded-full px-3 py-1.5 transition-all duration-200 active:scale-95 ${
                    active ? "bg-[#711419] text-white shadow-md" : "text-slate-500"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${active ? "stroke-[2.25]" : "text-slate-400"}`} />
                  <span className={`text-[10px] leading-none ${active ? "font-semibold" : "font-medium"}`}>
                    {tab.label}
                  </span>
                </button>
              );
            }) : navTabs.map((tab) => {
              const active = isActive(tab.path);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.path}
                  href={tab.path}
                  data-testid={`nav-tab-${tab.label.toLowerCase()}`}
                  className={`flex min-w-[58px] flex-col items-center justify-center gap-0.5 rounded-full px-3 py-1.5 transition-all duration-200 active:scale-95 ${
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
        {!customNav && <button
          onClick={() => setMoreOpen(true)}
          className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-[#711419] text-white shadow-[0_8px_28px_rgba(113,20,25,0.45)] transition-transform active:scale-95"
          data-testid="nav-tab-more"
          aria-label="More"
        >
          <Plus className="h-6 w-6 stroke-[2.5]" />
        </button>}
      </div>

      {/* "+" sheet — extra destinations and supervisor quick actions */}
      <DraggableSheet open={moreOpen} onOpenChange={setMoreOpen} title="More" testid="sheet-more">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Go to</p>
          <div className="grid grid-cols-4 gap-3">
            <SheetTile icon={Users} label="Customers" onClick={() => go("/mobile/customers")} testid="more-customers" />
            <SheetTile icon={MessageSquare} label="Messages" onClick={() => go("/mobile/messages")} testid="more-messages" />
          </div>

          {isSupervisor && (
            <>
              <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Quick actions</p>
              <div className="grid grid-cols-4 gap-3">
                <SheetTile icon={FileText} label="New Quote" onClick={() => go("/crm/quotes/new")} testid="more-new-quote" />
                <SheetTile icon={Receipt} label="New Invoice" onClick={() => go("/crm/invoices/new")} testid="more-new-invoice" />
                <SheetTile icon={Camera} label="Add Photo" onClick={() => go("/mobile/photos")} testid="more-add-photo" />
              </div>
            </>
          )}
      </DraggableSheet>
    </div>
  );
}

function SheetTile({
  icon: Icon, label, onClick, testid,
}: { icon: typeof Users; label: string; onClick: () => void; testid: string }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-2xl bg-slate-100 px-1 py-3 transition-all active:scale-95 active:bg-slate-200"
      data-testid={testid}
    >
      <Icon className="h-6 w-6 text-[#711419]" />
      <span className="text-[11px] font-medium text-slate-700">{label}</span>
    </button>
  );
}
