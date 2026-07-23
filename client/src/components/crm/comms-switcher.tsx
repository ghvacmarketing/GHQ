import { useEffect } from "react";
import { useLocation } from "wouter";
import { MessageSquare, Mail } from "lucide-react";

const ITEMS = [
  { key: "messages", label: "Messages", icon: MessageSquare, href: "/crm/messaging" },
  { key: "mail", label: "Mail", icon: Mail, href: "/crm/mail" },
] as const;

export type CommsTab = typeof ITEMS[number]["key"];

/** Segmented switcher for the Comms console — Phone, Messages, and Mail stay
 *  separate pages; this identical strip on each makes them feel like one console. */
export function CommsSwitcher({ active, bare = false }: { active: CommsTab; bare?: boolean }) {
  const [, navigate] = useLocation();

  // Remember the last-used Comms tab so the sidebar "Comms" item returns here.
  useEffect(() => {
    const href = ITEMS.find((i) => i.key === active)?.href;
    if (href) localStorage.setItem("crmCommsLastTab", href);
  }, [active]);

  // Same pill segmented control as the dispatch board's Day/Week/Month switch
  const control = (
    <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
      {ITEMS.map((it) => {
        const Icon = it.icon;
        const isActive = active === it.key;
        return (
          <button
            key={it.key}
            onClick={() => !isActive && navigate(it.href)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-all ${
              isActive ? "bg-white text-[#711419] shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
            data-testid={`comms-tab-${it.key}`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {it.label}
          </button>
        );
      })}
    </div>
  );

  if (bare) return control;
  return (
    <div className="flex shrink-0 items-center justify-center px-4 pb-2.5 pt-3">
      {control}
    </div>
  );
}
