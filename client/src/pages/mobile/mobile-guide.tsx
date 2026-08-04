import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { getQueryFn } from "@/lib/queryClient";
import { markSkipEntrance, usePushEntrance } from "@/lib/page-transitions";
import { useRequireCrmAuth } from "@/hooks/use-require-crm-auth";
import { AvatarWithRole } from "@/components/user-avatar-badge";
import MobileMore from "./mobile-more";
import type { CrmUser } from "@shared/schema";

import roleOwner from "@/assets/role-owner.png";
import roleSupervisor from "@/assets/role-supervisor.png";
import roleSales from "@/assets/role-sales.png";
import roleTech from "@/assets/role-tech.png";
import visitService from "@/assets/visit-service.png";
import visitMaintenance from "@/assets/visit-maintenance.png";
import visitInstall from "@/assets/visit-install.png";
import visitSales from "@/assets/visit-sales.png";
import timeJob from "@/assets/badge-time-job.png";
import timeDrive from "@/assets/badge-time-drive.png";
import timeShop from "@/assets/badge-time-shop.png";
import timeTraining from "@/assets/badge-time-training.png";
import timeMeeting from "@/assets/badge-time-meeting.png";
import timeBreak from "@/assets/badge-time-break.png";
import timeOther from "@/assets/badge-other.png";
import typeResidential from "@/assets/type-residential.png";
import typeCommercial from "@/assets/type-commercial.png";
import typePropertyManager from "@/assets/type-property-manager.png";
import contactKnown from "@/assets/badge-contact-known.png";
import contactUnknown from "@/assets/badge-contact-unknown.png";
import badgeGibbs from "@/assets/badge-gibbs.png";

/** Guide — how the mobile app works, plus the badge reference so every
 *  metal emblem in the app has a name. Same leaf-page chrome as the
 *  profile: floating back arrow, tracked back-swipe with More beneath. */

function BadgeCell({ img, label, sub }: { img: string; label: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <img src={img} alt="" className="h-12 w-12 select-none" draggable={false} />
      <span className="text-xs font-semibold leading-tight text-slate-800">{label}</span>
      {sub && <span className="text-[10px] leading-tight text-slate-400">{sub}</span>}
    </div>
  );
}

function GuideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[4px] border border-slate-300/70 bg-white" data-testid={`guide-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="border-b border-slate-200 px-3.5 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function HowRow({ title, text }: { title: string; text: string }) {
  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{text}</p>
    </div>
  );
}

export default function MobileGuide() {
  const [, navigate] = useLocation();
  useRequireCrmAuth();
  const entered = usePushEntrance();

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  // ── Same tracked back-swipe chrome as the profile page ──
  const pageRef = useRef<HTMLDivElement | null>(null);
  const underlayRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const [showUnderlay, setShowUnderlay] = useState(false);
  const swipeDrag = useRef<{ x: number; y: number; engaged: boolean; active: boolean } | null>(null);

  const goBackAnimated = (fromDx = 0) => {
    markSkipEntrance();
    const el = pageRef.current;
    if (!el) return navigate("/mobile/more");
    const w = el.clientWidth || window.innerWidth;
    const startP = Math.max(0, Math.min(1, fromDx / w));
    const dur = 200 * (1 - startP) + 40;
    setShowUnderlay(true);
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
      setTimeout(() => navigate("/mobile/more"), dur - 10);
    });
  };

  const onSwipeStart = (e: React.PointerEvent) => {
    if (e.clientX > 48) { swipeDrag.current = null; return; }
    swipeDrag.current = { x: e.clientX, y: e.clientY, engaged: false, active: true };
    setShowUnderlay(true);
    pageRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onSwipeMove = (e: React.PointerEvent) => {
    const st = swipeDrag.current;
    const el = pageRef.current;
    if (!st?.active || !el) return;
    const dx = e.clientX - st.x;
    const dy = Math.abs(e.clientY - st.y);
    if (!st.engaged) {
      if (dx > 8 && dx > dy) {
        st.engaged = true;
        el.style.transition = "none";
        el.style.animation = "none";
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
    }
  };
  const onSwipeEnd = (e: React.PointerEvent) => {
    const st = swipeDrag.current;
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
        setShowUnderlay(false);
      }, 320);
    }
  };

  return (
    <div className="relative h-screen overflow-hidden bg-slate-50">
      {showUnderlay && (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
          <div ref={underlayRef} className="h-full w-full" style={{ transform: "translateX(-25%)" }}>
            <MobileMore />
          </div>
          <div ref={scrimRef} className="absolute inset-0 bg-black" style={{ opacity: 0.18 }} />
        </div>
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
        <div className="absolute inset-y-0 left-0 z-20 w-6" style={{ touchAction: "none" }} aria-hidden />
        <div
          className="h-full overflow-y-auto overscroll-y-contain bg-slate-50"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
          }}
        >
          <div className="min-h-[calc(100%+1px)] space-y-4 px-4 pb-6 pt-16" data-testid="mobile-guide">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Guide</h2>
              <p className="mt-1 text-sm text-slate-500">How the app works, and what every badge means.</p>
            </div>

            <GuideCard title="Getting around">
              <div className="divide-y divide-slate-100">
                <HowRow title="The tabs" text="Agenda is your day at a glance. Jobs holds your schedule and every technician's day. Customers and Time do what they say. Everything else lives under More." />
                <HowRow title="The + button" text="Create from anywhere — customers, jobs, quotes, invoices, and tasks. Quotes and invoices ask you to pick the customer first." />
                <HowRow title="Gibbs" text="The AI badge opens Gibbs. Ask about customers, schedules, or money — he can also draft texts, emails, and work orders, but nothing runs until you approve it. On create pages he fills the form for you." />
                <HowRow title="Go back" text="Swipe right from the left edge to leave any page — the screen follows your finger. Bottom sheets drag down to close; in Gibbs history you can drag down from anywhere." />
                <HowRow title="Hold things" text="Hold a chat in Gibbs history to rename it, move it into a space, or delete it. Hold a space folder to delete the space." />
              </div>
            </GuideCard>

            <GuideCard title="You & your role">
              <div className="flex items-center gap-4">
                <AvatarWithRole name={currentUser?.name} role={currentUser?.role} size={56} />
                <p className="text-[13px] leading-relaxed text-slate-500">
                  Your initials plate is you everywhere in the app — the small badge on its shoulder is your role.
                </p>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-3">
                <BadgeCell img={roleOwner} label="Owner" sub="and admins" />
                <BadgeCell img={roleSupervisor} label="Supervisor" />
                <BadgeCell img={roleSales} label="Sales" />
                <BadgeCell img={roleTech} label="Technician" />
              </div>
            </GuideCard>

            <GuideCard title="Visit types">
              <div className="grid grid-cols-4 gap-3">
                <BadgeCell img={visitService} label="Service" sub="repairs" />
                <BadgeCell img={visitMaintenance} label="Maintenance" sub="tune-ups" />
                <BadgeCell img={visitInstall} label="Install" sub="new systems" />
                <BadgeCell img={visitSales} label="Sales" sub="estimates" />
              </div>
              <p className="mt-3 text-[11px] text-slate-400">On work orders, job cards, and the Work Orders directory.</p>
            </GuideCard>

            <GuideCard title="Time clock">
              <div className="grid grid-cols-4 gap-3">
                <BadgeCell img={timeJob} label="Job site" />
                <BadgeCell img={timeDrive} label="Driving" />
                <BadgeCell img={timeShop} label="Shop" />
                <BadgeCell img={timeTraining} label="Training" />
                <BadgeCell img={timeMeeting} label="Meeting" />
                <BadgeCell img={timeBreak} label="Break" sub="unpaid" />
                <BadgeCell img={timeOther} label="Other" />
              </div>
              <p className="mt-3 text-[11px] text-slate-400">Pick the category when you clock in — it drives the timesheet breakdown.</p>
            </GuideCard>

            <GuideCard title="Customer types">
              <div className="grid grid-cols-3 gap-3">
                <BadgeCell img={typeResidential} label="Residential" sub="homes" />
                <BadgeCell img={typeCommercial} label="Commercial" sub="businesses" />
                <BadgeCell img={typePropertyManager} label="Property mgr" sub="many properties" />
              </div>
            </GuideCard>

            <GuideCard title="Messages & Gibbs">
              <div className="grid grid-cols-3 gap-3">
                <BadgeCell img={contactKnown} label="Known contact" sub="matched to a customer" />
                <BadgeCell img={contactUnknown} label="Unknown number" sub="no CRM match yet" />
                <BadgeCell img={badgeGibbs} label="Gibbs" sub="the AI assistant" />
              </div>
            </GuideCard>
          </div>
        </div>
      </div>

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
