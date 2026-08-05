import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, startOfWeek } from "date-fns";
import {
  Briefcase, ChevronLeft, ChevronRight, Clock, ListTodo, Loader2, LogOut, Mail, Phone, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { clearCrmToken } from "@/lib/crmAuth";
import { markSkipEntrance, usePushEntrance } from "@/lib/page-transitions";
import { useRequireCrmAuth } from "@/hooks/use-require-crm-auth";
import { userAvatarSrc } from "@/components/user-avatar-badge";
import { roleBadgeSrc } from "@/components/mobile/role-badge";
import MobileAgenda from "./mobile-agenda";
import type { CrmUser } from "@shared/schema";

/** Profile — the person, their day, and the doors they use most. A focused
 *  sheet with the SAME chrome as the customer detail page: floating back
 *  arrow outside the sliding panel, iOS tracked back-swipe with the real
 *  home page revealed beneath (parallax + scrim). The hero wears the metal
 *  initials avatar with the role badge tucked on its shoulder — one visual
 *  unit instead of two competing chips. */

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Administrator",
  supervisor: "Supervisor",
  sales: "Sales",
  tech: "Technician",
};

const fmtHours = (mins: number) => {
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return h > 0 ? `${h}h ${r.toString().padStart(2, "0")}m` : `${r}m`;
};

export default function MobileProfile({ onClose }: { onClose?: () => void } = {}) {
  // Overlay mode (agenda avatar): a horizontal sheet sliding OVER the live
  // agenda — no navigation, no page copy beneath, so there is nothing to
  // remount and nothing to flash. Route mode (/mobile/profile) keeps the
  // classic push page for deep links.
  const overlay = !!onClose;
  const [, navigate] = useLocation();
  useRequireCrmAuth();
  const entered = usePushEntrance();

  // ── iOS-style tracked back-swipe with the REAL home page revealed
  // beneath (parallax + scrim), exactly like leaving a customer. The
  // floating back arrow lives OUTSIDE the sliding panel: it holds still
  // while you drag and fades out when the swipe commits. ──
  const pageRef = useRef<HTMLDivElement | null>(null);
  const underlayRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const [showUnderlay, setShowUnderlay] = useState(false);
  const swipeDrag = useRef<{ id: number; x: number; y: number; engaged: boolean; active: boolean } | null>(null);

  // Overlay: the LIVE agenda stays beneath — just fade the scrim in, then
  // settle it as inline state (a lingering fill would mask the back-swipe's
  // per-frame opacity writes). Route mode: the push-entrance rides in OVER a
  // copy of the agenda (parallax + scrim), so the slide never crosses white.
  useEffect(() => {
    if (overlay) {
      const sc = scrimRef.current;
      sc?.animate([{ opacity: "0" }, { opacity: "0.18" }], { duration: 420, easing: "linear", fill: "forwards" });
      const t = setTimeout(() => {
        if (sc) {
          sc.style.opacity = "0.18";
          sc.getAnimations().forEach((a) => a.cancel());
        }
      }, 460);
      return () => clearTimeout(t);
    }
    setShowUnderlay(true);
    let t: ReturnType<typeof setTimeout> | undefined;
    const raf = requestAnimationFrame(() => {
      underlayRef.current?.animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-25%)" }],
        { duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" },
      );
      scrimRef.current?.animate(
        [{ opacity: "0" }, { opacity: "0.18" }],
        { duration: 420, easing: "linear", fill: "forwards" },
      );
      t = setTimeout(() => setShowUnderlay(false), 480);
    });
    return () => { cancelAnimationFrame(raf); if (t) clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = () => (onClose ? onClose() : navigate("/mobile"));
  const goBackAnimated = (fromDx = 0) => {
    if (!overlay) {
      // The home page is already on screen as the underlay — its remount
      // after navigation must not fade in again (the post-swipe "flash").
      markSkipEntrance();
    }
    const el = pageRef.current;
    if (!el) return done();
    const w = el.clientWidth || window.innerWidth;
    const startP = Math.max(0, Math.min(1, fromDx / w));
    const dur = 200 * (1 - startP) + 40;
    if (!overlay) setShowUnderlay(true);
    requestAnimationFrame(() => {
      el.style.animation = "none";
      el.style.borderRadius = "24px 0 0 24px";
      el.style.transition = `transform ${dur}ms ease-in`;
      el.style.transform = "translateX(100%)";
      const btn = backRef.current;
      if (btn) {
        btn.style.transition = `opacity ${Math.max(120, dur - 40)}ms ease-out`;
        btn.style.opacity = "0";
        btn.style.pointerEvents = "none";
      }
      underlayRef.current?.animate(
        [{ transform: `translateX(${-25 * (1 - startP)}%)` }, { transform: "translateX(0)" }],
        { duration: dur, easing: "ease-out", fill: "forwards" },
      );
      scrimRef.current?.animate(
        [{ opacity: String(0.18 * (1 - startP)) }, { opacity: "0" }],
        { duration: dur, easing: "linear", fill: "forwards" },
      );
      setTimeout(done, dur - 10);
    });
  };

  const onSwipeStart = (e: React.PointerEvent) => {
    // A second finger mid-swipe must not hijack or wipe the gesture
    if (swipeDrag.current) return;
    if (e.clientX > 48) return;
    swipeDrag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, engaged: false, active: true };
    // Mount the home page underneath NOW, while the finger is still
    // parked — mounting it mid-drag dropped frames on heavier pages.
    setShowUnderlay(true);
    pageRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onSwipeMove = (e: React.PointerEvent) => {
    const st = swipeDrag.current;
    const el = pageRef.current;
    if (!st?.active || st.id !== e.pointerId || !el) return;
    const dx = e.clientX - st.x;
    const dy = Math.abs(e.clientY - st.y);
    if (!st.engaged) {
      if (dx > 8 && dx > dy) {
        st.engaged = true;
        el.style.transition = "none";
        el.style.animation = "none";
        // iOS-card curve while the page rides the finger
        el.style.borderRadius = "24px 0 0 24px";
      } else if (dy > 14) { st.active = false; setShowUnderlay(false); return; }
    }
    if (st.engaged) {
      const off = Math.max(0, dx);
      el.style.transform = `translateX(${off}px)`;
      const w = el.clientWidth || window.innerWidth;
      const pr = Math.max(0, Math.min(1, off / w));
      if (underlayRef.current) underlayRef.current.style.transform = `translateX(${-25 * (1 - pr)}%)`;
      if (scrimRef.current) scrimRef.current.style.opacity = String(0.18 * (1 - pr));
      // The floating back holds still but fades WITH the drag
      if (backRef.current) {
        backRef.current.style.transition = "none";
        backRef.current.style.opacity = String(1 - pr);
      }
    }
  };
  const onSwipeEnd = (e: React.PointerEvent) => {
    const st = swipeDrag.current;
    if (!st || st.id !== e.pointerId) return; // only the tracked finger ends it
    swipeDrag.current = null;
    const el = pageRef.current;
    if (!st?.engaged || !el) {
      if (st) setShowUnderlay(false);
      return;
    }
    const dx = e.clientX - st.x;
    if (dx > Math.min(140, window.innerWidth * 0.33)) {
      goBackAnimated(Math.max(0, dx));
    } else {
      el.style.transition = "transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1)";
      el.style.transform = "translateX(0)";
      if (backRef.current) {
        backRef.current.style.transition = "opacity 0.25s ease-out";
        backRef.current.style.opacity = "1";
      }
      underlayRef.current?.animate(
        [{ transform: underlayRef.current.style.transform || "translateX(-25%)" }, { transform: "translateX(-25%)" }],
        { duration: 260, easing: "ease-out", fill: "forwards" },
      );
      scrimRef.current?.animate(
        [{ opacity: scrimRef.current.style.opacity || "0.18" }, { opacity: "0.18" }],
        { duration: 260, easing: "linear", fill: "forwards" },
      );
      setTimeout(() => {
        if (el) {
          el.style.transition = "";
          el.style.borderRadius = "";
        }
        if (backRef.current) {
          backRef.current.style.transition = "";
          backRef.current.style.opacity = "";
        }
        if (overlay) {
          // The scrim lives on — settle it inline and drop the filled
          // spring so it can't mask the next drag's opacity writes.
          const sc = scrimRef.current;
          if (sc) {
            sc.style.opacity = "0.18";
            sc.getAnimations().forEach((a) => a.cancel());
          }
        } else {
          setShowUnderlay(false);
        }
      }, 320);
    }
  };

  const { data: currentUser, isLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  // Live clock status — "On the clock since 8:02 AM"
  const { data: clock } = useQuery<{ entry?: { clockInAt: string; category?: string | null } | null }>({
    queryKey: ["/api/mobile/time/current"],
    queryFn: async () => {
      const res = await fetch("/api/mobile/time/current", { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!currentUser,
    refetchInterval: 60 * 1000,
  });

  // Hours this week (their own timesheet)
  const weekFrom = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekTo = format(new Date(), "yyyy-MM-dd");
  const { data: weekEntries = [] } = useQuery<Array<{ durationMinutes?: number | null; clockInAt: string; clockOutAt?: string | null }>>({
    queryKey: ["/api/mobile/time/timesheet", "profile-week", weekFrom, weekTo],
    queryFn: async () => {
      const res = await fetch(`/api/mobile/time/timesheet?from=${weekFrom}&to=${weekTo}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.entries || [];
    },
    enabled: !!currentUser,
  });
  const weekMinutes = weekEntries.reduce((sum, e) => {
    if (e.durationMinutes) return sum + e.durationMinutes;
    if (e.clockOutAt) return sum + Math.max(0, Math.round((new Date(e.clockOutAt).getTime() - new Date(e.clockInAt).getTime()) / 60000));
    return sum + Math.max(0, Math.round((Date.now() - new Date(e.clockInAt).getTime()) / 60000));
  }, 0);

  // Their jobs today
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: todayJobs } = useQuery<{ workOrders?: Array<{ id: string }> }>({
    queryKey: ["/api/crm/work-orders", "profile-today", currentUser?.id, todayStr],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders?techId=${currentUser!.id}&date=${todayStr}&limit=25`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!currentUser?.id,
  });
  const jobsToday = todayJobs?.workOrders?.length ?? 0;

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Release this phone's push token FIRST (needs the live session) — a
      // signed-out phone must not keep buzzing with this user's alerts.
      const { unregisterNativePush } = await import("@/lib/native");
      await unregisterNativePush();
      await apiRequest("POST", "/api/crm/auth/logout");
    },
    onSuccess: () => {
      clearCrmToken();
      queryClient.clear();
      window.location.href = "/crm/login";
    },
  });

  const avatar = userAvatarSrc(currentUser?.name);
  const onClock = !!clock?.entry;

  return (
    <div className={overlay ? "fixed inset-0 z-[60] overflow-hidden" : "relative h-screen overflow-hidden bg-slate-50"}>
      {overlay ? (
        /* The LIVE agenda is right there beneath the transparent root — a
           bare scrim dims it while the sheet rides over. No page copy. */
        <div ref={scrimRef} className="absolute inset-0 z-0 bg-black" style={{ opacity: 0 }} aria-hidden />
      ) : (
        /* Real home page beneath the profile — the whole screen slides
            over it so the back-swipe reveals where you're headed */
        showUnderlay && (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden data-underlay>
            <div ref={underlayRef} className="h-full w-full" style={{ transform: "translateX(-25%)" }}>
              <MobileAgenda />
            </div>
            <div ref={scrimRef} className="absolute inset-0 bg-black" style={{ opacity: 0.18 }} />
          </div>
        )
      )}

      <div
        ref={pageRef}
        className={`${entered ? "page-slide-in" : "translate-x-full"} relative z-10 h-full shadow-[-14px_0_32px_rgba(0,0,0,0.12)]`}
        style={{ touchAction: "pan-y" }}
        onPointerDown={onSwipeStart}
        onPointerMove={onSwipeMove}
        onPointerUp={onSwipeEnd}
        onPointerCancel={onSwipeEnd}
      >
        {/* Edge gutter: touches born here can NEVER be claimed by the
            browser as a scroll (touch-action none), so the back-swipe
            always tracks to completion. */}
        <div className="absolute inset-y-0 left-0 z-20 w-6" style={{ touchAction: "none" }} aria-hidden />
        <div
          className="h-full overflow-y-auto overscroll-y-contain bg-slate-50"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
          }}
        >
          <div className="min-h-[calc(100%+1px)] space-y-4 px-4 pb-6 pt-16" data-testid="mobile-profile">
            {isLoading ? (
              <div className="rounded-[4px] border border-slate-300/70 bg-white pb-6 pt-6">
                <div className="flex flex-col items-center">
                  <div className="mb-4 h-24 w-24 animate-pulse rounded-full bg-slate-200" />
                  <div className="h-5 w-36 animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 h-3.5 w-24 animate-pulse rounded bg-slate-100" />
                </div>
              </div>
            ) : currentUser ? (
              <>
                {/* Hero — the metal avatar with the role badge on its
                    shoulder: both identities, one composition */}
                <div className="rounded-[4px] border border-slate-300/70 bg-white px-4 pb-5 pt-6" data-testid="profile-hero">
                  <div className="flex flex-col items-center text-center">
                    <div className="relative mb-3">
                      {avatar ? (
                        <img src={avatar} alt="" className="h-24 w-24 select-none" draggable={false} />
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#711419] text-3xl font-semibold text-white">
                          {currentUser.name?.charAt(0).toUpperCase() || "U"}
                        </div>
                      )}
                      <img
                        src={roleBadgeSrc(currentUser.role)}
                        alt=""
                        className="absolute -bottom-1 -right-1 h-9 w-9 select-none drop-shadow-sm"
                        draggable={false}
                        data-testid="profile-role-badge"
                      />
                    </div>
                    <h2 className="text-xl font-bold tracking-tight text-slate-900" data-testid="profile-name">
                      {currentUser.name}
                    </h2>
                    <p className="mt-1 text-sm font-medium text-slate-500" data-testid="profile-role">
                      {ROLE_LABELS[currentUser.role] || currentUser.role}
                      {currentUser.createdAt && (
                        <span className="text-slate-400"> · since {format(new Date(currentUser.createdAt), "MMMM yyyy")}</span>
                      )}
                    </p>
                    <p className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${onClock ? "text-green-700" : "text-slate-400"}`} data-testid="profile-clock-status">
                      <span className={`h-2 w-2 rounded-full ${onClock ? "bg-green-500" : "bg-slate-300"}`} />
                      {onClock
                        ? `On the clock since ${format(new Date(clock!.entry!.clockInAt), "h:mm a")}`
                        : "Off the clock"}
                    </p>
                  </div>
                </div>

                {/* Today at a glance */}
                <div className="grid grid-cols-2 gap-2" data-testid="profile-stats">
                  <div className="rounded-[4px] border border-slate-300/70 bg-white px-3 py-2.5">
                    <p className="text-lg font-bold tabular-nums text-slate-900">{jobsToday}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Jobs today</p>
                  </div>
                  <div className="rounded-[4px] border border-slate-300/70 bg-white px-3 py-2.5">
                    <p className="text-lg font-bold tabular-nums text-slate-900">{fmtHours(weekMinutes)}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Hours this week</p>
                  </div>
                </div>

                {/* Contact */}
                <div className="rounded-[4px] border border-slate-300/70 bg-white" data-testid="profile-contact">
                  <div className="border-b border-slate-200 px-3.5 py-2.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contact</h3>
                  </div>
                  <div className="divide-y divide-slate-200 px-3.5">
                    <a
                      href={`mailto:${currentUser.email}`}
                      className="flex min-h-[44px] items-center gap-3 py-2.5 text-sm font-medium text-slate-700"
                      data-testid="profile-email"
                    >
                      <Mail className="h-4 w-4 flex-shrink-0 text-slate-400" />
                      <span className="truncate select-text [-webkit-user-select:text]">{currentUser.email}</span>
                    </a>
                    {currentUser.phone && (
                      <a
                        href={`tel:${currentUser.phone}`}
                        className="flex min-h-[44px] items-center gap-3 py-2.5 text-sm font-medium text-slate-700"
                        data-testid="profile-phone"
                      >
                        <Phone className="h-4 w-4 flex-shrink-0 text-slate-400" />
                        <span className="select-text [-webkit-user-select:text]">{currentUser.phone}</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* My places */}
                <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="profile-links">
                  {[
                    { label: "My timesheet", sub: "Clock history and hours", icon: Clock, to: "/mobile/time", testid: "profile-link-time" },
                    { label: "My jobs", sub: "Today, upcoming, and history", icon: Briefcase, to: "/mobile/job", testid: "profile-link-jobs" },
                    { label: "My tasks", sub: "Your to-do list", icon: ListTodo, to: "/mobile/tasks", testid: "profile-link-tasks" },
                  ].map((row, i) => {
                    const Icon = row.icon;
                    return (
                      <button
                        key={row.label}
                        onClick={() => navigate(row.to)}
                        className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                        data-testid={row.testid}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-900">{row.label}</span>
                          <span className="block truncate text-xs text-slate-500">{row.sub}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                      </button>
                    );
                  })}
                </div>

                {/* Sign out — unmistakable, but quiet until touched */}
                <button
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-[4px] border border-red-200 bg-red-50 text-sm font-semibold text-red-700 transition-transform active:scale-[0.98] disabled:opacity-60"
                  data-testid="button-logout"
                >
                  {logoutMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                  Sign out
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <User className="mb-4 h-16 w-16 text-slate-300" />
                <h2 className="mb-2 text-xl font-semibold text-slate-700">Not Signed In</h2>
                <Button
                  onClick={() => (window.location.href = "/crm/login")}
                  className="mt-4"
                  data-testid="button-go-to-login"
                >
                  Sign In
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating back — OUTSIDE the sliding panel: it holds its spot while
          the page follows your finger, then fades away as the swipe commits.
          Styled and placed exactly like the customer detail's back button. */}
      <button
        ref={backRef}
        onClick={() => goBackAnimated()}
        className="fixed left-3 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-slate-900/10 bg-white text-slate-700 shadow-sm transition-transform active:scale-95"
        style={{ top: "calc(env(safe-area-inset-top) + 6px)" }}
        data-testid="button-back"
        aria-label="Back"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
    </div>
  );
}
