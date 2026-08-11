import { monthlyFinancing } from "@/lib/financing";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, useSearch } from "wouter";
import { format } from "date-fns";
import { generateQuotePdf } from "@/lib/quote-pdf";
import {
  ChevronLeft,
  ChevronRight,
  Send,
  Loader2,
  Tag,
  Download,
  Eye,
  CheckCircle,
  XCircle,
  Mail,
  Monitor,
  MessageSquare,
  X,
} from "lucide-react";
import { StatusDot } from "@/components/ui/status-dot";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { markSkipEntrance, usePushEntrance } from "@/lib/page-transitions";
import { useRequireCrmAuth } from "@/hooks/use-require-crm-auth";
import MobileQuotes from "./mobile-quotes";
// Lazy so the job-detail chunk isn't bundled in here; when the quote was
// opened FROM a job the chunk is already loaded, so the underlay is instant.
const MobileJobDetailUnderlay = lazy(() => import("./mobile-job-detail"));
import ghvacLogo from "@assets/ghvac-logo.png";
import type { CrmQuote, CrmQuoteLineItem } from "@shared/schema";

type QuoteWithLineItems = Omit<CrmQuote, 'lineItems'> & {
  lineItems?: CrmQuoteLineItem[];
};

const BRAND_COLOR = "#711419";

const COMPANY_INFO = {
  name: "Giesbrecht HVAC",
  address: "PO Box 917, Wrens, GA 30833",
  phone: "(706) 826-0644",
  email: "chandler@ghvacinc.com",
  website: "www.ghvacinc.com",
};

const quoteStatusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-700 border-blue-300" },
  accepted: { label: "Accepted", className: "bg-green-100 text-green-700 border-green-300" },
  declined: { label: "Declined", className: "bg-red-100 text-red-700 border-red-300" },
  expired: { label: "Expired", className: "bg-orange-100 text-orange-700 border-orange-300" },
  converted: { label: "Converted", className: "bg-purple-100 text-purple-700 border-purple-300" },
};

function formatCurrency(amount: number | string) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num || 0);
}

// Estimated monthly payment with approved financing — computed from the
// GreenSky program in @/lib/financing so every surface agrees.

export default function MobileQuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  useRequireCrmAuth();
  const entered = usePushEntrance();
  const [showPreview, setShowPreview] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [sendViaEmail, setSendViaEmail] = useState(true);
  const [sendViaSms, setSendViaSms] = useState(false);
  const [phoneRecipient, setPhoneRecipient] = useState("");

  // ── iOS-style tracked back-swipe with the REAL quotes list revealed
  // beneath (parallax + scrim), exactly like leaving a customer. The
  // floating back arrow lives OUTSIDE the sliding panel: it holds still
  // while you drag and fades out when the swipe commits. ──
  const pageRef = useRef<HTMLDivElement | null>(null);
  const underlayRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const [showUnderlay, setShowUnderlay] = useState(false);
  const swipeDrag = useRef<{ id: number; x: number; y: number; engaged: boolean; active: boolean } | null>(null);

  // Opened from a job's Quote tab (?job=<id>): back returns to THAT tab,
  // and the back-swipe reveals the job page — not the quotes list.
  const searchString = useSearch();
  const fromJobId = new URLSearchParams(searchString).get("job");
  const backTarget = fromJobId ? `/mobile/job/${fromJobId}?tab=quote` : "/mobile/quotes";

  const goBackAnimated = (fromDx = 0) => {
    // The back target is already on screen as the underlay — its remount
    // after navigation must not fade in again (the post-swipe "flash").
    markSkipEntrance();
    const el = pageRef.current;
    if (!el) return navigate(backTarget);
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
      setTimeout(() => navigate(backTarget), dur - 10);
    });
  };

  const onSwipeStart = (e: React.PointerEvent) => {
    // A second finger mid-swipe must not hijack or wipe the gesture
    if (swipeDrag.current) return;
    if (e.clientX > 48) return;
    swipeDrag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, engaged: false, active: true };
    // Mount the quotes list underneath NOW, while the finger is still
    // parked — mounting it mid-drag drops frames. If this turns out to be
    // a tap or a scroll, onSwipeEnd unmounts it again.
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

  // The push-entrance rides in OVER the real quotes list (parallax + scrim
  // darkening), exactly like the back-swipe in reverse — without this the
  // panel slid over a blank white screen and the entrance read as a flash.
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

  const { data: quote, isLoading, error } = useQuery<QuoteWithLineItems>({
    queryKey: ["/api/crm/quotes", id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quotes/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch quote");
      return res.json();
    },
    enabled: !!id,
  });

  const sendQuoteEmailMutation = useMutation({
    mutationFn: async (data: { recipientEmail?: string; recipientPhone?: string; sendEmail: boolean; sendSms: boolean }) => {
      const response = await apiRequest("POST", `/api/crm/quotes/${id}/send-email`, data);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || error.error || "Failed to send quote");
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      const methods = [];
      if (variables.sendEmail) methods.push("email");
      if (variables.sendSms) methods.push("SMS");
      const methodText = methods.join(" and ");
      toast({ title: "Quote Sent", description: `Quote has been sent via ${methodText} successfully.` });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      setShowEmailDialog(false);
      setEmailRecipient("");
      setPhoneRecipient("");
      setSendViaEmail(true);
      setSendViaSms(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to send quote", variant: "destructive" });
    },
  });

  const openEmailDialog = () => {
    setEmailRecipient(quote?.customerEmail || "");
    setPhoneRecipient(quote?.customerPhone || (quote as any)?.customer?.phone || "");
    setSendViaEmail(true);
    setSendViaSms(false);
    setShowEmailDialog(true);
  };

  const handleSendEmail = () => {
    if (!sendViaEmail && !sendViaSms) {
      toast({ title: "Error", description: "Please select at least one sending method.", variant: "destructive" });
      return;
    }
    if (sendViaEmail && !emailRecipient.trim()) {
      toast({ title: "Error", description: "Please enter a recipient email address.", variant: "destructive" });
      return;
    }
    if (sendViaSms && !phoneRecipient.trim()) {
      toast({ title: "Error", description: "Please enter a recipient phone number.", variant: "destructive" });
      return;
    }
    sendQuoteEmailMutation.mutate({
      recipientEmail: sendViaEmail ? emailRecipient.trim() : undefined,
      recipientPhone: sendViaSms ? phoneRecipient.trim() : undefined,
      sendEmail: sendViaEmail,
      sendSms: sendViaSms,
    });
  };

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/quotes/${id}/accept`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to accept quote");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Quote Accepted", description: "Quote status updated to accepted." });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to accept quote", variant: "destructive" });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/quotes/${id}/decline`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to decline quote");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Quote Declined", description: "Quote status updated to declined." });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to decline quote", variant: "destructive" });
    },
  });

  const handleDownloadPDF = () => {
    if (!quote) return;
    try {
      // Shared professional template (mirrors the invoice PDF); internal cost
      // lines never print.
      generateQuotePdf(quote as any, ((quote as any).lineItems || []) as any);
      toast({ title: "PDF Downloaded", description: "Quote PDF has been downloaded successfully." });
    } catch (error) {
      console.error("PDF generation error:", error);
      toast({ title: "Error", description: "Failed to generate PDF", variant: "destructive" });
    }
  };

  const statusInfo = quote ? (quoteStatusConfig[quote.status] || quoteStatusConfig.draft) : quoteStatusConfig.draft;
  const lineItems = quote?.lineItems || [];
  // The customer-facing document never shows internal labor/cost lines, and a
  // single-line quote displays the SELL price — the same rules as the public
  // quote page, so the preview matches what the customer will actually see.
  const clientVisibleItems = lineItems.filter((item) => item.lineType !== "labor" && item.lineType !== "other");
  const isSingleItem = clientVisibleItems.length === 1;
  const isInstallQuote = !!quote && ["proposal", "custom_install"].includes(quote.quoteType || "");

  return (
    <div className="relative h-screen overflow-hidden bg-slate-50">
      {/* The real back target beneath the detail — the whole screen slides
          over it so the back-swipe reveals where you're headed: the job's
          Quote tab when we came from a job, the quotes list otherwise */}
      {showUnderlay && (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden data-underlay>
          <div ref={underlayRef} className="h-full w-full" style={{ transform: "translateX(-25%)" }}>
            {fromJobId ? (
              <Suspense fallback={null}>
                <MobileJobDetailUnderlay idOverride={fromJobId} tabOverride="quote" />
              </Suspense>
            ) : (
              <MobileQuotes />
            )}
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
        {/* Edge gutter: touches born here can NEVER be claimed by the
            browser as a scroll, so the back-swipe always tracks. */}
        <div className="absolute inset-y-0 left-0 z-20 w-6" style={{ touchAction: "none" }} aria-hidden />
        <div
          className="h-full overflow-y-auto overscroll-y-contain bg-slate-50"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
          }}
        >
          <div className="min-h-[calc(100%+1px)]" data-testid="mobile-quote-detail">
            {isLoading ? (
              <div className="space-y-4 p-4 pt-16">
                <Skeleton className="h-8 w-56" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : error || !quote ? (
              <div className="p-4 pt-20">
                <div className="rounded-[4px] border border-slate-300/70 bg-white py-10 text-center">
                  <p className="text-sm text-red-500" data-testid="error-message">Failed to load quote details.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 p-4">
                {/* Header — clears the floating back arrow; the quote speaks
                    for itself: no icon chip, and a fresh draft carries no
                    status pill (the dot appears once it's sent). */}
                <div className="pt-12" data-testid="quote-header">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900" data-testid="quote-number">
                    {quote.title || `Quote ${quote.quoteNumber}`}
                  </h1>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {[
                      quote.title ? quote.quoteNumber : null,
                      quote.createdAt ? format(new Date(quote.createdAt), "MMM d, yyyy") : null,
                    ].filter(Boolean).join(" · ")}
                  </p>
                  {quote.status !== "draft" && (
                    <div className="mt-1.5">
                      <StatusDot pill={statusInfo.className} data-testid="quote-status">
                        {statusInfo.label}
                      </StatusDot>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPreview(true)}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[4px] border border-slate-300/70 bg-white text-sm font-semibold text-slate-700 transition-transform active:scale-[0.98]"
                    data-testid="button-preview"
                  >
                    <Eye className="h-4 w-4" />
                    Preview
                  </button>
                  <button
                    onClick={handleDownloadPDF}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[4px] border border-slate-300/70 bg-white text-sm font-semibold text-slate-700 transition-transform active:scale-[0.98]"
                    data-testid="button-download"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                </div>

                {/* Customer — name up top, then tappable call / map rows */}
                <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="customer-info-card">
                  <p className="border-b border-slate-200/80 bg-slate-50 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Customer
                  </p>
                  <div className="px-3.5 py-3">
                    <p className="font-semibold text-slate-900" data-testid="customer-name">{quote.customerName}</p>
                    {quote.customerEmail && (
                      <p className="mt-0.5 truncate text-xs text-slate-500">{quote.customerEmail}</p>
                    )}
                  </div>
                  {quote.customerPhone && (
                    <a
                      href={`tel:${quote.customerPhone}`}
                      className="flex items-center gap-3 border-t border-slate-200/80 px-3.5 py-3 transition-colors active:bg-slate-50"
                      data-testid="customer-phone"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900">{quote.customerPhone}</span>
                        <span className="block text-xs text-slate-500">Tap to call</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </a>
                  )}
                  {quote.serviceAddress && (
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(quote.serviceAddress)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 border-t border-slate-200/80 px-3.5 py-3 transition-colors active:bg-slate-50"
                      data-testid="service-address"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-snug text-slate-900">{quote.serviceAddress}</span>
                        <span className="block text-xs text-slate-500">Open in Maps</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </a>
                  )}
                </div>

                {/* Line items — one card, totals docked as its footer */}
                <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="line-items-card">
                  <p className="border-b border-slate-200/80 bg-slate-50 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Line items{lineItems.length > 0 ? ` (${lineItems.length})` : ""}
                  </p>
                  {lineItems.length === 0 ? (
                    <p className="px-3.5 py-4 text-sm italic text-slate-400" data-testid="no-line-items">No line items</p>
                  ) : (
                    <div>
                      {lineItems.map((item, i) => {
                        const isDiscount = item.isDiscountLine || item.lineType === "discount";
                        // Menu quotes: optional add-ons picked in person; after
                        // acceptance the quote records exactly what was taken.
                        const acceptedIds = Array.isArray((quote as any).acceptedLineItemIds) ? ((quote as any).acceptedLineItemIds as string[]) : null;
                        const optState = (item as any).isOptional === true
                          ? ((["accepted", "converted"] as string[]).includes(quote.status) && acceptedIds
                              ? (acceptedIds.includes(item.id) ? "taken" : "declined")
                              : "pending")
                          : null;
                        return (
                          <div
                            key={item.id}
                            className={`flex items-start justify-between gap-3 px-3.5 py-3 ${i > 0 ? "border-t border-slate-200/80" : ""} ${optState === "declined" ? "opacity-55" : ""}`}
                            data-testid={`line-item-${item.id}`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                {isDiscount && <Tag className="h-3 w-3 shrink-0 text-amber-600" />}
                                <p className="text-sm font-medium text-slate-900">{item.description}</p>
                              </div>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {item.quantity} × {formatCurrency(item.unitPrice)}
                              </p>
                              {optState && (
                                <span
                                  className={`mt-1 inline-flex w-fit items-center rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                    optState === "taken"
                                      ? "bg-emerald-100 text-emerald-700"
                                      : optState === "declined"
                                        ? "bg-slate-200 text-slate-500"
                                        : "bg-[#711419]/10 text-[#711419]"
                                  }`}
                                  data-testid={`badge-addon-${optState}-${item.id}`}
                                >
                                  {optState === "taken" ? "Add-on · taken" : optState === "declined" ? "Add-on · declined" : "Optional add-on"}
                                </span>
                              )}
                            </div>
                            <span className={`shrink-0 text-sm font-semibold tabular-nums ${isDiscount ? "text-amber-700" : "text-slate-900"}`}>
                              {formatCurrency(item.lineTotal)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="space-y-1.5 border-t border-slate-200/80 bg-slate-50 px-3.5 py-3" data-testid="totals-card">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Subtotal</span>
                      <span className="font-medium tabular-nums" data-testid="subtotal">{formatCurrency(quote.subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">Total</span>
                      <span className="text-lg font-bold tabular-nums text-[#711419]" data-testid="total">{formatCurrency(quote.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Present to Client button - available for draft, sent, viewed quotes */}
                {(["draft", "sent", "viewed"] as string[]).includes(quote.status) && (
                  <button
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-[4px] bg-[#711419] text-base font-semibold text-white shadow-sm transition-transform active:scale-[0.98]"
                    onClick={() => navigate(`/mobile/quotes/${id}/present`)}
                    data-testid="button-present-quote"
                  >
                    <Monitor className="h-4 w-4" />
                    Present to Client
                  </button>
                )}

                {quote.status === "draft" && (
                  <button
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-[4px] border border-[#711419]/30 bg-white text-base font-semibold text-[#711419] transition-transform active:scale-[0.98] disabled:opacity-60"
                    onClick={openEmailDialog}
                    disabled={sendQuoteEmailMutation.isPending}
                    data-testid="button-send-quote"
                  >
                    {sendQuoteEmailMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    Send to Customer
                  </button>
                )}

                {quote.status === "sent" && (
                  <div className="flex gap-2">
                    <button
                      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[4px] bg-green-600 text-base font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
                      onClick={() => acceptMutation.mutate()}
                      disabled={acceptMutation.isPending || declineMutation.isPending}
                      data-testid="button-accept-quote"
                    >
                      {acceptMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )}
                      Accept
                    </button>
                    <button
                      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[4px] border border-red-200 bg-white text-base font-semibold text-red-600 transition-transform active:scale-[0.98] disabled:opacity-60"
                      onClick={() => declineMutation.mutate()}
                      disabled={acceptMutation.isPending || declineMutation.isPending}
                      data-testid="button-decline-quote"
                    >
                      {declineMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      Decline
                    </button>
                  </div>
                )}

                {quote.createdAt && (
                  <p className="text-center text-xs text-slate-400" data-testid="created-date">
                    Created {format(new Date(quote.createdAt), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                )}
              </div>
            )}
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

      {/* Preview — a full sheet (create-page look) rendering the SAME
          industrial document the customer sees on the public quote page:
          maroon accent bar, Prepared for, items, maroon total + financing. */}
      <DraggableSheet full open={showPreview} onOpenChange={setShowPreview} title="Quote preview" testid="quote-preview-sheet">
        <button
          onClick={() => setShowPreview(false)}
          className="absolute right-4 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-transform active:scale-90"
          aria-label="Close preview"
          data-testid="quote-preview-close"
        >
          <X className="h-5 w-5" />
        </button>
        {quote && (
          <div className="space-y-4 pb-6" data-testid="quote-preview">
            <div className="flex justify-center py-2">
              <img src={ghvacLogo} alt="Giesbrecht HVAC" className="h-14 w-auto object-contain" />
            </div>

            <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
              {/* Maroon accent bar — same industrial language as the public
                  quote page and the quote email */}
              <div className="h-1 w-full" style={{ backgroundColor: BRAND_COLOR }} />
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <p className="text-base font-bold tracking-tight text-slate-900">Quote #{quote.quoteNumber}</p>
                <span className="text-xs text-slate-500">
                  {quote.createdAt ? format(new Date(quote.createdAt), "MMM d, yyyy") : ""}
                </span>
              </div>
              <div className="space-y-4 p-4">
                <div className="rounded-[4px] border border-slate-300/70 bg-slate-50 p-3.5">
                  <h3 className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Prepared for</h3>
                  <p className="font-semibold text-slate-900">{quote.customerName}</p>
                  {quote.serviceAddress && <p className="text-sm text-slate-600">{quote.serviceAddress}</p>}
                  {quote.customerEmail && <p className="text-sm text-slate-600">{quote.customerEmail}</p>}
                </div>

                {quote.title && (
                  <h3 className="text-base font-semibold text-slate-900">{quote.title}</h3>
                )}

                <div className="overflow-hidden rounded-[4px] border border-slate-300/70">
                  <p className="border-b border-slate-200 bg-slate-100 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    Quote details
                  </p>
                  {clientVisibleItems.length === 0 ? (
                    <p className="px-3.5 py-5 text-center text-sm italic text-slate-400">No items listed</p>
                  ) : (
                    clientVisibleItems.map((item, i) => (
                      <div
                        key={item.id}
                        className={`flex items-start justify-between gap-3 px-3.5 py-3 ${i > 0 ? "border-t border-slate-100" : ""}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">{item.description}</p>
                          <p className="mt-0.5 text-xs text-slate-500">Qty {parseFloat(item.quantity || "1")}</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                          {formatCurrency(isSingleItem ? quote.total : item.lineTotal)}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2 rounded-[4px] border border-slate-300/70 bg-slate-50 p-3.5">
                  <div className="flex items-center justify-between text-lg font-bold" style={{ color: BRAND_COLOR }}>
                    <span>Total</span>
                    <span data-testid="preview-total">{formatCurrency(quote.total)}</span>
                  </div>
                  {isInstallQuote && monthlyFinancing(quote.total) > 0 && (
                    <div className="border-t border-slate-200 pt-2">
                      <div className="flex items-baseline justify-between text-sm font-medium text-slate-600">
                        <span>Or with approved financing</span>
                        <span data-testid="preview-monthly">~${monthlyFinancing(quote.total).toLocaleString()}/mo</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Estimate only — the exact payment depends on the plan and credit approval.
                      </p>
                    </div>
                  )}
                </div>

                {quote.validUntil && (
                  <p className="text-center text-sm text-slate-500">
                    This quote is valid until {format(new Date(quote.validUntil), "MMMM d, yyyy")}.
                  </p>
                )}
              </div>
            </div>

            <p className="text-center text-xs text-slate-400">
              {COMPANY_INFO.name} · {COMPANY_INFO.phone} · {COMPANY_INFO.website}
            </p>

            <button
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[4px] bg-[#711419] text-base font-semibold text-white shadow-sm transition-transform active:scale-[0.98]"
              onClick={() => {
                setShowPreview(false);
                handleDownloadPDF();
              }}
              data-testid="button-download-from-preview"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </button>
          </div>
        )}
      </DraggableSheet>

      {/* Send Quote Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={(open) => { if (!open) { setShowEmailDialog(false); setEmailRecipient(""); setPhoneRecipient(""); setSendViaEmail(true); setSendViaSms(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Quote</DialogTitle>
            <DialogDescription>
              Choose how you want to send this quote to the customer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="send-via-email"
                checked={sendViaEmail}
                onCheckedChange={(checked) => setSendViaEmail(checked === true)}
                data-testid="checkbox-send-via-email"
              />
              <Label htmlFor="send-via-email" className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                <Mail className="h-4 w-4" />
                Send via Email
              </Label>
            </div>
            {sendViaEmail && (
              <div className="ml-6">
                <Label htmlFor="email-recipient" className="text-sm font-medium">
                  Recipient Email
                </Label>
                <Input
                  id="email-recipient"
                  type="email"
                  placeholder="customer@example.com"
                  value={emailRecipient}
                  onChange={(e) => setEmailRecipient(e.target.value)}
                  className="min-h-[44px] mt-1"
                  data-testid="input-quote-email-recipient"
                />
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="send-via-sms"
                checked={sendViaSms}
                onCheckedChange={(checked) => setSendViaSms(checked === true)}
                data-testid="checkbox-send-via-sms"
              />
              <Label htmlFor="send-via-sms" className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                <MessageSquare className="h-4 w-4" />
                Send via SMS
              </Label>
            </div>
            {sendViaSms && (
              <div className="ml-6">
                <Label htmlFor="phone-recipient" className="text-sm font-medium">
                  Recipient Phone
                </Label>
                <Input
                  id="phone-recipient"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={phoneRecipient}
                  onChange={(e) => setPhoneRecipient(e.target.value)}
                  className="min-h-[44px] mt-1"
                  data-testid="input-quote-phone-recipient"
                />
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => { setShowEmailDialog(false); setEmailRecipient(""); setPhoneRecipient(""); setSendViaEmail(true); setSendViaSms(false); }}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              className="min-h-[44px] bg-[#711419] hover:bg-[#8a1a1f]"
              onClick={handleSendEmail}
              disabled={sendQuoteEmailMutation.isPending || (!sendViaEmail && !sendViaSms) || (sendViaEmail && !emailRecipient.trim()) || (sendViaSms && !phoneRecipient.trim())}
              data-testid="button-confirm-send-quote"
            >
              {sendQuoteEmailMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  {sendViaEmail && sendViaSms ? "Send Both" : sendViaSms ? "Send SMS" : "Send Email"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
