import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { format } from "date-fns";
import {
  Phone,
  Mail,
  MapPin,
  Wrench,
  FileText,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Image as ImageIcon,
  Pencil,
  Play,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerEditSheet } from "@/components/mobile/customer-edit-sheet";
import { markSkipEntrance, usePushEntrance } from "@/lib/page-transitions";
import { useRequireCrmAuth } from "@/hooks/use-require-crm-auth";
import MobileCustomers from "./mobile-customers";
import type { CrmCustomer, CrmWorkOrder, CrmAgreement } from "@shared/schema";

interface WorkOrderWithDetails extends CrmWorkOrder {
  property?: { address1?: string; city?: string } | null;
}

interface CustomerPhoto {
  id: string;
  name: string;
  url: string;
  thumbUrl?: string | null;
  contentType?: string | null;
  createdAt?: string | null;
}

const isVideoFile = (p: CustomerPhoto) => (p.contentType || "").startsWith("video/");

function DetailSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 mb-4 pt-10">
        <Skeleton className="h-12 w-12 rounded-[4px]" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="rounded-[4px] border border-slate-300/70 bg-white p-4 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-5 w-52" />
      </div>
      <div className="rounded-[4px] border border-slate-300/70 bg-white p-4 space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center" data-testid="error-state">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[4px] border border-red-200 bg-red-50">
        <AlertCircle className="h-6 w-6 text-red-600" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-1">Failed to load customer</h3>
      <p className="text-sm text-slate-500 mb-4">
        There was an error loading the customer details.
      </p>
      <Button
        onClick={onRetry}
        className="rounded-[4px] bg-[#711419] text-white hover:bg-[#8a1a1f]"
        data-testid="retry-button"
      >
        Try Again
      </Button>
    </div>
  );
}

function WorkOrderItem({ workOrder }: { workOrder: WorkOrderWithDetails }) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    scheduled: { label: "Scheduled", className: "bg-slate-100 text-slate-600" },
    dispatched: { label: "Dispatched", className: "bg-blue-100 text-blue-700" },
    en_route: { label: "Traveling", className: "bg-amber-100 text-amber-700" },
    on_site: { label: "Working", className: "bg-green-100 text-green-700" },
    completed: { label: "Completed", className: "bg-slate-100 text-slate-500" },
    cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700" },
  };

  const status = statusConfig[workOrder.status] || statusConfig.scheduled;

  return (
    <Link href={`/mobile/job/${workOrder.id}`}>
      <div
        className="flex min-h-[56px] items-center justify-between px-3.5 py-3 active:bg-slate-50"
        data-testid={`work-order-${workOrder.id}`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Wrench className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {workOrder.title || `WO #${workOrder.id.slice(0, 8)}`}
            </p>
            {workOrder.scheduledStart && (
              <p className="text-xs text-slate-500">
                {format(new Date(workOrder.scheduledStart), "MMM d, yyyy")}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.className}`}>
            {status.label}
          </span>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </div>
      </div>
    </Link>
  );
}

function AgreementItem({ agreement }: { agreement: CrmAgreement }) {
  return (
    <div
      className="flex min-h-[56px] items-center justify-between px-3.5 py-3"
      data-testid={`agreement-${agreement.id}`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {agreement.agreementType || "Service Agreement"}
          </p>
          {agreement.endDate && (
            <p className="text-xs text-slate-500">
              Expires: {format(new Date(agreement.endDate), "MMM d, yyyy")}
            </p>
          )}
        </div>
      </div>
      <span className="rounded-[3px] bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">
        Active
      </span>
    </div>
  );
}

export default function MobileCustomerDetail() {
  const [, navigate] = useLocation();
  useRequireCrmAuth();
  const entered = usePushEntrance();
  const { id } = useParams<{ id: string }>();
  const [viewer, setViewer] = useState<CustomerPhoto | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // ── iOS-style tracked back-swipe with the REAL customers page revealed
  // beneath (parallax + scrim), exactly like leaving a job. The floating back
  // arrow lives OUTSIDE the sliding panel: it holds still while you drag and
  // fades out when the swipe commits. ──
  const pageRef = useRef<HTMLDivElement | null>(null);
  const underlayRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const editBtnRef = useRef<HTMLButtonElement | null>(null);
  const [showUnderlay, setShowUnderlay] = useState(false);
  const swipeDrag = useRef<{ x: number; y: number; engaged: boolean; active: boolean } | null>(null);

  const goBackAnimated = (fromDx = 0) => {
    // The customers page is already on screen as the underlay — its remount
    // after navigation must not fade in again (the post-swipe "flash").
    markSkipEntrance();
    const el = pageRef.current;
    if (!el) return navigate("/mobile/customers");
    const w = el.clientWidth || window.innerWidth;
    const startP = Math.max(0, Math.min(1, fromDx / w));
    const dur = 200 * (1 - startP) + 40;
    setShowUnderlay(true);
    requestAnimationFrame(() => {
      el.style.animation = "none";
      el.style.borderRadius = "24px 0 0 24px";
      el.style.transition = `transform ${dur}ms ease-in`;
      el.style.transform = "translateX(100%)";
      for (const btn of [backRef.current, editBtnRef.current]) {
        if (!btn) continue;
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
      setTimeout(() => navigate("/mobile/customers"), dur - 10);
    });
  };

  const onSwipeStart = (e: React.PointerEvent) => {
    if (e.clientX > 48) { swipeDrag.current = null; return; }
    swipeDrag.current = { x: e.clientX, y: e.clientY, engaged: false, active: true };
    // Mount the Customers page underneath NOW, while the finger is still
    // parked — mounting it mid-drag (it's a heavy list) dropped frames and
    // made the swipe feel dead. Same fix the job page carries. If this turns
    // out to be a tap or a scroll, onSwipeEnd unmounts it again.
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

  const {
    data: customer,
    isLoading: customerLoading,
    error: customerError,
    refetch: refetchCustomer,
  } = useQuery<CrmCustomer>({
    queryKey: ["/api/crm/customers", id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch customer");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: workOrders } = useQuery<WorkOrderWithDetails[]>({
    queryKey: ["/api/crm/customers", id, "jobs"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${id}/jobs?limit=5`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id && !!customer,
  });

  const { data: agreements } = useQuery<CrmAgreement[]>({
    queryKey: ["/api/crm/customers", id, "active-agreements"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${id}/active-agreements`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id && !!customer,
  });

  const { data: photos } = useQuery<CustomerPhoto[]>({
    queryKey: ["/api/mobile/customers", id, "photos"],
    queryFn: async () => {
      const res = await fetch(`/api/mobile/customers/${id}/photos`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
  });

  return (
    <div className="relative h-screen overflow-hidden bg-slate-50">
      {/* Real Customers page beneath the detail — the whole screen slides
          over it so the back-swipe reveals where you're headed */}
      {showUnderlay && (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
          <div ref={underlayRef} className="h-full w-full" style={{ transform: "translateX(-25%)" }}>
            <MobileCustomers />
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
        {/* Edge gutter: touches born here can NEVER be claimed by the
            browser as a scroll (touch-action none), so the back-swipe always
            tracks to completion — before this, a few pixels of vertical
            drift let the scroller steal the gesture mid-swipe. */}
        <div className="absolute inset-y-0 left-0 z-20 w-6" style={{ touchAction: "none" }} aria-hidden />
        {/* No bottom nav / no "+" here — the detail page is a focused sheet;
            its own scroller keeps the house bounce. */}
        <div
          className="h-full overflow-y-auto overscroll-y-contain bg-slate-50"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
          }}
        >
          <div className="min-h-[calc(100%+1px)]" data-testid="mobile-customer-detail-page">
            {customerLoading ? (
              <DetailSkeleton />
            ) : customerError ? (
              <ErrorState onRetry={() => refetchCustomer()} />
            ) : customer ? (
              <div className="p-4 space-y-4">
                <div className="mb-4 pt-10">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900" data-testid="customer-name">
                    {customer.name}
                  </h2>
                  {(customer.leadSource || customer.createdAt) && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[customer.leadSource ? `via ${customer.leadSource}` : null, customer.createdAt ? `customer since ${new Date(customer.createdAt).getFullYear()}` : null].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>

                {/* At a glance — real numbers, not labels */}
                <div className="grid grid-cols-3 gap-2" data-testid="customer-stats">
                  <div className="rounded-[4px] border border-slate-300/70 bg-white px-3 py-2.5">
                    <p className="text-lg font-bold tabular-nums text-slate-900">{workOrders?.length ?? 0}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Jobs</p>
                  </div>
                  <div className="rounded-[4px] border border-slate-300/70 bg-white px-3 py-2.5">
                    <p className="text-lg font-bold tabular-nums text-slate-900">
                      {workOrders?.filter((w) => w.status !== "completed" && w.status !== "cancelled").length ?? 0}
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Open</p>
                  </div>
                  <div className="rounded-[4px] border border-slate-300/70 bg-white px-3 py-2.5">
                    <p className="text-lg font-bold tabular-nums text-slate-900">{agreements?.length ?? 0}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Agreements</p>
                  </div>
                </div>

                {workOrders && workOrders.length > 0 && (() => {
                  const last = [...workOrders].sort((a, b) => new Date(b.scheduledStart || 0).getTime() - new Date(a.scheduledStart || 0).getTime())[0];
                  return last?.scheduledStart ? (
                    <p className="text-xs text-slate-500" data-testid="last-visit-line">
                      Last visit: {new Date(last.scheduledStart).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {last.title ? ` — ${last.title}` : ""}
                    </p>
                  ) : null;
                })()}

                <div className="rounded-[4px] border border-slate-300/70 bg-white" data-testid="contact-card">
                  <div className="border-b border-slate-200 px-3.5 py-2.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contact Information</h3>
                  </div>
                  <div className="divide-y divide-slate-200 px-3.5">
                    {customer.phone && (
                      <a
                        href={`tel:${customer.phone}`}
                        className="flex min-h-[44px] items-center gap-3 py-2.5 text-sm font-medium text-[#711419] active:opacity-80"
                        data-testid="customer-phone"
                      >
                        <Phone className="h-4 w-4 flex-shrink-0" />
                        {/* Hold-to-copy: selection + the copy callout stay native here */}
                        <span className="select-text [-webkit-touch-callout:default] [-webkit-user-select:text]">{customer.phone}</span>
                      </a>
                    )}
                    {customer.email && (
                      <a
                        href={`mailto:${customer.email}`}
                        className="flex min-h-[44px] items-center gap-3 py-2.5 text-sm font-medium text-[#711419] active:opacity-80"
                        data-testid="customer-email"
                      >
                        <Mail className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate select-text [-webkit-touch-callout:default] [-webkit-user-select:text]">{customer.email}</span>
                      </a>
                    )}
                    {customer.fullAddress && (
                      <div className="flex min-h-[44px] items-start gap-3 py-2.5 text-sm text-slate-600">
                        <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                        <span className="select-text [-webkit-touch-callout:default] [-webkit-user-select:text]" data-testid="customer-address">{customer.fullAddress}</span>
                      </div>
                    )}
                    {!customer.phone && !customer.email && !customer.fullAddress && (
                      <p className="py-3 text-sm text-slate-400">No contact information available</p>
                    )}
                  </div>
                </div>

                {/* Photos & videos linked to this customer */}
                {photos && photos.length > 0 && (
                  <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="customer-photos-card">
                    <div className="flex items-center gap-2 border-b border-slate-200 px-3.5 py-2.5">
                      <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Photos & Videos</h3>
                      <span className="ml-auto text-[11px] font-semibold text-slate-400">{photos.length}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-0.5 p-0.5">
                      {photos.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setViewer(p)}
                          className="relative aspect-square overflow-hidden bg-slate-100"
                          data-testid={`customer-photo-${p.id}`}
                        >
                          {isVideoFile(p) ? (
                            <>
                              <video src={p.url} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                              <span className="absolute inset-0 flex items-center justify-center">
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white">
                                  <Play className="ml-0.5 h-4 w-4" />
                                </span>
                              </span>
                            </>
                          ) : (
                            <img src={p.thumbUrl || p.url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {workOrders && workOrders.length > 0 && (
                  <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="work-orders-card">
                    <div className="flex items-center gap-2 border-b border-slate-200 px-3.5 py-2.5">
                      <Wrench className="h-3.5 w-3.5 text-slate-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recent Work Orders</h3>
                    </div>
                    <div className="divide-y divide-slate-200">
                      {workOrders.map((wo) => (
                        <WorkOrderItem key={wo.id} workOrder={wo} />
                      ))}
                    </div>
                  </div>
                )}

                {agreements && agreements.length > 0 && (
                  <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="agreements-card">
                    <div className="flex items-center gap-2 border-b border-slate-200 px-3.5 py-2.5">
                      <FileText className="h-3.5 w-3.5 text-slate-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Agreements</h3>
                    </div>
                    <div className="divide-y divide-slate-200">
                      {agreements.map((agreement) => (
                        <AgreementItem key={agreement.id} agreement={agreement} />
                      ))}
                    </div>
                  </div>
                )}

                {(!workOrders || workOrders.length === 0) && (!agreements || agreements.length === 0) && (
                  <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-8 text-center" data-testid="no-history-card">
                    <p className="text-sm text-slate-500">No work orders or agreements found</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Edit contact info + service address (with the address lookup) */}
      {customer && <CustomerEditSheet customer={customer} open={editOpen} onOpenChange={setEditOpen} />}

      {/* Floating back — OUTSIDE the sliding panel: it holds its spot while
          the page follows your finger, then fades away as the swipe commits.
          Styled and placed like the job Overview's back button. */}
      <button
        ref={backRef}
        onClick={() => goBackAnimated()}
        className="fixed left-3 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-slate-900/10 bg-white text-slate-700 shadow-sm transition-transform active:scale-95"
        style={{ top: "calc(env(safe-area-inset-top) + 6px)" }}
        data-testid="back-button"
        aria-label="Back"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>

      {/* Edit — top-right pill (same family as the customers page's Filters
          pill), floating with the back button and fading out on exit. */}
      {customer && (
        <button
          ref={editBtnRef}
          onClick={() => setEditOpen(true)}
          className="fixed right-3 z-30 flex h-10 items-center gap-1.5 rounded-full border border-slate-300/70 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-transform active:scale-95"
          style={{ top: "calc(env(safe-area-inset-top) + 6px)" }}
          data-testid="customer-edit-open"
          aria-label="Edit customer"
        >
          <Pencil className="h-4 w-4" />
          Edit
        </button>
      )}

      {/* Lightbox — tap a tile, see it big; videos play inline */}
      {viewer && (
        <div
          className="fixed inset-0 z-[80] flex flex-col bg-black/95 animate-in fade-in duration-200"
          onClick={() => setViewer(null)}
          data-testid="customer-photo-viewer"
        >
          <div
            className="flex items-center justify-between px-3"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }}
          >
            <span className="min-w-0 truncate pr-3 text-sm font-medium text-white/70">{viewer.name}</span>
            <button
              onClick={() => setViewer(null)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-transform active:scale-95"
              aria-label="Close"
              data-testid="customer-photo-viewer-close"
            >
              <X className="h-5 w-5" strokeWidth={2.25} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-3" onClick={(e) => e.stopPropagation()}>
            {isVideoFile(viewer) ? (
              <video src={viewer.url} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg" />
            ) : (
              <img src={viewer.url} alt={viewer.name} className="max-h-full max-w-full rounded-lg object-contain" />
            )}
          </div>
          <p
            className="px-4 text-center text-xs text-white/50"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 14px)" }}
          >
            {viewer.createdAt ? format(new Date(viewer.createdAt), "MMM d, yyyy · h:mm a") : ""}
          </p>
        </div>
      )}
    </div>
  );
}
