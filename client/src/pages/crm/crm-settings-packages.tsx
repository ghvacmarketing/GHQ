import { useEffect, useRef, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package } from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { openGlobalAI } from "@/components/crm/ghq-search";
import badgeGibbs from "@/assets/badge-gibbs.png";
import type { CrmUser } from "@shared/schema";
import { PriceFileWizardCard, CostsAndCatalogTab, BuilderTab } from "@/pages/crm/packages-pricing-tools";
import PricingGibbsPanel from "@/components/crm/pricing-gibbs-panel";

/** Package pricing, three tabs:
 *  - Costs & Catalog: Package Equipment (drift + repricing baked in), the
 *    live-preview Job Cost Model, and the Equipment Catalog.
 *  - Proposal Builder: add/duplicate packages per section + the section
 *    manager (order, names, blurbs, visibility) — what the builder renders.
 *  - Price File Update: the supplier flat-file wizard.
 *  The old CSV package import, bulk % adjustments, and editable price table
 *  were removed 2026-08 — repricing happens per package in Package Equipment. */
export default function CrmSettingsPackages() {
  usePageTitle("Package Pricing Management");
  const [, navigate] = useLocation();
  const [pageTab, setPageTab] = useState<"costs" | "builder" | "pricefile">("costs");
  // The panel sizes itself to the gutter right of this container.
  const boundaryRef = useRef<HTMLDivElement | null>(null);
  // The docked Pricing Gibbs panel — remembered across visits.
  const [gibbsOpen, setGibbsOpen] = useState(() => {
    try { return localStorage.getItem("pricing-gibbs-panel") === "1"; } catch { return false; }
  });
  const toggleGibbs = () => {
    // Small screens have no room for a docked panel — the full Gibbs opens instead.
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      openGlobalAI();
      return;
    }
    setGibbsOpen((v) => {
      try { localStorage.setItem("pricing-gibbs-panel", v ? "0" : "1"); } catch { /* private mode */ }
      return !v;
    });
  };

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: packages } = useQuery<any[]>({
    queryKey: ["/api/pricebook/packages"],
    enabled: !!currentUser,
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  if (authLoading || !currentUser) return null;

  const isAdmin = currentUser.role === "owner" || currentUser.role === "admin" || currentUser.role === "supervisor";
  const canManage = isAdmin || currentUser.role === "sales";

  if (!canManage) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground mb-6">Package Pricing Management</h1>
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              <Package className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>Only administrators and sales users can manage package pricing.</p>
            </CardContent>
          </Card>
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div ref={boundaryRef} className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/crm/settings")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Package Pricing Management</h1>
            <p className="text-sm text-slate-500">What your packages cost, what they earn, and the supplier files that keep it current</p>
          </div>
          {/* Native Gibbs: docks the pricing-scoped panel (small screens get
              the full assistant instead). Screen context rides every ask. */}
          <Button
            variant="outline"
            size="sm"
            className={`ml-auto h-9 gap-2 ${gibbsOpen ? "border-[#711419]/40 bg-[#711419]/[0.05] text-[#711419]" : ""}`}
            onClick={toggleGibbs}
            data-testid="pricing-ask-gibbs"
          >
            <img src={badgeGibbs} alt="" className="h-5 w-5" />
            {gibbsOpen ? "Gibbs is here" : "Ask Gibbs"}
          </Button>
        </div>

        {/* Segmented control matches the Inbox/Mail filter tabs. */}
        <div className="mb-4 flex w-full max-w-md items-center gap-0.5 rounded-md bg-slate-100 p-0.5">
          {([
            ["costs", "Costs & Catalog"],
            ["builder", "Proposal Builder"],
            ["pricefile", "Price File Update"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setPageTab(value)}
              className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                pageTab === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
              data-testid={`tab-page-${value}`}
            >
              {label}
            </button>
          ))}
        </div>

        {pageTab === "costs" && <CostsAndCatalogTab packages={packages} />}
        {pageTab === "builder" && <BuilderTab packages={packages} />}
        {pageTab === "pricefile" && (
          <div className="space-y-6">
            <PriceFileWizardCard />
          </div>
        )}

        {/* True side panel — fixed to the right edge, slides over the page,
            never reflows the content. */}
        {gibbsOpen && <PricingGibbsPanel onClose={toggleGibbs} boundaryRef={boundaryRef} />}
      </div>
    </CrmLayout>
  );
}
