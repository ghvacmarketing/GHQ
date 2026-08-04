import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Home, Receipt, FileText, Wrench, UserRound } from "lucide-react";

/**
 * Customer-portal shell in the mobile app's language: soft slate canvas, a
 * centered column, and a frosted bottom tab bar (rounded top, maroon active
 * state) instead of the old banner header + footer. Pages own their headers;
 * this owns navigation and keyboard behavior.
 */

const navTabs = [
  { path: "/portal/dashboard", label: "Home", icon: Home },
  { path: "/portal/quotes", label: "Quotes", icon: FileText },
  { path: "/portal/invoices", label: "Invoices", icon: Receipt },
  { path: "/portal/service-history", label: "History", icon: Wrench },
  { path: "/portal/profile", label: "Profile", icon: UserRound },
];

export function PortalLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

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
    return () => {
      clearTimeout(blurT);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  const isActive = (path: string) => {
    if (path === "/portal/invoices") return location.startsWith("/portal/invoice");
    return location.startsWith(path);
  };

  return (
    <div
      className="min-h-dvh bg-slate-50"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      data-testid="portal-layout"
    >
      <main
        className="mx-auto w-full max-w-xl px-4 pt-5 animate-in fade-in duration-200"
        style={{ paddingBottom: "calc(104px + env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>

      {/* Frosted bottom tab bar — same chrome as the Field app */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 transition-all duration-150 ${keyboardUp ? "pointer-events-none translate-y-full opacity-0" : ""}`}
        style={{ touchAction: "none" }}
        data-testid="portal-nav"
      >
        <nav
          className="mx-auto max-w-xl rounded-t-3xl border-t-2 border-slate-300/80 bg-[#e9ebee]/95 shadow-[0_-6px_24px_rgba(0,0,0,0.07)] backdrop-blur-xl"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-stretch justify-around px-2 pb-2 pt-2.5">
            {navTabs.map((tab) => {
              const active = isActive(tab.path);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.path}
                  href={tab.path}
                  data-testid={`portal-tab-${tab.label.toLowerCase()}`}
                  className="flex flex-1 flex-col items-center gap-1 py-0.5 transition-transform active:scale-95"
                >
                  <Icon className={`h-6 w-6 ${active ? "text-[#711419]" : "text-slate-500"}`} strokeWidth={active ? 2 : 1.75} />
                  <span className={`text-[11px] leading-none ${active ? "font-semibold text-[#711419]" : "font-medium text-slate-500"}`}>
                    {tab.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

/** Page heading in the app's voice: bold tight title + quiet subline. */
export function PortalHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900" data-testid="text-page-title">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
