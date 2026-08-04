import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Phone, Plus } from "lucide-react";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { markSkipEntrance, usePushEntrance } from "@/lib/page-transitions";
import { useRequireCrmAuth } from "@/hooks/use-require-crm-auth";
import { visitTypeBadge } from "@/pages/mobile/mobile-work-orders";
import MobileMore from "./mobile-more";
import type { CrmUser } from "@shared/schema";

/** Call Log — the office phone log, in the field. A back-swipe page over
 *  More: view every day's entries and log a call from anywhere; the same
 *  records the CRM's Phone console shows (same tags, same billable flag). */

const TAGS = [
  { key: "Service", visit: "SERVICE" },
  { key: "Maintenance", visit: "MAINTENANCE" },
  { key: "Install", visit: "INSTALL" },
  { key: "Sales", visit: "SALES" },
] as const;

// Same left-bar colors the CRM's phone console uses per tag
const TAG_BORDERS: Record<string, string> = {
  Service: "border-l-blue-500",
  Install: "border-l-green-500",
  Sales: "border-l-purple-500",
  Maintenance: "border-l-amber-500",
};

type CallLogEntry = {
  id: string;
  clientName: string;
  description: string;
  phone: string | null;
  tag: string | null;
  billable: boolean;
  createdByName: string | null;
  createdAt: string | null;
};

function DaySection({ date, count, defaultOpen }: { date: string; count: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const { data, isLoading } = useQuery<{ logs: CallLogEntry[] }>({
    queryKey: ["/api/call-logs/days", date],
    queryFn: async () => {
      const res = await fetch(`/api/call-logs/days/${date}`, { credentials: "include" });
      if (!res.ok) return { logs: [] };
      return res.json();
    },
    enabled: open,
  });
  const logs = data?.logs || [];

  let label = date;
  try {
    label = format(parseISO(date), "EEEE, MMM d");
  } catch {
    /* keep raw */
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-2"
        data-testid={`call-log-day-${date}`}
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {label}
        </span>
        <span className="text-xs font-semibold tabular-nums text-slate-400">{count} call{count === 1 ? "" : "s"}</span>
      </button>
      {open && (
        isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : logs.length === 0 ? (
          <p className="rounded-[4px] border border-dashed border-slate-300 bg-white py-6 text-center text-sm text-slate-400">
            No calls logged this day.
          </p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`rounded-[4px] border border-slate-300/70 border-l-4 bg-white p-3.5 ${log.tag ? TAG_BORDERS[log.tag] || "border-l-slate-300" : "border-l-slate-300"}`}
                data-testid={`call-log-entry-${log.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{log.clientName}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[
                        log.tag,
                        log.createdAt ? format(new Date(log.createdAt), "h:mm a") : null,
                        log.createdByName,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {log.billable && (
                    <span className="shrink-0 rounded-[3px] bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                      Billable
                    </span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{log.description}</p>
                {log.phone && (
                  <a
                    href={`tel:${log.phone}`}
                    className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#711419]"
                    data-testid={`call-log-phone-${log.id}`}
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {log.phone}
                  </a>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

export default function MobileCallLog() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  useRequireCrmAuth();
  const entered = usePushEntrance();
  const [logOpen, setLogOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [billable, setBillable] = useState(false);

  // ── iOS-style tracked back-swipe with the REAL More page revealed
  // beneath (parallax + scrim), exactly like the other sub-pages. ──
  const pageRef = useRef<HTMLDivElement | null>(null);
  const underlayRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const [showUnderlay, setShowUnderlay] = useState(false);
  const swipeDrag = useRef<{ id: number; x: number; y: number; engaged: boolean; active: boolean } | null>(null);

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
    // A second finger mid-swipe must not hijack or wipe the gesture
    if (swipeDrag.current) return;
    if (e.clientX > 48) return;
    swipeDrag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, engaged: false, active: true };
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
      const b = backRef.current;
      if (b) {
        b.style.transition = "none";
        b.style.opacity = String(1 - pr);
      }
    }
  };
  const onSwipeEnd = (e: React.PointerEvent) => {
    const st = swipeDrag.current;
    if (!st || st.id !== e.pointerId) return; // only the tracked finger ends it
    swipeDrag.current = null;
    const el = pageRef.current;
    if (!st.engaged || !el) {
      setShowUnderlay(false);
      return;
    }
    const dx = e.clientX - st.x;
    if (dx > Math.min(140, window.innerWidth * 0.33)) {
      goBackAnimated(Math.max(0, dx));
    } else {
      el.style.transition = "transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1)";
      el.style.transform = "translateX(0)";
      const b = backRef.current;
      if (b) {
        b.style.transition = "opacity 0.25s ease-out";
        b.style.opacity = "1";
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
        const btn = backRef.current;
        if (btn) {
          btn.style.transition = "";
          btn.style.opacity = "";
        }
        setShowUnderlay(false);
      }, 320);
    }
  };

  // The push-entrance rides in OVER the real More page (parallax + scrim),
  // so the slide never crosses a blank white screen.
  useEffect(() => {
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
    return () => {
      cancelAnimationFrame(raf);
      if (t) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const { data: days = [], isLoading: daysLoading } = useQuery<Array<{ id: string; date: string; count: number }>>({
    queryKey: ["/api/call-logs/days"],
    queryFn: async () => {
      const res = await fetch("/api/call-logs/days", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createLog = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/call-logs", {
        clientName: clientName.trim(),
        description: description.trim(),
        phone: phone.trim() || undefined,
        tag: tag || undefined,
        billable,
        createdByName: currentUser?.name || undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to log the call");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Call logged", description: "The entry is in today's call log." });
      queryClient.invalidateQueries({ queryKey: ["/api/call-logs/days"] });
      setLogOpen(false);
      setClientName("");
      setPhone("");
      setDescription("");
      setTag(null);
      setBillable(false);
    },
    onError: (e: Error) => toast({ title: "Couldn't log the call", description: e.message, variant: "destructive" }),
  });

  const canSubmit = clientName.trim().length > 0 && description.trim().length > 0 && !createLog.isPending;

  // The most recent two weeks of days — today expanded by default
  const shownDays = days.slice(0, 14);

  return (
    <div className="relative h-screen overflow-hidden bg-slate-50">
      {/* Real More page beneath — the back-swipe reveals where you're headed */}
      {showUnderlay && (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden data-underlay>
          <div ref={underlayRef} className="h-full w-full" style={{ transform: "translateX(-25%)" }}>
            <MobileMore />
          </div>
          <div ref={scrimRef} className="absolute inset-0 bg-black" style={{ opacity: 0.18 }} />
        </div>
      )}

      <div
        ref={pageRef}
        className={`${entered ? "page-slide-in" : "translate-x-full"} relative z-10 h-full bg-slate-50 shadow-[-14px_0_32px_rgba(0,0,0,0.12)]`}
        style={{ touchAction: "pan-y" }}
        onPointerDown={onSwipeStart}
        onPointerMove={onSwipeMove}
        onPointerUp={onSwipeEnd}
        onPointerCancel={onSwipeEnd}
      >
        {/* Edge gutter: touches born here can never be claimed as a scroll */}
        <div className="absolute inset-y-0 left-0 z-20 w-6" style={{ touchAction: "none" }} aria-hidden />
        <div
          className="h-full overflow-y-auto overscroll-y-contain bg-slate-50"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
          }}
        >
          <div className="min-h-[calc(100%+1px)]" data-testid="mobile-call-log-page">
            <div className="space-y-4 p-4">
              <div className="pt-12">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">Call Log</h2>
                <p className="mt-0.5 text-sm text-slate-500">The office phone log — same entries as the CRM.</p>
              </div>

              <button
                onClick={() => setLogOpen(true)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[4px] bg-[#711419] text-base font-semibold text-white shadow-sm transition-transform active:scale-[0.98]"
                data-testid="button-log-call"
              >
                <Plus className="h-4 w-4" />
                Log a Call
              </button>

              {daysLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : shownDays.length === 0 ? (
                <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-10 text-center" data-testid="call-log-empty">
                  <p className="text-sm font-medium text-slate-600">No calls logged yet</p>
                  <p className="mt-0.5 text-xs text-slate-400">Log the first one with the button above.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {shownDays.map((day, i) => (
                    <DaySection key={day.id} date={day.date} count={day.count} defaultOpen={i === 0} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating back — OUTSIDE the sliding panel: it holds its spot while
          the page follows your finger, then fades away as the swipe commits. */}
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

      {/* Log a call — house sheet; keepHeight so the keyboard doesn't
          balloon it to full screen */}
      <DraggableSheet tall keepHeight open={logOpen} onOpenChange={setLogOpen} title="Log a call" testid="sheet-log-call">
        <h2 className="text-lg font-semibold text-slate-900">Log a call</h2>
        <div className="mt-4 space-y-4 pb-2">
          <div>
            <Label htmlFor="call-client" className="mb-1.5 block">Who called? *</Label>
            <Input
              id="call-client"
              placeholder="Customer or caller name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="h-12 rounded-[4px] text-[16px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none focus-visible:border-slate-400"
              data-testid="input-call-client"
            />
          </div>
          <div>
            <Label htmlFor="call-phone" className="mb-1.5 block">Phone (optional)</Label>
            <Input
              id="call-phone"
              type="tel"
              placeholder="(555) 555-1234"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-12 rounded-[4px] text-[16px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none focus-visible:border-slate-400"
              data-testid="input-call-phone"
            />
          </div>
          <div>
            <Label htmlFor="call-description" className="mb-1.5 block">What was it about? *</Label>
            <Textarea
              id="call-description"
              placeholder="e.g. AC not cooling, wants a visit this week..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded-[4px] text-[16px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none focus-visible:border-slate-400"
              data-testid="input-call-description"
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Tag (optional)</Label>
            <div className="grid grid-cols-4 gap-2">
              {TAGS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTag(tag === t.key ? null : t.key)}
                  className={`flex flex-col items-center gap-1 rounded-[4px] border px-1 py-2.5 transition-all active:scale-95 ${
                    tag === t.key ? "border-[#711419] bg-[#711419]/[0.06]" : "border-slate-300/70 bg-white"
                  }`}
                  data-testid={`call-tag-${t.key.toLowerCase()}`}
                >
                  <img src={visitTypeBadge(t.visit)} alt="" className="h-8 w-8 select-none" draggable={false} />
                  <span className={`text-[11px] font-medium ${tag === t.key ? "text-[#711419]" : "text-slate-600"}`}>{t.key}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between py-1">
            <div>
              <Label className="text-sm font-medium">Billable</Label>
              <p className="text-xs text-slate-500">This call should be charged</p>
            </div>
            <Switch checked={billable} onCheckedChange={setBillable} data-testid="switch-call-billable" />
          </div>
          <button
            onClick={() => createLog.mutate()}
            disabled={!canSubmit}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[4px] bg-[#711419] text-base font-semibold text-white shadow-sm transition-transform active:scale-[0.98] disabled:bg-slate-300"
            data-testid="button-save-call"
          >
            {createLog.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
            Log Call
          </button>
        </div>
      </DraggableSheet>
    </div>
  );
}
