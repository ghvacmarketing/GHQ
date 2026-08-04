import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList, Wrench, Clock, ShieldX, Plus,
  FileText, Receipt, Camera, LayoutGrid, Briefcase, Sparkles, CheckSquare, UserRoundPlus,
  Loader2, Search,
} from "lucide-react";
import type { ReactNode } from "react";
import type { CrmUser } from "@shared/schema";
import badgeGibbs from "@/assets/badge-gibbs.png";
import plateQuote from "@/assets/plate-quote.png";
import plateInvoice from "@/assets/plate-invoice.png";
import createTask from "@/assets/create-task.png";
import createPhoto from "@/assets/create-photo.png";
import createCustomer from "@/assets/create-customer.png";
import createJob from "@/assets/create-job.png";

// Warm the create-sheet badges the moment the shell module loads — without
// this, the sheet's first open can flash empty tiles while the PNGs fetch.
if (typeof Image !== "undefined") {
  for (const src of [createTask, createPhoto, createCustomer, createJob, plateQuote, plateInvoice, badgeGibbs]) {
    const img = new Image();
    img.src = src;
  }
}
import { Button } from "@/components/ui/button";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { useNativePush } from "@/lib/native";
import { skipEntranceOnce } from "@/lib/page-transitions";
import { queryClient } from "@/lib/queryClient";

// The AI assistant popup — loaded on first open, then kept mounted so the
// conversation survives closing and reopening the sheet.
const AssistantOverlay = lazy(() => import("@/components/mobile/assistant-overlay"));

interface MobileShellProps {
  children: ReactNode;
  /** iOS-style pull-to-refresh on the main scroller — refetches every
   *  active query. Reserved for the five main tabs (Agenda, Jobs, Media,
   *  Time, More). */
  pullToRefresh?: boolean;
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
  { path: "/mobile/photos", label: "Media", icon: Camera },
  { path: "/mobile/time", label: "Time", icon: Clock },
];

const SUPERVISOR_ROLES = ["supervisor", "owner"];

// Roles that can access mobile app: owner, supervisor, sales, tech
// Admin role is desktop-only
const MOBILE_ALLOWED_ROLES = ["owner", "supervisor", "sales", "tech"];

export default function MobileShell({ children, customNav, pullToRefresh = false }: MobileShellProps) {
  const [location, navigate] = useLocation();
  // Arriving from a tracked back-swipe: the destination was already fully
  // visible as the swipe underlay, so the mount fade must not blink it.
  const [skipEntrance] = useState(skipEntranceOnce);
  const [createOpen, setCreateOpen] = useState(false);
  const [photoTargetOpen, setPhotoTargetOpen] = useState(false);
  // The tab bar ducks while the keyboard is up — otherwise iOS shoves it
  // above the keyboard, right over whatever you are typing into.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    let blurT: ReturnType<typeof setTimeout> | undefined;
    const isTypable = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    const onFocusIn = (e: FocusEvent) => {
      if (isTypable(e.target)) { clearTimeout(blurT); setKeyboardUp(true); }
    };
    const onFocusOut = (e: FocusEvent) => {
      if (isTypable(e.target)) { blurT = setTimeout(() => setKeyboardUp(false), 120); }
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    // Safety net: if the focused element unmounts (overlay closed), focusout
    // never fires in WebKit — poll while hidden and restore the nav.
    const guard = setInterval(() => {
      setKeyboardUp((up) => (up && !isTypable(document.activeElement) ? false : up));
    }, 600);
    return () => {
      clearTimeout(blurT);
      clearInterval(guard);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);
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

  // ── Pull-to-refresh (the five main tabs) — iOS feel: drag down from the
  // top of the scroller, content follows with damping, a spinner chip rides
  // in; release past the threshold to refetch every active query. ──
  const ptrMainRef = useRef<HTMLElement | null>(null);
  const ptrWrapRef = useRef<HTMLDivElement | null>(null);
  const ptrSpinRef = useRef<HTMLDivElement | null>(null);
  const ptrRefreshingRef = useRef(false);
  const [ptrRefreshing, setPtrRefreshing] = useState(false);
  useEffect(() => {
    if (!pullToRefresh) return;
    const main = ptrMainRef.current;
    if (!main) return;
    let startY = 0;
    let tracking = false;
    let dist = 0;
    const wrapEl = () => ptrWrapRef.current;
    const spinEl = () => ptrSpinRef.current;
    const onStart = (e: TouchEvent) => {
      tracking = main.scrollTop <= 0 && !ptrRefreshingRef.current;
      if (tracking) startY = e.touches[0].clientY;
      dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking || ptrRefreshingRef.current) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || main.scrollTop > 0) {
        if (dist > 0) {
          const w = wrapEl();
          if (w) {
            w.style.transition = "";
            w.style.transform = "";
          }
          const s = spinEl();
          if (s) s.style.opacity = "0";
          dist = 0;
        }
        return;
      }
      // Ours now — stop the native rubber-band/scroll for this gesture
      e.preventDefault();
      dist = Math.min(120, dy * 0.45);
      const w = wrapEl();
      if (w) {
        w.style.transition = "none";
        w.style.transform = `translateY(${dist}px)`;
      }
      const s = spinEl();
      if (s) {
        s.style.transition = "none";
        s.style.opacity = String(Math.min(1, dist / 55));
        s.style.transform = `translateY(${Math.max(0, dist - 40)}px) rotate(${dist * 3}deg)`;
      }
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      const w = wrapEl();
      const s = spinEl();
      const commit = dist >= 58;
      dist = 0;
      if (!commit) {
        if (w) {
          w.style.transition = "transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1)";
          w.style.transform = "";
          window.setTimeout(() => {
            if (w) w.style.transition = "";
          }, 260);
        }
        if (s) {
          s.style.transition = "opacity 0.15s ease-out";
          s.style.opacity = "0";
        }
        return;
      }
      ptrRefreshingRef.current = true;
      setPtrRefreshing(true);
      try {
        navigator.vibrate?.(8);
      } catch {
        /* no haptics */
      }
      if (w) {
        w.style.transition = "transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)";
        w.style.transform = "translateY(48px)";
      }
      if (s) {
        s.style.transition = "transform 0.25s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s";
        s.style.opacity = "1";
        s.style.transform = "translateY(8px)";
      }
      queryClient
        .refetchQueries({ type: "active" })
        .catch(() => {})
        .finally(() => {
          ptrRefreshingRef.current = false;
          setPtrRefreshing(false);
          if (w) {
            w.style.transition = "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)";
            w.style.transform = "";
            window.setTimeout(() => {
              if (w) w.style.transition = "";
            }, 300);
          }
          if (s) {
            s.style.transition = "transform 0.22s ease-in, opacity 0.18s";
            s.style.opacity = "0";
            s.style.transform = "translateY(-40px)";
          }
        });
    };
    main.addEventListener("touchstart", onStart, { passive: true });
    main.addEventListener("touchmove", onMove, { passive: false });
    main.addEventListener("touchend", onEnd);
    main.addEventListener("touchcancel", onEnd);
    return () => {
      main.removeEventListener("touchstart", onStart);
      main.removeEventListener("touchmove", onMove);
      main.removeEventListener("touchend", onEnd);
      main.removeEventListener("touchcancel", onEnd);
    };
  }, [pullToRefresh]);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
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

  // No session → straight to sign-in. Without this, every /mobile page
  // rendered a dead logged-out shell: queries 401'd and screens sat empty.
  useEffect(() => {
    if (!authLoading && currentUser === null) {
      window.location.replace("/crm/login");
    }
  }, [authLoading, currentUser]);

  // Check if user can access mobile app
  useNativePush(!!currentUser); // iOS shell: register for push once logged in
  type PhotoTargets = {
    mode: "tech" | "supervisor";
    canPickCustomer: boolean;
    jobs: Array<{ id: string; title: string | null; status: string; scheduledStart: string | null; customerId: string; customerName: string | null; techName: string | null }>;
  };
  const { data: photoTargets, isLoading: photoTargetsLoading } = useQuery<PhotoTargets>({
    queryKey: ["/api/mobile/photo-targets"],
    queryFn: async () => {
      const res = await fetch("/api/mobile/photo-targets", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load photo targets");
      return res.json();
    },
    enabled: photoTargetOpen,
    staleTime: 30 * 1000,
  });

  const canAccessMobile = currentUser && MOBILE_ALLOWED_ROLES.includes(currentUser.role);
  const isSupervisor = !!currentUser && SUPERVISOR_ROLES.includes(currentUser.role);

  // Hold a quiet splash while the session resolves (or while the redirect
  // above is in flight) — never the empty shell.
  if (authLoading || !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50" data-testid="mobile-auth-splash">
        <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
      </div>
    );
  }

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
      {/* Pull-to-refresh spinner chip — floats over the top of the scroller */}
      {pullToRefresh && (
        <div
          ref={ptrSpinRef}
          className="pointer-events-none absolute left-1/2 z-30 -ml-4 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md"
          style={{ top: "calc(env(safe-area-inset-top) + 10px)", opacity: 0 }}
          aria-hidden
        >
          <Loader2 className={`h-4 w-4 text-[#711419] ${ptrRefreshing ? "animate-spin" : ""}`} />
        </div>
      )}
      <main
        ref={(el) => {
          ptrMainRef.current = el;
        }}
        className={`flex-1 overflow-auto ${skipEntrance ? "" : "animate-in fade-in duration-200"}`}
        style={customNav ? undefined : { paddingBottom: "calc(84px + env(safe-area-inset-bottom))" }}
        data-testid="mobile-main"
      >
        {/* 1px over-height keeps every page scrollable, so short pages
            (More, Time) rubber-band like the long ones instead of feeling
            pinned. Custom-nav pages own their scroll layers — leave alone. */}
        {customNav ? children : <div ref={ptrWrapRef} className="min-h-[calc(100%+1px)]">{children}</div>}
      </main>

      {/* Flat full-width bottom tab bar (icon + label; active = maroon) */}
      {/* touch-action none: an upward swipe on the nav must not rubber-band
          the page and flash white below it */}
      <div className={`absolute inset-x-0 bottom-0 z-40 transition-all duration-150 ${keyboardUp ? "pointer-events-none translate-y-full opacity-0" : ""}`} style={{ touchAction: "none" }} data-testid="mobile-nav">
        <nav
          className="rounded-t-3xl border-t-2 border-slate-300/80 bg-[#e9ebee]/95 shadow-[0_-6px_24px_rgba(0,0,0,0.07)] backdrop-blur-xl"
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
          style={{ bottom: "calc(76px + env(safe-area-inset-bottom))", height: 60, width: 60, ...(keyboardUp ? { opacity: 0, pointerEvents: "none" as const, transform: "translateY(20px)" } : {}) }}
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
          {/* Explicit X alongside drag-down-anywhere and overlay tap — three
              ways out. (This sheet has no scroller, so a press-and-drag
              anywhere is unambiguously a dismiss, never a scroll.) */}
          <button
            onClick={() => setCreateOpen(false)}
            className="absolute right-4 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-transform active:scale-90"
            aria-label="Close"
            data-testid="create-sheet-close"
          >
            <Plus className="h-5 w-5 rotate-45" />
          </button>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Create</p>
          <div className="grid grid-cols-4 gap-3">
            <SheetTile icon={CheckSquare} img={createTask} label="New Task" onClick={() => go("/mobile/tasks/new")} testid="create-new-task" />
            <SheetTile icon={Camera} img={createPhoto} label="Add Media" onClick={() => { setCreateOpen(false); setPhotoTargetOpen(true); }} testid="create-add-photo" />
            {isSupervisor && (
              <>
                <SheetTile icon={UserRoundPlus} img={createCustomer} label="New Customer" onClick={() => go("/mobile/customers/new")} testid="create-new-customer" />
                <SheetTile icon={Briefcase} img={createJob} label="New Job" onClick={() => go("/mobile/job/new")} testid="create-new-job" />
                <SheetTile icon={FileText} img={plateQuote} label="New Quote" onClick={() => go("/mobile/quotes/new")} testid="create-new-quote" />
                <SheetTile icon={Receipt} img={plateInvoice} label="New Invoice" onClick={() => go("/mobile/invoices/new")} testid="create-new-invoice" />
              </>
            )}
          </div>

          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Quick access</p>
          <div className="grid grid-cols-4 gap-3">
            <SheetTile icon={Sparkles} img={badgeGibbs} label="Ask Gibbs" onClick={openAssistant} testid="create-ask-gibbs" />
          </div>
      </DraggableSheet>

      {/* Add Photo — pick the target first: a job today (role-aware) or a
          customer. Techs must be ON SITE at their job to add photos. */}
      <DraggableSheet open={photoTargetOpen} onOpenChange={setPhotoTargetOpen} title="Add media to…" testid="sheet-photo-target">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Add media to…</p>
        {photoTargetsLoading || !photoTargets ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3 pb-2">
            {photoTargets.jobs.length > 0 ? (
              <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
                <p className="border-b border-slate-200/80 bg-slate-50 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {photoTargets.mode === "tech" ? "You're on site at" : "Jobs today"}
                </p>
                {photoTargets.jobs.map((j, i) => (
                  <button
                    key={j.id}
                    onClick={() => {
                      setPhotoTargetOpen(false);
                      go(`/mobile/photos?cid=${j.customerId}&cname=${encodeURIComponent(j.customerName || "Customer")}`);
                    }}
                    className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                    data-testid={`photo-target-job-${j.id}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{j.customerName || "Customer"}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {[j.title, j.scheduledStart ? new Date(j.scheduledStart).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null, photoTargets.mode === "supervisor" ? j.techName : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <Camera className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            ) : photoTargets.mode === "tech" ? (
              <div className="rounded-[4px] border border-amber-300 bg-amber-50 px-4 py-4 text-center" data-testid="photo-target-blocked">
                <p className="text-sm font-semibold text-amber-900">You're not on site at a job</p>
                <p className="mt-1 text-xs text-amber-800">
                  Photos and videos attach to the job you're working. Open your job and tap On Site first — then come back here.
                </p>
              </div>
            ) : (
              <p className="rounded-[4px] border border-dashed border-slate-300 bg-white px-4 py-4 text-center text-sm text-slate-400">
                No jobs scheduled today.
              </p>
            )}
            {photoTargets.canPickCustomer && (
              <button
                onClick={() => {
                  setPhotoTargetOpen(false);
                  go("/mobile/photos?pick=1");
                }}
                className="flex w-full items-center justify-center gap-2 rounded-[4px] border border-slate-300/70 bg-white px-4 py-3 text-sm font-semibold text-slate-700 active:bg-slate-50"
                data-testid="photo-target-customer-search"
              >
                <Search className="h-4 w-4" />
                Search customers instead
              </button>
            )}
          </div>
        )}
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
  icon: Icon, img, label, onClick, testid,
}: { icon: typeof Camera; img?: string; label: string; onClick: () => void; testid: string }) {
  // The metal badge fades in over a shimmer instead of popping when its
  // asset arrives (first open before the image is cached).
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (imgRef.current?.complete) setImgLoaded(true);
  }, []);
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-lg bg-slate-100 px-1 py-3 transition-all active:scale-95 active:bg-slate-200"
      data-testid={testid}
    >
      {img ? (
        <span className="relative h-8 w-8">
          {!imgLoaded && <span className="skeleton-shimmer absolute inset-0 rounded-md bg-slate-200" aria-hidden />}
          <img
            ref={imgRef}
            src={img}
            alt=""
            onLoad={() => setImgLoaded(true)}
            className={`h-8 w-8 select-none transition-opacity duration-200 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            draggable={false}
          />
        </span>
      ) : (
        <Icon className="h-6 w-6 text-[#711419]" />
      )}
      <span className="text-[11px] font-medium text-slate-700">{label}</span>
    </button>
  );
}
