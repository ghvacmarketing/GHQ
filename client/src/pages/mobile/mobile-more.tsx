import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import MobileShell from "./mobile-shell";
import {
  Camera, ChevronRight, Clock, ClipboardList, MessageSquare, Monitor,
  Sparkles, UserRound, Users, Wrench,
} from "lucide-react";
import type { CrmUser } from "@shared/schema";

/** The More page — everything you can BROWSE, grouped by category. Creation
 *  lives behind the floating "+" button; this is the directory. */

type MoreItem = {
  label: string;
  sub?: string;
  icon: typeof Users;
  onTap: (navigate: (p: string) => void) => void;
  testid: string;
};

export default function MobileMore() {
  const [, navigate] = useLocation();

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const sections: Array<{ title: string; items: MoreItem[] }> = [
    {
      title: "People & Comms",
      items: [
        { label: "Customers", sub: "Search every customer and their history", icon: Users, onTap: (n) => n("/mobile/customers"), testid: "more-customers" },
        { label: "Messages", sub: "Text conversations with customers", icon: MessageSquare, onTap: (n) => n("/mobile/messages"), testid: "more-messages" },
        {
          label: "Ask Gibbs", sub: "AI help — lookups, drafts, and actions", icon: Sparkles,
          onTap: () => window.dispatchEvent(new Event("ghq-mobile-open-assistant")), testid: "more-assistant",
        },
      ],
    },
    {
      title: "Work",
      items: [
        { label: "My Jobs", sub: "Today, upcoming, and history", icon: Wrench, onTap: (n) => n("/mobile/job"), testid: "more-jobs" },
        { label: "Photos", sub: "Job-site shots and required photos", icon: Camera, onTap: (n) => n("/mobile/photos"), testid: "more-photos" },
        { label: "Time & Timesheet", sub: "Clock in and review your hours", icon: Clock, onTap: (n) => n("/mobile/time"), testid: "more-time" },
        { label: "Agenda", sub: "Your day at a glance", icon: ClipboardList, onTap: (n) => n("/mobile"), testid: "more-agenda" },
      ],
    },
    {
      title: "Account",
      items: [
        { label: "My Profile", sub: "Your info and settings", icon: UserRound, onTap: (n) => n("/mobile/profile"), testid: "more-profile" },
        ...(currentUser && currentUser.role !== "tech"
          ? [{
              label: "Desktop CRM", sub: "Open the full CRM", icon: Monitor,
              onTap: (n: (p: string) => void) => n("/crm"), testid: "more-desktop",
            }]
          : []),
      ],
    },
  ];

  return (
    <MobileShell>
      <div className="p-4 space-y-5" data-testid="mobile-more-page">
        {sections.map((section) => (
          <div key={section.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{section.title}</h3>
            <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
              {section.items.map((item, i) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={() => item.onTap(navigate)}
                    className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                    data-testid={item.testid}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] border border-[#711419]/20 bg-[#711419]/5 text-[#711419]">
                      <Icon className="h-4.5 w-4.5" style={{ height: 18, width: 18 }} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                      {item.sub && <span className="block truncate text-xs text-slate-500">{item.sub}</span>}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </MobileShell>
  );
}
