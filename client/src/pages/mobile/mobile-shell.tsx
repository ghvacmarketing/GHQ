import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList, Wrench, Clock, ShieldX, Plus,
  FileText, Receipt, Camera, LayoutGrid, Briefcase, Sparkles, CheckSquare, UserRoundPlus,
} from "lucide-react";
import type { ReactNode } from "react";
import type { CrmUser } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";

// The AI assistant popup — loaded on first open, then kept mounted so the
// conversation survives closing and reopening the sheet.
const AssistantOverlay = lazy(() => import("@/components/mobile/assistant-overlay"));

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
  const [createOpen, setCreateOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantLoaded, setAssistantLoaded] = useState(false);
  const go = (path: string) => { setCreateOpen(false); navigate(path); };
  const openAssistant = () => {
    setCreateOpen(false);
    setAssistantLoaded(true);
    setAssistantOpen(true);
  };

  // The More page (and anything else) can summon Gibbs without prop-drilling
  useEffect(() => {
    const onOpen = () => openAssistant();
    window.addEventListener("ghq-mobile-open-assistant", onOpen);
    return () => window.removeEventListener("ghq-mobile-open-assistant", onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
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
      {/* Content scrolls underneath the bottom tab bar. Pages with a custom
          nav fill the shell with their own scroll layers and handle their own
          bottom clearance — reserving padding here would end their container
          in a visible band above the tabs. */}
      <main
        className="flex-1 overflow-auto"
        style={customNav ? undefined : { paddingBottom: "calc(84px + env(safe-area-inset-bottom))" }}
        data-testid="mobile-main"
      >
        {children}
      </main>

      {/* Flat full-width bottom tab bar (icon + label; active = maroon) */}
      {/* touch-action none: an upward swipe on the nav must not rubber-band
          the page and flash white below it */}
      <div className="absolute inset-x-0 bottom-0 z-40" style={{ touchAction: "none" }} data-testid="mobile-nav">
        <nav
          className="rounded-t-2xl border-t-2 border-slate-300/80 bg-[#e9ebee]/95 shadow-[0_-6px_24px_rgba(0,0,0,0.07)] backdrop-blur-xl"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-stretch justify-around px-2 pb-2 pt-2.5">
            {customNav ? customNav.tabs.map((tab) => {
              const active = customNav.activeId === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => customNav.onSelect(tab.id)}
                  data-testid={`nav-tab-${tab.id}`}
                  className="flex flex-1 flex-col items-center gap-1 py-0.5 transition-transform active:scale-95"
                >
                  <Icon className={`h-6 w-6 ${active ? "stroke-[2] text-[#711419]" : "text-slate-500"}`} strokeWidth={active ? 2 : 1.75} />
                  <span className={`text-[11px] leading-none ${active ? "font-semibold text-[#711419]" : "font-medium text-slate-500"}`}>
                    {tab.label}
                  </span>
                </button>
              );
            }) : (
              <>
                {navTabs.map((tab) => {
                  const active = isActive(tab.path);
                  const Icon = tab.icon;
                  return (
                    <Link
                      key={tab.path}
                      href={tab.path}
                      data-testid={`nav-tab-${tab.label.toLowerCase()}`}
                      className="flex flex-1 flex-col items-center gap-1 py-0.5 transition-transform active:scale-95"
                    >
                      <Icon className={`h-6 w-6 ${active ? "text-[#711419]" : "text-slate-500"}`} strokeWidth={active ? 2 : 1.75} />
                      <span className={`text-[11px] leading-none ${active ? "font-semibold text-[#711419]" : "font-medium text-slate-500"}`}>
                        {tab.label}
                      </span>
                    </Link>
                  );
                })}
                <Link
                  href="/mobile/more"
                  className="flex flex-1 flex-col items-center gap-1 py-0.5 transition-transform active:scale-95"
                  data-testid="nav-tab-more"
                  aria-label="More"
                >
                  <LayoutGrid
                    className={`h-6 w-6 ${location.startsWith("/mobile/more") ? "text-[#711419]" : "text-slate-500"}`}
                    strokeWidth={location.startsWith("/mobile/more") ? 2 : 1.75}
                  />
                  <span className={`text-[11px] leading-none ${location.startsWith("/mobile/more") ? "font-semibold text-[#711419]" : "font-medium text-slate-500"}`}>
                    More
                  </span>
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>

      {/* Floating "+" — the main go-to action button, riding above the nav on
          the right. Opens the create sheet (actions only; browsing lives on
          the More page). */}
      {!customNav && (
        <button
          onClick={() => setCreateOpen(true)}
          className="absolute right-4 z-40 flex items-center justify-center rounded-full bg-[#711419] text-white shadow-[0_6px_20px_rgba(113,20,25,0.4)] transition-transform active:scale-90"
          style={{ bottom: "calc(76px + env(safe-area-inset-bottom))", height: 60, width: 60 }}
          data-testid="fab-create"
          aria-label="Create"
        >
          {/* Quarter-turn while the sheet is open, easing back on close */}
          <Plus
            className={`h-7 w-7 transition-transform duration-300 ease-out ${createOpen ? "rotate-45" : "rotate-0"}`}
            strokeWidth={2.25}
          />
        </button>
      )}

      {/* "+" sheet — Create things, with quick access split out below */}
      <DraggableSheet open={createOpen} onOpenChange={setCreateOpen} title="Create" testid="sheet-create">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Create</p>
          <div className="grid grid-cols-4 gap-3">
            <SheetTile icon={CheckSquare} label="New Task" onClick={() => go("/mobile/tasks?new=1")} testid="create-new-task" />
            <SheetTile icon={Camera} label="Add Photo" onClick={() => go("/mobile/photos")} testid="create-add-photo" />
            {isSupervisor && (
              <>
                <SheetTile icon={UserRoundPlus} label="New Customer" onClick={() => go("/mobile/customers?new=1")} testid="create-new-customer" />
                <SheetTile icon={Briefcase} label="New Job" onClick={() => go("/mobile/job?new=1")} testid="create-new-job" />
                <SheetTile icon={FileText} label="New Quote" onClick={() => go("/mobile/quotes/new")} testid="create-new-quote" />
                <SheetTile icon={Receipt} label="New Invoice" onClick={() => go("/mobile/invoices/new")} testid="create-new-invoice" />
              </>
            )}
          </div>

          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Quick access</p>
          <div className="grid grid-cols-4 gap-3">
            <SheetTile icon={Sparkles} label="Ask Gibbs" onClick={openAssistant} testid="create-ask-gibbs" />
          </div>
      </DraggableSheet>

      {/* AI assistant popup — slides up over the current screen */}
      {assistantLoaded && (
        <Suspense fallback={null}>
          <AssistantOverlay open={assistantOpen} onClose={() => setAssistantOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}

function SheetTile({
  icon: Icon, label, onClick, testid,
}: { icon: typeof Camera; label: string; onClick: () => void; testid: string }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-lg bg-slate-100 px-1 py-3 transition-all active:scale-95 active:bg-slate-200"
      data-testid={testid}
    >
      <Icon className="h-6 w-6 text-[#711419]" />
      <span className="text-[11px] font-medium text-slate-700">{label}</span>
    </button>
  );
}
