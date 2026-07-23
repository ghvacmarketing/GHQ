import { useEffect } from "react";
import { useLocation } from "wouter";
import { Phone, MessageSquare, Mail } from "lucide-react";

const ITEMS = [
  { key: "phone", label: "Phone", icon: Phone, href: "/crm/phone" },
  { key: "messages", label: "Messages", icon: MessageSquare, href: "/crm/messaging" },
  { key: "mail", label: "Mail", icon: Mail, href: "/crm/mail" },
] as const;

export type CommsTab = typeof ITEMS[number]["key"];

/** Segmented switcher for the Comms console — Phone, Messages, and Mail stay
 *  separate pages; this strip makes them feel like one console. */
export function CommsSwitcher({
  active,
  variant = "flush",
}: {
  active: CommsTab;
  /** "flush" = full-width bar for edge-to-edge pages; "inline" = plain row inside padded pages. */
  variant?: "flush" | "inline";
}) {
  const [, navigate] = useLocation();

  // Remember the last-used Comms tab so the sidebar "Comms" item returns here.
  useEffect(() => {
    const href = ITEMS.find((i) => i.key === active)?.href;
    if (href) localStorage.setItem("crmCommsLastTab", href);
  }, [active]);

  const control = (
    <div className="flex items-center">
      <div className="flex w-fit overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
        {ITEMS.map((it, i) => {
          const Icon = it.icon;
          const isActive = active === it.key;
          return (
            <button
              key={it.key}
              onClick={() => !isActive && navigate(it.href)}
              className={`flex h-8 items-center gap-1.5 px-3 text-[13px] font-medium transition-colors ${
                i > 0 ? "border-l border-slate-300/70" : ""
              } ${isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              data-testid={`comms-tab-${it.key}`}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  if (variant === "inline") return <div className="mb-3 flex justify-center">{control}</div>;
  return (
    <div className="flex shrink-0 items-center justify-center border-b border-slate-200/80 bg-white/85 px-4 py-2">
      {control}
    </div>
  );
}
