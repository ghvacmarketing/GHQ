import { useLocation } from "wouter";
import { ArrowLeft, Megaphone } from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser } from "@shared/schema";

/** "/marketing/..." renders the standalone Marketing app chrome; the legacy
 *  "/crm/marketing/..." paths keep the CRM sidebar so old links still work. */
export function useMarketingBase(): string {
  const [location] = useLocation();
  return location.startsWith("/marketing") ? "/marketing" : "/crm/marketing";
}

export function MarketingChrome({
  currentUser,
  children,
}: {
  currentUser?: CrmUser;
  children: React.ReactNode;
}) {
  const [location, navigate] = useLocation();
  const standalone = location.startsWith("/marketing");

  if (!standalone) {
    return <CrmLayout currentUser={currentUser as CrmUser}>{children}</CrmLayout>;
  }

  return (
    <div className="flex h-screen flex-col bg-[#f4f5f6]">
      <header className="flex shrink-0 items-center gap-3 border-b border-black/[0.06] bg-white/85 px-4 py-2.5 backdrop-blur">
        <button
          onClick={() => navigate("/")}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          title="Back to apps"
          data-testid="button-back-apps"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Megaphone className="h-5 w-5 text-[#711419]" strokeWidth={1.75} />
        <span className="font-display text-[15px] font-semibold text-slate-900">Marketing</span>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
